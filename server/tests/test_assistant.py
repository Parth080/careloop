from datetime import datetime, timedelta, timezone

import httpx
import pytest
from openai import APITimeoutError
from sqlalchemy import update

from server import ai, records
from server.db import Medication, Note, SessionLocal
from server.main import app
from server.schemas import AnswerDraft, SummaryDraft

from .helpers import auth, invite_and_join, new_profile

IST = timezone(timedelta(minutes=330))
NOW = datetime(2026, 10, 6, 12, 0, tzinfo=IST)  # noon on Tuesday 6 October, in India
PERIOD = {"from_day": "2026-10-04", "to_day": "2026-10-06", "utc_offset_minutes": 330}


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(records, "utcnow", lambda: NOW.astimezone(timezone.utc))


def written_at(model, row_id: int, moment: datetime) -> None:
    with SessionLocal() as db:  # as if saved then
        db.execute(update(model).where(model.id == row_id).values(created_at=moment))
        db.commit()


def add_note(client, token: str, written: datetime, title: str, details: str, private: bool = False) -> int:
    note = {"category": "symptom", "title": title, "details": details, "event_time_text": None, "private": private}
    note_id = client.post("/api/notes", json=note, headers=auth(token)).json()["id"]
    written_at(Note, note_id, written)
    return note_id


def add_medicine(client, token: str, added: datetime = datetime(2026, 10, 1, 9, 0, tzinfo=IST), **fields) -> int:
    body = {"name": "Telma 40", "dose": "1 tablet", "times": ["08:00", "21:00"], "start_date": "2026-10-04", **fields}
    response = client.post("/api/medicines", json=body, headers=auth(token))
    assert response.status_code == 201, response.text
    written_at(Medication, response.json()["id"], added)
    return response.json()["id"]


def mark(client, token: str, medicine_id: int, day: str, time: str, status: str = "taken") -> None:
    body = {"medication_id": medicine_id, "day": day, "time": time, "status": status}
    assert client.put("/api/doses", json=body, headers=auth(token)).status_code == 200


def checked(fake_ai, *supported: bool) -> None:
    """Queue the second model's verdicts, one per claim."""
    verdicts = [{"claim": number, "supported": verdict} for number, verdict in enumerate(supported, 1)]
    fake_ai.reply_with_tool("report_checks", {"verdicts": verdicts})


def test_summary_counts_doses_and_keeps_only_points_that_pass_both_checks(client, fake_ai):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    telma = add_medicine(client, priya["token"])
    add_medicine(client, priya["token"], name="Dolo 650", times=[], as_needed=True)
    add_medicine(client, priya["token"], name="Old cough syrup", start_date="2026-09-01", end_date="2026-10-01")
    mark(client, asha["token"], telma, "2026-10-04", "08:00")
    mark(client, asha["token"], telma, "2026-10-04", "21:00", "skipped")
    mark(client, priya["token"], telma, "2026-10-05", "08:00")
    dizzy = add_note(client, asha["token"], datetime(2026, 10, 4, 0, 10, tzinfo=IST), "Dizzy", "Felt dizzy after waking up")
    knee = add_note(client, asha["token"], datetime(2026, 10, 5, 10, 0, tzinfo=IST), "Knee pain", "My knee hurts on the stairs")
    add_note(client, asha["token"], datetime(2026, 10, 5, 11, 0, tzinfo=IST), "Private", "Only for me", private=True)
    add_note(client, asha["token"], datetime(2026, 10, 3, 23, 50, tzinfo=IST), "Too early", "The day before the period")
    fake_ai.reply_with_tool("summarize_notes", {"points": [
        {"section": "symptoms", "text": "Knee hurts on the stairs", "notes": [2]},
        {"section": "symptoms", "text": "Dizzy for 10 minutes after waking", "notes": [1]},  # "10" is only in its time, 12:10
        {"section": "questions", "text": "Ask about the knee", "notes": [7]},  # there is no note 7
        {"section": "symptom", "text": "Felt dizzy after waking up", "notes": "1"},
        {"section": "symptoms", "text": "Dizziness is from the BP tablets", "notes": [1]},
    ]})
    checked(fake_ai, True, True, False)  # the three points left after the code's checks; the last adds a cause

    response = client.post("/api/summary", json=PERIOD, headers=auth(priya["token"]))

    assert response.status_code == 200, response.text
    summary = response.json()
    counts = {medicine["name"]: medicine["doses"] for medicine in summary["medicines"]}
    # Due by noon on the 6th: both doses on the 4th and 5th, and the morning dose on the 6th.
    assert counts == {"Telma 40": {"due": 5, "taken": 2, "skipped": 1, "not_marked": 2}, "Dolo 650": None}
    assert [note["id"] for note in summary["notes"]] == [dizzy, knee]  # shared, inside the period in India's time zone
    assert [(point["section"], point["text"], point["note_ids"]) for point in summary["points"]] == [
        ("symptoms", "Knee hurts on the stairs", [knee]),
        ("symptoms", "Felt dizzy after waking up", [dizzy]),
    ]
    assert (summary["person_name"], summary["problem"]) == ("Asha", None)
    assert (summary["model"], summary["checked_by"]) == (ai.assistant_model(), ai.checker_model())
    summarize, check = fake_ai.requests
    sent = summarize["messages"][-1]["content"]
    assert "[1] Note written Sun 4 Oct 2026, 12:10 AM by Asha. Symptom: Dizzy." in sent
    assert "Only for me" not in sent and "The day before" not in sent
    assert check["model"] == ai.checker_model()
    assert "Claim 3: Dizziness is from the BP tablets\nIts records:\nNote written Sun 4 Oct 2026" in check["messages"][-1]["content"]


