from sqlalchemy import func, select
from sqlalchemy.orm import Session

from server.db import DoseLog, SessionLocal

from .helpers import auth, invite_and_join, new_profile

MEDICINE = {"name": "Telma 40", "dose": "1 tablet", "times": ["08:00", "21:00"], "start_date": "2026-10-05", "end_date": "2026-11-03"}


def count_logs() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(DoseLog)) or 0


def add_medicine(client, token: str, **changes) -> int:
    response = client.post("/api/medicines", json={**MEDICINE, **changes}, headers=auth(token))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def doses(client, token: str, from_day: str = "2026-10-01", to_day: str = "2026-10-31"):
    return client.get("/api/doses", params={"from_day": from_day, "to_day": to_day}, headers=auth(token))


def test_a_taken_dose_is_shared_with_the_circle(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])
    medicine_id = add_medicine(client, priya["token"])

    taken = client.put(
        "/api/doses", json={"medication_id": medicine_id, "day": "2026-10-06", "time": "08:00", "status": "taken"}, headers=auth(asha["token"])
    )
    assert taken.status_code == 200
    assert (taken.json()["status"], taken.json()["recorded_by_name"]) == ("taken", "Asha")
    assert taken.json()["recorded_at"].endswith("Z")

    seen = doses(client, priya["token"]).json()  # the caregiver's phone sees it
    assert [(dose["day"], dose["time"], dose["status"]) for dose in seen] == [("2026-10-06", "08:00", "taken")]


def test_changing_and_undoing_a_dose(client):
    asha = new_profile(client)
    medicine_id = add_medicine(client, asha["token"])
    key = {"medication_id": medicine_id, "day": "2026-10-06", "time": "21:00"}

    client.put("/api/doses", json={**key, "status": "taken"}, headers=auth(asha["token"]))
    client.put("/api/doses", json={**key, "status": "skipped"}, headers=auth(asha["token"]))
    assert [dose["status"] for dose in doses(client, asha["token"]).json()] == ["skipped"]  # one record per dose

    assert client.delete("/api/doses", params=key, headers=auth(asha["token"])).status_code == 204
    assert doses(client, asha["token"]).json() == []
    assert client.delete("/api/doses", params=key, headers=auth(asha["token"])).status_code == 404


def test_only_scheduled_doses_can_be_recorded(client):
    asha = new_profile(client)
    medicine_id = add_medicine(client, asha["token"])
    as_needed_id = add_medicine(client, asha["token"], name="Dolo 650", times=[], as_needed=True)

    for day, time in (("2026-10-06", "14:00"), ("2026-10-04", "08:00"), ("2026-11-04", "08:00"), ("2026-10-06", "8:00x"), ("2026-10-06", "0८:00")):
        body = {"medication_id": medicine_id, "day": day, "time": time, "status": "taken"}
        assert client.put("/api/doses", json=body, headers=auth(asha["token"])).status_code == 422, (day, time)
    sos = {"medication_id": as_needed_id, "day": "2026-10-06", "time": "08:00", "status": "taken"}
    assert client.put("/api/doses", json=sos, headers=auth(asha["token"])).status_code == 422


def test_dose_ranges_are_limited(client):
    asha = new_profile(client)
    assert doses(client, asha["token"], "2026-10-31", "2026-10-01").status_code == 422
    assert doses(client, asha["token"], "2026-01-01", "2026-12-31").status_code == 422


def test_other_care_profiles_cannot_see_or_record_doses(client):
    asha = new_profile(client)
    meera = new_profile(client, your_name="Meera")
    medicine_id = add_medicine(client, asha["token"])
    body = {"medication_id": medicine_id, "day": "2026-10-06", "time": "08:00", "status": "taken"}
    client.put("/api/doses", json=body, headers=auth(asha["token"]))

    assert client.put("/api/doses", json=body, headers=auth(meera["token"])).status_code == 404
    assert doses(client, meera["token"]).json() == []
    key = {key: value for key, value in body.items() if key != "status"}
    assert client.delete("/api/doses", params=key, headers=auth(meera["token"])).status_code == 404


def test_removing_a_medicine_or_the_profile_removes_its_doses(client):
    asha = new_profile(client)
    first = add_medicine(client, asha["token"])
    second = add_medicine(client, asha["token"], name="Glycomet 500")
    for medicine_id in (first, second):
        body = {"medication_id": medicine_id, "day": "2026-10-06", "time": "08:00", "status": "taken"}
        client.put("/api/doses", json=body, headers=auth(asha["token"]))

    client.delete(f"/api/medicines/{first}", headers=auth(asha["token"]))
    assert count_logs() == 1
    client.delete("/api/profile", headers=auth(asha["token"]))
    assert count_logs() == 0


def test_two_phones_marking_one_dose_at_once(client, monkeypatch):
    asha = new_profile(client)
    medicine_id = add_medicine(client, asha["token"])
    key = {"medication_id": medicine_id, "day": "2026-10-06", "time": "08:00"}
    client.put("/api/doses", json={**key, "status": "taken"}, headers=auth(asha["token"]))

    real_scalar = Session.scalar
    looked = []

    def scalar(self, statement, *args, **kwargs):
        if "dose_logs" in str(statement) and not looked:
            looked.append(True)
            return None  # as if the other phone's record hadn't been saved yet when this one looked
        return real_scalar(self, statement, *args, **kwargs)

    monkeypatch.setattr(Session, "scalar", scalar)
    response = client.put("/api/doses", json={**key, "status": "skipped"}, headers=auth(asha["token"]))

    assert response.status_code == 200
    assert response.json()["status"] == "skipped"
    assert count_logs() == 1
