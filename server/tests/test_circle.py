import re
from datetime import timedelta

from sqlalchemy import func, select, update

from server import routes_circle, security
from server.db import CareProfile, Invite, Member, Note, SessionLocal, utcnow
from server.security import RateLimiter

from .helpers import NOTE, auth, invite_and_join, new_profile


def count(model: type) -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(model)) or 0


def test_older_adult_sets_up_their_own_profile(client):
    session = new_profile(client)

    assert session["profile"]["person_name"] == "Asha"
    assert session["me"]["role"] == "care_recipient"
    assert session["me"]["is_creator"] and session["me"]["is_me"]
    assert session["can_manage"] is True
    me = client.get("/api/me", headers=auth(session["token"]))
    assert me.status_code == 200
    assert [member["name"] for member in me.json()["members"]] == ["Asha"]


def test_caregiver_setup_needs_the_older_adults_name(client):
    missing = client.post("/api/profiles", json={"your_name": "Priya", "your_role": "caregiver"})
    assert missing.status_code == 422

    session = new_profile(client, your_name="Priya", your_role="caregiver", person_name="Asha")
    assert session["profile"]["person_name"] == "Asha"
    assert session["me"]["name"] == "Priya"


def test_requests_without_a_valid_token_are_rejected(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers=auth("not-a-real-token")).status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_tokens_are_stored_only_as_hashes(client):
    session = new_profile(client)

    with SessionLocal() as db:
        stored = db.scalar(select(Member.token_hash))
    assert stored == security.hash_token(session["token"])
    assert session["token"] not in stored


def test_invite_code_works_once_and_ignores_typing_style(client):
    priya = new_profile(client, your_name="Priya", your_role="caregiver", person_name="Asha")
    invite = client.post("/api/invites", json={"role": "care_recipient"}, headers=auth(priya["token"])).json()
    assert re.fullmatch(r"[A-Z2-9]{3}-[A-Z2-9]{3}", invite["code"])

    typed = invite["code"].lower().replace("-", " ")
    joined = client.post("/api/invites/accept", json={"code": typed, "your_name": "Asha"})
    assert joined.status_code == 201
    assert joined.json()["me"]["role"] == "care_recipient"
    assert [member["name"] for member in joined.json()["members"]] == ["Priya", "Asha"]

    again = client.post("/api/invites/accept", json={"code": invite["code"], "your_name": "Someone"})
    assert again.status_code == 404


def test_expired_invite_is_rejected(client):
    asha = new_profile(client)
    code = client.post("/api/invites", json={"role": "caregiver"}, headers=auth(asha["token"])).json()["code"]
    with SessionLocal() as db:
        db.execute(update(Invite).values(expires_at=utcnow() - timedelta(minutes=1)))
        db.commit()

    response = client.post("/api/invites/accept", json={"code": code, "your_name": "Priya"})
    assert response.status_code == 404


def test_only_one_care_recipient_per_profile(client):
    asha = new_profile(client)

    response = client.post("/api/invites", json={"role": "care_recipient"}, headers=auth(asha["token"]))
    assert response.status_code == 409
    assert "Asha" in response.json()["detail"]


def test_only_managers_can_add_the_older_adults_phone(client):
    # Joining as the older adult grants full control, so an ordinary caregiver must not be able to mint that code.
    priya = new_profile(client, your_name="Priya", your_role="caregiver", person_name="Asha")
    ravi = invite_and_join(client, priya["token"], name="Ravi")

    assert client.post("/api/invites", json={"role": "care_recipient"}, headers=auth(ravi["token"])).status_code == 403
    assert client.post("/api/invites", json={"role": "care_recipient"}, headers=auth(priya["token"])).status_code == 201


def test_removed_people_cannot_rejoin_with_codes_they_made(client):
    asha = new_profile(client)
    mallory = invite_and_join(client, asha["token"], name="Mallory")
    spare = client.post("/api/invites", json={"role": "caregiver"}, headers=auth(mallory["token"])).json()["code"]

    assert client.delete(f"/api/members/{mallory['me']['id']}", headers=auth(asha["token"])).status_code == 204
    rejoin = client.post("/api/invites/accept", json={"code": spare, "your_name": "Mallory"})
    assert rejoin.status_code == 404