def test_dose_counts_start_when_careloop_could_have_marked_them(client, fake_ai):
    asha = new_profile(client)
    # Started years ago, but only added to CareLoop on the morning of the 5th: earlier doses can't be "not marked".
    old = add_medicine(client, asha["token"], added=datetime(2026, 10, 5, 7, 0, tzinfo=IST), start_date="2024-01-01")
    # Taken at 08:00 and 21:00 until the 5th, then moved to 09:00: the old times don't count against the new one.
    moved = add_medicine(client, asha["token"], name="Glycomet 500")
    for day in ("2026-10-04", "2026-10-05"):
        for time in ("08:00", "21:00"):
            mark(client, asha["token"], moved, day, time)
    change = {"name": "Glycomet 500", "times": ["09:00"], "start_date": "2026-10-04"}
    assert client.put(f"/api/medicines/{moved}", json=change, headers=auth(asha["token"])).status_code == 200

    summary = client.post("/api/summary", json=PERIOD, headers=auth(asha["token"])).json()

    counts = {medicine["id"]: medicine["doses"] for medicine in summary["medicines"]}
    assert counts[old] == {"due": 3, "taken": 0, "skipped": 0, "not_marked": 3}  # the 5th at 8 AM and 9 PM, the 6th at 8 AM
    assert counts[moved] == {"due": 5, "taken": 4, "skipped": 0, "not_marked": 1}  # the four marked, and 09:00 on the 6th


def test_summary_without_notes_needs_no_assistant_or_even_a_key(client, fake_ai):
    asha = new_profile(client)
    add_medicine(client, asha["token"])
    app.dependency_overrides[ai.get_optional_ai_client] = lambda: None  # a server without a Nebius key

    summary = client.post("/api/summary", json=PERIOD, headers=auth(asha["token"])).json()
    assert (summary["points"], summary["notes"], summary["model"], summary["problem"]) == ([], [], None, None)
    assert summary["medicines"][0]["doses"]["not_marked"] == 5

    add_note(client, asha["token"], datetime(2026, 10, 5, 10, 0, tzinfo=IST), "Knee pain", "My knee hurts")
    summary = client.post("/api/summary", json=PERIOD, headers=auth(asha["token"])).json()
    assert summary["problem"].startswith("The assistant is not set up on the server yet.")
    assert len(summary["notes"]) == 1
    assert fake_ai.requests == []


