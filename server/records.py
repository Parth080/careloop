"""A care profile's records, gathered for a doctor-visit summary or a question: how the doses went, and every
record worded as one plain line that the assistant can point to and people can check."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .db import Appointment, DoseLog, Medication, Member, Note, TrustedContact, utcnow

CATEGORY_WORDS = {"symptom": "Symptom", "appointment": "Appointment", "medication": "Medicine", "doctor": "Doctor", "general": "Other"}
FOOD_WORDS = {"before_food": "before food", "after_food": "after food", "with_food": "with food"}
MOST_SUMMARY_NOTES = 100
MOST_QUESTION_NOTES = 150
MOST_QUESTION_MEDICINES = 60  # with the appointments, keeps a question's prompt to a sensible size
MOST_QUESTION_APPOINTMENTS = 60
MOST_QUESTION_DOSES = 200
RECENT_DOSE_DAYS = 3  # each dose of the last few days is listed, so "did she take her medicines today?" can be answered
DOSE_COUNT_DAYS = 14  # longer than that, the question gets counts per medicine


def phone_zone(utc_offset_minutes: int) -> timezone:
    return timezone(timedelta(minutes=utc_offset_minutes))


def local_now(utc_offset_minutes: int) -> datetime:
    return utcnow().astimezone(phone_zone(utc_offset_minutes))


def day_start(day: date, zone: timezone) -> datetime:
    return datetime.combine(day, time.min, tzinfo=zone)


def clock_text(clock: str) -> str:
    """ "21:00" as "9:00 PM", the way the app shows times."""
    hours, minutes = map(int, clock.split(":"))
    return f"{hours % 12 or 12}:{minutes:02d} {'AM' if hours < 12 else 'PM'}"


def day_text(day: date, today: date | None = None) -> str:
    """ "Tue 6 Oct 2026", and given today, "Tue 6 Oct 2026 (yesterday)": without it, models misjudge "this morning"."""
    text = f"{day:%a} {day.day} {day:%b %Y}"
    if today is None:
        return text
    offset = (day - today).days
    relative = {0: "today", -1: "yesterday", 1: "tomorrow"}.get(offset) or (f"{-offset} days ago" if offset < 0 else f"in {offset} days")
    return f"{text} ({relative})"


def moment_text(moment: datetime, zone: tzinfo, today: date | None = None) -> str:
    local = moment.astimezone(zone)
    return f"{day_text(local.date(), today)}, {clock_text(f'{local:%H:%M}')}"


@dataclass
class DoseCounts:
    due: int
    taken: int
    skipped: int
    not_marked: int


def dose_counts(medicine: Medication, logs: list[DoseLog], first: date, last: date, now: datetime) -> DoseCounts | None:
    """How a medicine's doses between two days went, up to `now` (local time). None for medicines taken only when
    needed: they have no schedule to count against.

    Every marked dose counts. An unmarked one counts as "not marked" only from when CareLoop could have marked it:
    not before the medicine was added (its start date may be years earlier), and not under an older schedule. A dose
    marked at a time that is no longer scheduled shows the schedule changed after that day."""
    if medicine.as_needed:
        return None
    marks = {(log.day, log.time): log.status for log in logs if log.medication_id == medicine.id and first <= log.day <= last}
    tracked_from = max(first, medicine.start_date, medicine.created_at.astimezone(now.tzinfo).date())
    old_schedule = [day for day, clock in marks if clock not in medicine.times]
    if old_schedule:
        tracked_from = max(tracked_from, max(old_schedule) + timedelta(days=1))
    due = set()
    day, end = tracked_from, min(last, medicine.end_date or last, now.date())
    while day <= end:
        due.update((day, clock) for clock in medicine.times if datetime.combine(day, time.fromisoformat(clock), now.tzinfo) <= now)
        day += timedelta(days=1)
    statuses = list(marks.values())
    return DoseCounts(
        due=len(due | marks.keys()),
        taken=statuses.count("taken"),
        skipped=statuses.count("skipped"),
        not_marked=len(due - marks.keys()),
    )


def logs_by_medicine(logs: list[DoseLog]) -> defaultdict[int, list[DoseLog]]:
    grouped: defaultdict[int, list[DoseLog]] = defaultdict(list)
    for log in logs:
        grouped[log.medication_id].append(log)
    return grouped


def counts_text(counts: DoseCounts) -> str:
    if counts.due == 0:
        return "no doses due yet"
    return f"taken {counts.taken} of {counts.due} doses, skipped {counts.skipped}, not marked {counts.not_marked}"


def medicines_between(db: Session, profile_id: int, first: date, last: date) -> list[Medication]:
    return list(
        db.scalars(
            select(Medication)
            .where(
                Medication.profile_id == profile_id,
                Medication.start_date <= last,
                or_(Medication.end_date.is_(None), Medication.end_date >= first),
            )
            .order_by(Medication.start_date, Medication.id)
        )
    )


def dose_logs_between(db: Session, profile_id: int, first: date, last: date) -> list[DoseLog]:
    return list(
        db.scalars(
            select(DoseLog)
            .where(DoseLog.profile_id == profile_id, DoseLog.day >= first, DoseLog.day <= last)
            .options(selectinload(DoseLog.recorded_by))
        )
    )


def shared_notes_between(db: Session, profile_id: int, since: datetime, until: datetime) -> tuple[list[Note], int]:
    """The newest shared notes written in [since, until), oldest first, and how many older ones were left out.
    Private notes never go into a summary: it is meant to be shared."""
    period = (Note.profile_id == profile_id, Note.private.is_(False), Note.created_at >= since, Note.created_at < until)
    total = db.scalar(select(func.count()).select_from(Note).where(*period)) or 0
    newest = db.scalars(
        select(Note)
        .where(*period)
        .options(selectinload(Note.created_by), selectinload(Note.updated_by))
        .order_by(Note.created_at.desc(), Note.id.desc())
        .limit(MOST_SUMMARY_NOTES)
    ).all()
    return list(reversed(newest)), total - len(newest)


def note_content(note: Note) -> str:
    """What a note says, without when or by whom it was written."""
    return " ".join(filter(None, [note.title, note.details, note.event_time_text]))


def note_text(note: Note, zone: tzinfo, today: date | None = None) -> str:
    by = f" by {note.created_by.name}" if note.created_by else ""
    when = f" (when, as said at the time: {note.event_time_text})" if note.event_time_text else ""
    private = " This note is private." if note.private else ""
    return f"Note written {moment_text(note.created_at, zone, today)}{by}. {CATEGORY_WORDS[note.category]}: {note.title}. {note.details}{when}{private}"


def medicine_text(medicine: Medication, counts: DoseCounts | None, today: date | None = None) -> str:
    about = ", ".join(filter(None, [medicine.strength, medicine.form]))
    when = "only when needed" if medicine.as_needed else "at " + " and ".join(clock_text(clock) for clock in medicine.times)
    amount = f"{medicine.dose} " if medicine.dose else ""
    food = f", {FOOD_WORDS[medicine.food]}" if medicine.food else ""
    period = f"from {day_text(medicine.start_date, today)}" + (f" to {day_text(medicine.end_date, today)}" if medicine.end_date else ", ongoing")
    text = f"Medicine {medicine.name}{f' ({about})' if about else ''}: {amount}{when}{food}; {period}."
    if medicine.instructions:
        text += f" Instructions: {medicine.instructions}."
    if counts and counts.due:
        text += f" Last {DOSE_COUNT_DAYS} days: {counts_text(counts)}."
    return text


def appointment_text(appointment: Appointment, today: date | None = None) -> str:
    when = f"{day_text(appointment.day, today)}, {clock_text(appointment.time) if appointment.time else 'time not set'}"
    parts = [f"Appointment on {when}: {appointment.title}."]
    if appointment.with_whom:
        parts.append(f"With {appointment.with_whom}.")
    if appointment.place:
        parts.append(f"At {appointment.place}.")
    if appointment.notes:
        parts.append(f"Notes: {appointment.notes}")
    return " ".join(parts)


@dataclass
class Record:
    label: str  # how the assistant refers to it, such as "N3"
    kind: str  # note, medicine, dose, appointment or contact
    text: str


def care_records(db: Session, me: Member, now: datetime) -> list[Record]:
    """Everything a member may see, worded for answering a question: contacts, medicines with recent dose
    counts, each dose of the last few days, appointments, and the newest notes (theirs, private ones too)."""
    zone, today = now.tzinfo or timezone.utc, now.date()
    records: list[Record] = []

    def add(prefix: str, kind: str, text: str) -> None:
        records.append(Record(f"{prefix}{sum(record.kind == kind for record in records) + 1}", kind, text))

    for contact in db.scalars(select(TrustedContact).where(TrustedContact.profile_id == me.profile_id).order_by(TrustedContact.role)):
        add("C", "contact", f"{'Emergency contact' if contact.role == 'emergency' else 'Doctor'}: {contact.name}, phone {contact.phone}")

    first = today - timedelta(days=DOSE_COUNT_DAYS - 1)
    logs = logs_by_medicine(dose_logs_between(db, me.profile_id, first, today))
    medicines = list(
        db.scalars(
            select(Medication)
            .where(Medication.profile_id == me.profile_id)
            .order_by(Medication.start_date.desc(), Medication.id)
            .limit(MOST_QUESTION_MEDICINES)
        )
    )
    for medicine in medicines:
        add("M", "medicine", medicine_text(medicine, dose_counts(medicine, logs[medicine.id], first, today, now), today))

    marks = {(log.medication_id, log.day, log.time): log for medicine_logs in logs.values() for log in medicine_logs}
    for day in (today - timedelta(days=offset) for offset in range(RECENT_DOSE_DAYS - 1, -1, -1)):
        for medicine in medicines:
            active = not medicine.as_needed and medicine.start_date <= day and (medicine.end_date is None or day <= medicine.end_date)
            for clock in medicine.times if active else []:
                log = marks.get((medicine.id, day, clock))
                if log:
                    by = f" by {log.recorded_by.name}" if log.recorded_by else ""
                    status = f"{log.status} (marked{by} {moment_text(log.recorded_at, zone, today)})"
                elif datetime.combine(day, time.fromisoformat(clock), zone) <= now:
                    status = "not marked"
                else:
                    status = "not due yet"
                amount = f" ({medicine.dose})" if medicine.dose else ""
                if sum(record.kind == "dose" for record in records) < MOST_QUESTION_DOSES:
                    add("D", "dose", f"Dose due {day_text(day, today)}, {clock_text(clock)}: {medicine.name}{amount}, {status}.")

    appointments = db.scalars(
        select(Appointment)
        .where(Appointment.profile_id == me.profile_id, Appointment.day >= today - timedelta(days=365))
        .order_by(Appointment.day, Appointment.time.is_(None), Appointment.time, Appointment.id)
        .limit(MOST_QUESTION_APPOINTMENTS)
    )
    for appointment in appointments:
        add("A", "appointment", appointment_text(appointment, today))

    notes = db.scalars(
        select(Note)
        .where(Note.profile_id == me.profile_id, or_(Note.private.is_(False), Note.created_by_id == me.id))
        .options(selectinload(Note.created_by))
        .order_by(Note.created_at.desc(), Note.id.desc())
        .limit(MOST_QUESTION_NOTES)
    )
    for note in notes:
        add("N", "note", note_text(note, zone, today))
    return records
