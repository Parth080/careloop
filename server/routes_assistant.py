"""The assistant over a care profile's own records: a summary to take to a doctor visit, and answers to
questions. Both name the records they came from, and code checks them against those records."""

import logging
from dataclasses import asdict
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request

from .ai import (
    NOT_SET_UP,
    AIClient,
    OptionalAIClient,
    answer_is_confirmed,
    answer_question,
    assistant_model,
    check_ai_limits,
    check_answer,
    checker_model,
    friendly_ai_errors,
    summarize_notes,
)
from .db import Medication
from .records import (
    DoseCounts,
    care_records,
    day_start,
    dose_counts,
    dose_logs_between,
    local_now,
    logs_by_medicine,
    medicines_between,
    moment_text,
    note_content,
    note_text,
    phone_zone,
    shared_notes_between,
)
from .routes_appointments import appointment_out, find_appointment
from .routes_notes import note_out
from .schemas import AskRequest, AskResponse, AskSource, DoseCountsOut, SummaryMedicine, SummaryPoint, SummaryRequest, VisitSummary
from .security import DB, CurrentMember, client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["assistant"])
MOST_SOURCES = 12  # enough to check an answer; a model sometimes names every record


def summary_medicine(medicine: Medication, counts: DoseCounts | None) -> SummaryMedicine:
    return SummaryMedicine(
        id=medicine.id,
        name=medicine.name,
        strength=medicine.strength,
        dose=medicine.dose,
        times=medicine.times,
        food=medicine.food,
        as_needed=medicine.as_needed,
        start_date=medicine.start_date,
        end_date=medicine.end_date,
        doses=DoseCountsOut(**asdict(counts)) if counts else None,
    )


@router.post("/summary")
def visit_summary(body: SummaryRequest, request: Request, me: CurrentMember, db: DB, client: OptionalAIClient) -> VisitSummary:
    zone, now = phone_zone(body.utc_offset_minutes), local_now(body.utc_offset_minutes)
    appointment = find_appointment(db, me, body.appointment_id) if body.appointment_id else None
    logs = logs_by_medicine(dose_logs_between(db, me.profile_id, body.from_day, body.to_day))
    medicines = [
        summary_medicine(medicine, dose_counts(medicine, logs[medicine.id], body.from_day, body.to_day, now))
        for medicine in medicines_between(db, me.profile_id, body.from_day, body.to_day)
    ]
    notes, left_out = shared_notes_between(
        db, me.profile_id, day_start(body.from_day, zone), day_start(body.to_day + timedelta(days=1), zone)
    )
    person_name = me.profile.person_name
    summary = VisitSummary(
        person_name=person_name,
        from_day=body.from_day,
        to_day=body.to_day,
        appointment=appointment_out(appointment) if appointment else None,
        medicines=medicines,
        points=[],
        notes=[note_out(note) for note in notes],
        notes_left_out=left_out,
        model=None,
        checked_by=None,
        problem=None,
    )
    note_texts, note_contents = [note_text(note, zone) for note in notes], [note_content(note) for note in notes]
    db.close()  # summarizing takes several seconds; don't hold a database connection meanwhile
    if not notes:
        return summary  # medicines and doses alone need no assistant
    if client is None:
        summary.problem = f"{NOT_SET_UP} The notes are all listed below."
        return summary
    try:
        check_ai_limits(me.profile_id, client_ip(request))
        with friendly_ai_errors("Couldn't summarize the notes this time. They're all listed below."):
            points, proposed = summarize_notes(client, person_name, note_texts, note_contents)
    except HTTPException as exc:  # still useful without the points: medicines, doses and every note
        summary.problem = str(exc.detail)
        return summary
    except Exception:  # any other surprise in the model's reply must not cost the family the whole summary
        logger.exception("Summarizing notes failed")
        summary.problem = "Couldn't summarize the notes this time. They're all listed below."
        return summary
    summary.points = [
        SummaryPoint(section=point.section, text=point.text, note_ids=[notes[number - 1].id for number in point.notes])
        for point in points
    ]
    summary.model, summary.checked_by = assistant_model(), checker_model()
    if not points:
        summary.problem = (
            "None of the assistant's points could be checked against the notes, so the notes are listed below instead."
            if proposed
            else "Nothing in the notes needed a summary point. They're all listed below."
        )
    return summary


@router.post("/ask")
def ask(body: AskRequest, request: Request, me: CurrentMember, db: DB, client: AIClient) -> AskResponse:
    check_ai_limits(me.profile_id, client_ip(request))
    now = local_now(body.utc_offset_minutes)
    records = {record.label: record for record in care_records(db, me, now)}
    db.close()
    now_text = moment_text(now, phone_zone(body.utc_offset_minutes))
    texts = {label: record.text for label, record in records.items()}
    with friendly_ai_errors("The assistant couldn't answer that. Please try asking another way."):
        draft = answer_question(client, body.question, now_text, list(texts.items()))
    kind, answer, cited = check_answer(draft, texts, body.question)
    checked_by = None
    if kind == "answer" and answer:
        if answer_is_confirmed(client, answer, "\n".join(texts[label] for label in cited)):
            checked_by = checker_model()
        else:
            kind, answer = "records", None
    return AskResponse(
        kind=kind,
        answer=answer,
        sources=[AskSource(kind=records[label].kind, text=records[label].text) for label in cited[:MOST_SOURCES]],
        urgent=draft.urgent,
        model=assistant_model(),
        checked_by=checked_by,
    )