@pytest.mark.parametrize(
    ("replies", "problem"),
    [
        ([APITimeoutError(request=httpx.Request("POST", "https://example.test"))], "The assistant took too long. Please try again."),
        ([{"points": [{"section": "symptoms", "text": "Knee hurts", "notes": [1]}]}, None, None], "Couldn't summarize the notes"),
        ([{"points": [{"section": "symptoms", "text": "Knee hurts", "notes": [1]}]}, "verdict: False"], "None of the assistant's points"),
        ([{"points": []}], "Nothing in the notes needed a summary point"),
        ([{"points": [{"section": "symptoms", "text": "Knee", "notes": 10**400}]}], "None of the assistant's points"),
    ],
    ids=["timeout", "checker-fails", "all-points-rejected", "no-points", "huge-note-number"],
)
def test_the_summary_still_arrives_when_the_assistant_fails(client, fake_ai, replies, problem):
    asha = new_profile(client)
    add_note(client, asha["token"], datetime(2026, 10, 5, 10, 0, tzinfo=IST), "Knee pain", "My knee hurts")
    for reply in replies:
        if isinstance(reply, Exception):
            fake_ai.fail_with(reply)
        elif isinstance(reply, dict):
            fake_ai.reply_with_tool("summarize_notes", reply)
        elif reply == "verdict: False":
            checked(fake_ai, False)
        else:
            fake_ai.reply_without_tool()

    response = client.post("/api/summary", json=PERIOD, headers=auth(asha["token"]))

    assert response.status_code == 200
    assert response.json()["problem"].startswith(problem)
    assert [note["title"] for note in response.json()["notes"]] == ["Knee pain"]  # still there to read and share


def test_summary_requests_are_checked(client):
    asha = new_profile(client)
    meera = new_profile(client, your_name="Meera")
    visit = {"title": "Check-up", "day": "2026-10-13"}
    theirs = client.post("/api/appointments", json=visit, headers=auth(meera["token"])).json()["id"]
    mine = client.post("/api/appointments", json=visit, headers=auth(asha["token"])).json()["id"]

    assert client.post("/api/summary", json={**PERIOD, "appointment_id": theirs}, headers=auth(asha["token"])).status_code == 404
    summary = client.post("/api/summary", json={**PERIOD, "appointment_id": mine}, headers=auth(asha["token"])).json()
    assert summary["appointment"]["title"] == "Check-up"
    for bad in (
        {**PERIOD, "to_day": "2026-10-01"},
        {**PERIOD, "from_day": "2026-07-01"},
        {**PERIOD, "utc_offset_minutes": 900},
        {**PERIOD, "from_day": "9999-12-30", "to_day": "9999-12-31"},
    ):
        assert client.post("/api/summary", json=bad, headers=auth(asha["token"])).status_code == 422, bad
    assert client.post("/api/summary", json=PERIOD).status_code == 401


def ask(client, token: str, question: str):
    return client.post("/api/ask", json={"question": question, "utc_offset_minutes": 330}, headers=auth(token))


def answers(fake_ai, **reply) -> None:
    fake_ai.reply_with_tool("answer_question", {"kind": "answer", **reply})


def test_an_answer_is_shown_only_when_it_passes_both_checks(client, fake_ai):
    asha = new_profile(client)
    visit = {"title": "Follow-up with Dr. Mehta", "day": "2026-10-13", "time": "16:00"}
    client.post("/api/appointments", json=visit, headers=auth(asha["token"]))
    answers(fake_ai, answer="It is on Tue 13 Oct 2026 at 4:00 PM (A1).", sources=["A1 (appointment)"])
    checked(fake_ai, True)
    answers(fake_ai, answer="It is on Tue 13 Oct 2026 at 4:00 PM.", sources=["A1"])
    checked(fake_ai, False)  # the second model disagrees
    answers(fake_ai, answer="It is on Tue 13 Oct.", sources=["A1"])
    fake_ai.reply_without_tool()
    fake_ai.reply_without_tool()  # the second model fails: an unchecked answer isn't shown
    answers(fake_ai, answer="It is on Wed 14 Oct at 5:00 PM.", sources="A1")  # numbers the record doesn't have
    answers(fake_ai, answer="It is on Tue 13 Oct.", sources=["A1", "N9"])  # a record that doesn't exist
    answers(fake_ai, answer="Next Tuesday.", sources=3)

    answered = ask(client, asha["token"], "When is the next appointment?").json()
    assert (answered["kind"], answered["answer"], answered["urgent"]) == ("answer", "It is on Tue 13 Oct 2026 at 4:00 PM.", False)
    assert answered["checked_by"] == ai.checker_model()
    assert answered["sources"] == [
        {"kind": "appointment", "text": "Appointment on Tue 13 Oct 2026 (in 7 days), 4:00 PM: Follow-up with Dr. Mehta."}
    ]
    sent = fake_ai.requests[0]["messages"][-1]["content"]
    assert sent.startswith("Now: Tue 6 Oct 2026, 12:00 PM")
    assert sent.endswith("Question: When is the next appointment?")
    assert fake_ai.requests[0]["model"] == ai.assistant_model()
    check = fake_ai.requests[1]["messages"][-1]["content"]
    assert "Claim 1: It is on Tue 13 Oct 2026 at 4:00 PM.\nIts records:\nAppointment on Tue 13 Oct" in check

    for _ in range(4):
        shown = ask(client, asha["token"], "When is the next appointment?").json()
        assert (shown["kind"], shown["answer"], len(shown["sources"]), shown["checked_by"]) == ("records", None, 1, None)
    nothing = ask(client, asha["token"], "When is the next appointment?").json()
    assert (nothing["kind"], nothing["answer"], nothing["sources"]) == ("not_found", None, [])


