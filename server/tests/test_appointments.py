from sqlalchemy import func, select

from server.db import Appointment, SessionLocal

from .helpers import auth, invite_and_join, new_profile

VISIT = {"title": "Check-up with Dr. Mehta", "day": "2026-10-13", "time": "16:00", "place": "Ruby Hall Clinic", "with_whom": "Dr. Mehta"}


def test_a_caregiver_adds_an_appointment_the_older_adult_sees(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])

    created = client.post("/api/appointments", json=VISIT, headers=auth(priya["token"]))
    assert created.status_code == 201
    assert created.json()["created_by_name"] == "Priya"
    seen = client.get("/api/appointments", headers=auth(asha["token"])).json()
    assert [(item["title"], item["day"], item["time"]) for item in seen] == [("Check-up with Dr. Mehta", "2026-10-13", "16:00")]

    appointment_id = created.json()["id"]
    moved = client.put(
        f"/api/appointments/{appointment_id}", json={**VISIT, "time": "", "notes": "Bring the sugar report"}, headers=auth(asha["token"])
    )
    assert moved.status_code == 200
    assert (moved.json()["time"], moved.json()["notes"], moved.json()["updated_by_name"]) == (None, "Bring the sugar report", "Asha")

    assert client.delete(f"/api/appointments/{appointment_id}", headers=auth(priya["token"])).status_code == 204
    assert client.get("/api/appointments", headers=auth(asha["token"])).json() == []


def test_appointments_are_listed_by_day_then_time(client):
    asha = new_profile(client)
    for day, time in (("2026-10-20", None), ("2026-10-13", None), ("2026-10-13", "09:30"), ("2026-10-13", "16:00")):
        client.post("/api/appointments", json={**VISIT, "day": day, "time": time}, headers=auth(asha["token"]))

    listed = client.get("/api/appointments", headers=auth(asha["token"])).json()
    assert [(item["day"], item["time"]) for item in listed] == [
        ("2026-10-13", "09:30"),
        ("2026-10-13", "16:00"),
        ("2026-10-13", None),  # time not known yet
        ("2026-10-20", None),
    ]


def test_appointment_fields_are_validated(client):
    asha = new_profile(client)
    for bad in ({**VISIT, "title": " "}, {**VISIT, "day": "13/10/2026"}, {**VISIT, "time": "4 pm"}, {**VISIT, "time": "x16:00"}, {**VISIT, "extra": 1}):
        assert client.post("/api/appointments", json=bad, headers=auth(asha["token"])).status_code == 422, bad


def test_other_profiles_cannot_touch_appointments_and_deleting_the_profile_removes_them(client):
    asha = new_profile(client)
    meera = new_profile(client, your_name="Meera")
    appointment = client.post("/api/appointments", json=VISIT, headers=auth(asha["token"])).json()

    assert client.get("/api/appointments", headers=auth(meera["token"])).json() == []
    assert client.put(f"/api/appointments/{appointment['id']}", json=VISIT, headers=auth(meera["token"])).status_code == 404
    assert client.delete(f"/api/appointments/{appointment['id']}", headers=auth(meera["token"])).status_code == 404

    client.delete("/api/profile", headers=auth(asha["token"]))
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