def test_codes_stop_working_when_their_creator_leaves(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    code = client.post("/api/invites", json={"role": "caregiver"}, headers=auth(priya["token"])).json()["code"]

    client.delete(f"/api/members/{priya['me']['id']}", headers=auth(priya["token"]))
    assert client.post("/api/invites/accept", json={"code": code, "your_name": "Ravi"}).status_code == 404


def test_private_notes_leave_with_their_author(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    client.post("/api/notes", json={**NOTE, "private": True}, headers=auth(priya["token"]))
    client.post("/api/notes", json={**NOTE, "title": "Shared"}, headers=auth(priya["token"]))

    client.delete(f"/api/members/{priya['me']['id']}", headers=auth(priya["token"]))
    assert count(Note) == 1  # the shared note stays in Asha's record
    assert [note["title"] for note in client.get("/api/notes", headers=auth(asha["token"])).json()] == ["Shared"]


def test_invite_codes_are_rate_limited_per_profile(client, monkeypatch):
    monkeypatch.setattr(routes_circle.invite_limiter, "limit", 2)
    asha = new_profile(client)
    for _ in range(2):
        assert client.post("/api/invites", json={"role": "caregiver"}, headers=auth(asha["token"])).status_code == 201
    assert client.post("/api/invites", json={"role": "caregiver"}, headers=auth(asha["token"])).status_code == 429


def test_repeated_wrong_codes_are_rate_limited(client):
    wrong = {"code": "AAA-AAA", "your_name": "Guess"}
    for _ in range(10):
        assert client.post("/api/invites/accept", json=wrong).status_code == 404
    assert client.post("/api/invites/accept", json=wrong).status_code == 429


def test_who_can_remove_whom(client):
    priya = new_profile(client, your_name="Priya", your_role="caregiver", person_name="Asha")
    asha = invite_and_join(client, priya["token"], role="care_recipient", name="Asha")
    ravi = invite_and_join(client, priya["token"], role="caregiver", name="Ravi")
    ids = {member["name"]: member["id"] for member in ravi["members"]}

    # Ravi is neither the older adult nor the person who set things up.
    assert client.delete(f"/api/members/{ids['Priya']}", headers=auth(ravi["token"])).status_code == 403
    # The creator manages caregivers but cannot remove the older adult from their own record.
    assert client.delete(f"/api/members/{ids['Asha']}", headers=auth(priya["token"])).status_code == 403
    # The older adult can remove anyone, and that phone is signed out at once.
    assert client.delete(f"/api/members/{ids['Ravi']}", headers=auth(asha["token"])).status_code == 204
    assert client.get("/api/me", headers=auth(ravi["token"])).status_code == 401

    view = client.get("/api/me", headers=auth(asha["token"])).json()
    assert {member["name"]: member["can_remove"] for member in view["members"]} == {"Priya": True, "Asha": False}


def test_last_person_leaving_deletes_everything(client):
    asha = new_profile(client)
    client.post("/api/notes", json=NOTE, headers=auth(asha["token"]))

    left = client.delete(f"/api/members/{asha['me']['id']}", headers=auth(asha["token"]))
    assert left.status_code == 204
    assert (count(Note), count(Member), count(CareProfile)) == (0, 0, 0)


def test_deleting_everything_needs_permission_and_signs_everyone_out(client):
    priya = new_profile(client, your_name="Priya", your_role="caregiver", person_name="Asha")
    ravi = invite_and_join(client, priya["token"], name="Ravi")
    client.post("/api/notes", json=NOTE, headers=auth(ravi["token"]))

    assert client.delete("/api/profile", headers=auth(ravi["token"])).status_code == 403
    assert client.delete("/api/profile", headers=auth(priya["token"])).status_code == 204
    assert client.get("/api/me", headers=auth(ravi["token"])).status_code == 401
    assert (count(Note), count(Member), count(CareProfile)) == (0, 0, 0)


def test_oversized_uploads_are_refused_before_sign_in(client):
    huge = b"x" * (11 * 1024 * 1024)
    declared = client.post("/api/prescriptions/read", content=huge, headers={"Content-Type": "application/json"})
    assert declared.status_code == 413

    def chunks():  # no Content-Length: the limit is enforced while reading
        for _ in range(11):
            yield b"x" * (1024 * 1024)

    streamed = client.post("/api/prescriptions/read", content=chunks(), headers={"Content-Type": "application/json"})
    assert streamed.status_code == 413
    assert client.get("/health").status_code == 200


def test_rate_limiter_forgets_old_events(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(security.time, "monotonic", lambda: clock[0])
    limiter = RateLimiter(limit=2, window=10)

    assert limiter.allow("phone") and limiter.allow("phone")
    assert not limiter.allow("phone")
    assert limiter.allow("another phone")
    clock[0] += 10
    assert limiter.allow("phone")