def test_whether_doses_were_taken_is_shown_as_recorded(client, fake_ai):
    asha = new_profile(client)
    telma = add_medicine(client, asha["token"])
    mark(client, asha["token"], telma, "2026-10-06", "08:00")
    answers(fake_ai, answer="No, you haven't taken it yet.", sources=["D5"])  # wrong, and never shown

    shown = ask(client, asha["token"], "Did I take Telma this morning?").json()

    assert (shown["kind"], shown["answer"]) == ("dose_records", None)
    [dose] = shown["sources"]
    assert dose["text"].startswith("Dose due Tue 6 Oct 2026 (today), 8:00 AM: Telma 40 (1 tablet), taken (marked by Asha")
    assert len(fake_ai.requests) == 1  # nothing for the second model to check


def test_questions_for_a_doctor_and_advice_never_show_the_models_words(client, fake_ai):
    asha = new_profile(client)
    add_medicine(client, asha["token"], name="Dolo 650", times=[], as_needed=True, instructions="At most 3 a day")
    answers(fake_ai, answer="Yes, two are fine.", sources=["M1"])
    fake_ai.reply_with_tool("answer_question", {"kind": "ask_doctor", "answer": "Call a doctor.", "sources": [], "urgent": True})
    answers(fake_ai, answer="She can take up to 3 a day, so it's fine.", sources=["M1"])

    dosing = ask(client, asha["token"], "Should Asha take two Dolo tonight?").json()
    assert (dosing["kind"], dosing["answer"]) == ("ask_doctor", None)  # code catches dosing questions too
    assert [source["kind"] for source in dosing["sources"]] == ["medicine"]  # with what the records say
    urgent = ask(client, asha["token"], "Her chest hurts and she is sweating").json()
    assert (urgent["kind"], urgent["answer"], urgent["urgent"]) == ("ask_doctor", None, True)
    advice = ask(client, asha["token"], "What does the Dolo record say?").json()
    assert (advice["kind"], advice["answer"]) == ("records", None)  # the answer itself gave advice


def test_questions_see_recent_doses_and_only_the_askers_private_notes(client, fake_ai):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    telma = add_medicine(client, priya["token"])
    mark(client, asha["token"], telma, "2026-10-06", "08:00")
    add_note(client, asha["token"], datetime(2026, 10, 5, 9, 0, tzinfo=IST), "Low", "Missing my husband", private=True)
    add_note(client, priya["token"], datetime(2026, 10, 5, 9, 0, tzinfo=IST), "Worried", "Mummy seems tired", private=True)
    fake_ai.reply_with_tool("answer_question", {"kind": "not_found"})

    ask(client, asha["token"], "Did I take Telma today?")

    sent = fake_ai.requests[0]["messages"][-1]["content"]
    assert "Dose due Tue 6 Oct 2026 (today), 8:00 AM: Telma 40 (1 tablet), taken (marked by Asha" in sent
    assert "Dose due Tue 6 Oct 2026 (today), 9:00 PM: Telma 40 (1 tablet), not due yet." in sent
    assert "Dose due Mon 5 Oct 2026 (yesterday), 9:00 PM: Telma 40 (1 tablet), not marked." in sent
    assert "Missing my husband This note is private." in sent
    assert "Mummy seems tired" not in sent  # someone else's private note


def test_asking_needs_sign_in_and_shares_the_ai_allowance(client, fake_ai, monkeypatch):
    monkeypatch.setattr(ai.profile_ai_limiter, "limit", 1)
    asha = new_profile(client)
    fake_ai.reply_with_tool("answer_question", {"kind": "not_found"})

    assert client.post("/api/ask", json={"question": "Any news?", "utc_offset_minutes": 330}).status_code == 401
    assert ask(client, asha["token"], "Any news?").status_code == 200
    assert ask(client, asha["token"], "Any news?").status_code == 429
    assert len(fake_ai.requests) == 1


