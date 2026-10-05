import httpx
from openai import APITimeoutError

from server import ai, routes_notes

from .helpers import NOTE, auth, invite_and_join, new_profile

APPOINTMENT = {"category": "appointment", "title": "Dr. Mehta", "details": "See Dr. Mehta", "event_time_text": "next Tuesday at 4 pm"}


def test_draft_comes_from_a_nemotron_tool_call(client, fake_ai):
    asha = new_profile(client)
    fake_ai.reply_with_notes(NOTE, APPOINTMENT)

    spoken = "  I felt sick after breakfast. Dr. Mehta next Tuesday at 4 pm.  "
    response = client.post("/api/notes/propose", json={"transcript": spoken}, headers=auth(asha["token"]))

    assert response.status_code == 200
    assert [note["category"] for note in response.json()["notes"]] == ["symptom", "appointment"]
    assert response.json()["model"] == ai.model_name()
    request = fake_ai.requests[0]
    assert request["model"] == ai.model_name()
    assert "tool_choice" not in request  # forcing the tool makes Nemotron slow and unreliable
    assert request["messages"][-1] == {"role": "user", "content": spoken.strip()}


def test_draft_can_be_empty_when_there_is_nothing_to_record(client, fake_ai):
    asha = new_profile(client)
    fake_ai.reply_with_notes()

    response = client.post("/api/notes/propose", json={"transcript": "testing one two"}, headers=auth(asha["token"]))
    assert response.status_code == 200
    assert response.json()["notes"] == []


def test_draft_retries_once_before_giving_up(client, fake_ai):
    asha = new_profile(client)
    fake_ai.reply_without_tool()
    fake_ai.reply_with_notes(NOTE)

    recovered = client.post("/api/notes/propose", json={"transcript": "I felt sick"}, headers=auth(asha["token"]))
    assert recovered.status_code == 200
    assert [request["temperature"] for request in fake_ai.requests] == [0.0, 0.4]

    fake_ai.reply_without_tool()
    fake_ai.reply_with_notes({**NOTE, "category": "diagnosis"})  # invalid output counts as a failure too
    failed = client.post("/api/notes/propose", json={"transcript": "I felt sick"}, headers=auth(asha["token"]))
    assert failed.status_code == 502


def test_draft_reports_a_slow_assistant(client, fake_ai):
    asha = new_profile(client)
    fake_ai.fail_with(APITimeoutError(request=httpx.Request("POST", "https://example.test")))

    response = client.post("/api/notes/propose", json={"transcript": "I felt sick"}, headers=auth(asha["token"]))
    assert response.status_code == 504


def test_draft_limit_is_shared_by_everyone_in_a_care_profile(client, fake_ai, monkeypatch):
    # Otherwise one person could mint members with invite codes to multiply their AI budget.
    monkeypatch.setattr(routes_notes.profile_draft_limiter, "limit", 2)
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    meera = new_profile(client, your_name="Meera")
    for _ in range(3):
        fake_ai.reply_with_notes(NOTE)

    def draft(token: str) -> int:
        return client.post("/api/notes/propose", json={"transcript": "I felt sick"}, headers=auth(token)).status_code

    assert [draft(asha["token"]), draft(priya["token"])] == [200, 200]
    assert draft(priya["token"]) == 429
    assert draft(meera["token"]) == 200  # a different care profile has its own allowance
    assert len(fake_ai.requests) == 3


def test_drafting_requires_sign_in(client, fake_ai):
    response = client.post("/api/notes/propose", json={"transcript": "hello there"})
    assert response.status_code == 401
    assert fake_ai.requests == []


def test_notes_are_shared_in_the_circle_with_their_authors(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    created = client.post("/api/notes", json={**NOTE, "source_text": "I felt sick", "model": "m"}, headers=auth(asha["token"]))
    assert created.status_code == 201
    assert created.json()["created_by_name"] == "Asha"
    assert created.json()["created_by_id"] == asha["me"]["id"]
    assert created.json()["created_at"].endswith("Z")

    assert [note["title"] for note in client.get("/api/notes", headers=auth(priya["token"])).json()] == ["Nausea"]

    note_id = created.json()["id"]
    edited = client.put(
        f"/api/notes/{note_id}", json={**NOTE, "title": "Nausea again", "private": True}, headers=auth(priya["token"])
    )
    assert edited.status_code == 200
    assert edited.json()["title"] == "Nausea again"
    assert edited.json()["updated_by_name"] == "Priya"
    assert edited.json()["private"] is False  # only the author may hide a note

    assert client.delete(f"/api/notes/{note_id}", headers=auth(priya["token"])).status_code == 204
    assert client.get("/api/notes", headers=auth(asha["token"])).json() == []


def test_private_notes_stay_with_their_author(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    private = client.post("/api/notes", json={**NOTE, "private": True}, headers=auth(asha["token"])).json()

    assert client.get("/api/notes", headers=auth(priya["token"])).json() == []
    hidden = client.put(f"/api/notes/{private['id']}", json={**NOTE, "private": False}, headers=auth(priya["token"]))
    assert hidden.status_code == 404
    assert [note["private"] for note in client.get("/api/notes", headers=auth(asha["token"])).json()] == [True]


def test_other_care_profiles_cannot_see_notes(client):
    asha = new_profile(client)
    meera = new_profile(client, your_name="Meera")
    note = client.post("/api/notes", json=NOTE, headers=auth(asha["token"])).json()

    assert client.get("/api/notes", headers=auth(meera["token"])).json() == []
    assert client.delete(f"/api/notes/{note['id']}", headers=auth(meera["token"])).status_code == 404


def test_note_fields_are_validated(client):
    asha = new_profile(client)
    for bad in (
        {**NOTE, "category": "diagnosis"},
        {**NOTE, "title": "   "},
        {**NOTE, "details": "x" * 1001},
        {**NOTE, "unexpected": 1},
    ):
        assert client.post("/api/notes", json=bad, headers=auth(asha["token"])).status_code == 422