def test_numbers_must_come_from_the_evidence():
    assert ai.backed_by("BP was 150/90, twice", "BP 150/90 on two mornings")
    assert ai.backed_by("BP was 150 at 8 AM", "BP 150/90 at 08:00")
    for wrong in ("BP was 90/150", "BP was 160/90", "Took three tablets", "0.5 mg", "Take one tablet", "half a tablet"):
        assert not ai.backed_by(wrong, "BP 150/90. Took 2 tablets of 5 mg at 10:00"), wrong
    assert ai.backed_by("Take half a tablet", "1/2 tablet at night")
    assert ai.backed_by("No one saw it happen", "nothing written")  # "one" here isn't a number
    assert ai.backed_by("२ गोली", "2 tablets")  # digits in any script
    assert ai.backed_by("Dizzy twice", "दो मिनट तक चक्कर") and not ai.backed_by("तीन बार", "2 times")
    # A claim may count the records it cites, but not borrow that count for anything else.
    assert ai.backed_by("Dizzy on two mornings", "Felt dizzy. Dizzy again.", cited=2)
    assert not ai.backed_by("Took 2 tablets of Dolo", "Took Dolo. Took Dolo again.", cited=2)


def test_labels_are_removed_but_names_that_look_like_labels_stay():
    labels = {"M1", "N10", "D3"}
    assert ai.without_labels("Take it after food (M1), as in N10.", labels, "after food") == "Take it after food, as in."
    assert ai.without_labels("Uprise D3 60K weekly (M1).", labels, "Medicine Uprise D3 60K") == "Uprise D3 60K weekly."


@pytest.mark.parametrize(
    ("question", "needs_doctor"),
    [
        ("Can she take two Dolo for the knee pain?", True),
        ("Should Asha take two Dolo tonight?", True),
        ("Should my mother take two?", True),
        ("Can she take two Dolo when the fever is high?", True),
        ("Should I skip the night dose when she hasn't eaten?", True),
        ("Should I stop Pan-D now that the acidity is better?", True),
        ("How much Dolo can she have in a day?", True),
        ("Is it safe to walk after dinner?", True),
        ("क्या माँ दो गोली ले सकती है?", True),
        ("When should she take Telma?", False),  # the schedule is in the records
        ("What should I take tonight?", False),
        ("Which tablets should she take after dinner?", False),
        ("What should I bring to the appointment?", False),
        ("Can I have the doctor's number?", False),
        ("Can you stop the reminders?", False),
        ("Did she take her medicines today?", False),
        ("How many times did she have knee pain?", False),
    ],
)
def test_questions_that_need_a_doctor_are_recognised(question, needs_doctor):
    assert ai.asks_for_advice(question) is needs_doctor


@pytest.mark.parametrize(
    ("answer", "advises"),
    [
        ("She can take up to three a day.", True),
        ("It's safe to take it with food.", True),
        ("Don’t worry, that is common.", True),
        ("You can call Dr. Mehta at 9876543210.", False),
        ("Glycomet 500 is taken after food.", False),
    ],
)
def test_answers_that_give_advice_are_recognised(answer, advises):
    assert ai.gives_advice(answer) is advises


def test_drafts_are_tidied_but_unusable_ones_fail():
    draft = AnswerDraft.model_validate({"kind": "Not Found", "sources": "[N1], m2 and A1-A3", "urgent": "true", "answer": None})
    assert (draft.kind, draft.sources, draft.urgent, draft.answer) == ("not_found", ["N1", "M2", "A1", "A3"], True, "")
    assert AnswerDraft.model_validate({"kind": "answer", "sources": True}).sources == []
    assert AnswerDraft.model_validate({"kind": "answer", "sources": [{"label": "a1"}]}).sources == ["A1"]
    summary = SummaryDraft.model_validate({"points": '[{"section": "medication", "text": "Missed a dose", "notes": ["N2", 3]}, {"text": "?"}]'})
    assert [(point.section, point.notes) for point in summary.points] == [("medicines", [2, 3])]
    assert SummaryDraft.model_validate({"points": [{"section": "other", "text": "A test", "notes": 4}]}).points[0].notes == [4]
    with pytest.raises(ValueError):
        SummaryDraft.model_validate({"points": [{"text": "no section or notes"}]})
