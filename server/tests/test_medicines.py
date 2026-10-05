import base64

import httpx
from openai import InternalServerError
from sqlalchemy import func, select

from server import ai
from server.db import Medication, SessionLocal

from .helpers import auth, invite_and_join, new_profile

# Tiny stand-ins with real file signatures; the fake model never looks inside.
JPEG = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 200).decode()
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 200).decode()

TRANSCRIPTION = (
    "Dr. R. Mehta\n1. Tab. Amlodipine 5 mg 1-0-0 x 30 days after breakfast\n2. Tab. Metformin 500 mg 1-0-1 x 30 days"
)
AMLODIPINE = {
    "name": "Amlodipine",
    "strength": "5 mg",
    "form": "tablet",
    "dose": "1 tablet",
    "times": ["8:00"],
    "food": "after_food",
    "duration_days": 30,
    "source_text": "1. Tab. Amlodipine 5 mg 1-0-0 x 30 days after breakfast",
    "unclear": [],
}
METFORMIN = {"name": "Metformin", "strength": "500 mg", "dose": "1 tablet", "times": ["21:00", "08:00"], "unclear": ["food"]}
MEDICINE = {
    "name": "Amlodipine",
    "strength": "5 mg",
    "dose": "1 tablet",
    "times": ["08:00"],
    "food": "after_food",
    "start_date": "2026-10-06",
    "end_date": "2026-11-04",
}


def read(client, token, image=JPEG, media_type="image/jpeg"):
    return client.post("/api/prescriptions/read", json={"image_base64": image, "media_type": media_type}, headers=auth(token))


QWEN, GEMMA = ai.reader_models()
SPARE = ai.spare_reader()
PACKAGE_TEXT = "Glycomet 500\nMetformin Hydrochloride Tablets IP 500 mg\n10 tablets"


def both_read(fake_ai, text=TRANSCRIPTION, other=None):
    fake_ai.reply_with_text(text, model=QWEN)
    fake_ai.reply_with_text(text if other is None else other, model=GEMMA)


def test_a_prescription_is_read_twice_then_organized_by_nemotron(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai)
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [AMLODIPINE, METFORMIN], "other_instructions": ["Review after 1 month"]})

    response = read(client, asha["token"])

    assert response.status_code == 200
    body = response.json()
    assert [medicine["name"] for medicine in body["medicines"]] == ["Amlodipine", "Metformin"]
    assert body["medicines"][0]["times"] == ["08:00"]  # "8:00" is tidied up
    assert body["medicines"][1]["times"] == ["08:00", "21:00"]  # and times are put in order
    assert body["medicines"][0]["unclear"] == []  # both readings agree on the name and strength
    assert body["medicines"][1]["unclear"] == ["food"]
    assert body["other_instructions"] == ["Review after 1 month"]
    assert body["readings"] == [{"model": QWEN, "text": TRANSCRIPTION}, {"model": GEMMA, "text": TRANSCRIPTION}]
    assert body["organizing_model"] == ai.prescription_model()

    (vision,) = fake_ai.calls_to(QWEN)
    assert vision["messages"][0]["content"][1]["image_url"]["url"] == f"data:image/jpeg;base64,{JPEG}"
    (organize,) = fake_ai.calls_to(ai.prescription_model())
    assert organize["messages"][-1]["content"] == f"Reading A:\n{TRANSCRIPTION}\n\nReading B:\n{TRANSCRIPTION}"
    assert "tool_choice" not in organize


def test_a_name_the_readers_disagree_on_is_flagged_even_if_nemotron_forgets(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "1) Tab Glycomet 500 BD after food", "1) Tab Glycomel 500 BD after food")
    confident = {"name": "Glycomet 500", "strength": "500 mg", "times": ["08:00", "21:00"], "alternatives": ["Glycomel 500", "Glycomet 500"]}
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [confident]})

    medicine = read(client, asha["token"]).json()["medicines"][0]

    assert medicine["unclear"] == ["name"]  # "Glycomet 500" isn't in reading B
    assert medicine["alternatives"] == ["Glycomel 500"]  # the chosen spelling isn't repeated


def test_a_medicine_no_reader_saw_is_never_shown(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "R [unclear] (20 [unclear]) 1 caja", "R [unclear] (20mg) caja")
    invented = {"name": "Tramadol", "strength": "100 mg", "times": ["08:00"], "alternatives": ["[unclear]", "Tramadol"]}
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [invented]})

    medicine = read(client, asha["token"]).json()["medicines"][0]

    assert medicine["name"] == ""  # left blank for the person, rather than a made-up drug
    assert medicine["alternatives"] == []
    assert "name" in medicine["unclear"]


def test_a_name_only_one_reader_saw_is_offered_not_filled_in(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "R [unclear] (100mg) 20 tabletas", "R Tramadol [unclear] (100mg) 20 tabletas")
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [{"name": "Tramadol", "strength": "100 mg", "times": ["08:00"]}]})

    medicine = read(client, asha["token"]).json()["medicines"][0]

    assert medicine["name"] == ""  # the other reader saw nothing like it
    assert medicine["alternatives"] == ["Tramadol"]  # offered, for the person to pick if the photo agrees
    assert "name" in medicine["unclear"]


def test_a_misspelling_the_model_fixed_is_kept_but_flagged(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "Tablet Metformis 500 Twice", "Tablet Metformis 500 Twice")
    fixed = {"name": "Metformin", "strength": "500 mg", "times": ["08:00", "21:00"], "alternatives": ["Metformis"]}
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [fixed]})

    medicine = read(client, asha["token"]).json()["medicines"][0]

    assert medicine["name"] == "Metformin"
    assert medicine["unclear"] == ["name"]  # not what was read, so someone must check it
    assert medicine["alternatives"] == ["Metformis"]


def test_a_strength_the_readers_disagree_on_is_flagged(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "Tab Telma 40 1-0-0", "Tab Telma 80 1-0-0")
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [{"name": "Telma", "strength": "40 mg", "times": ["08:00"]}]})

    assert read(client, asha["token"]).json()["medicines"][0]["unclear"] == ["strength"]


def test_a_failed_reader_is_replaced_by_the_spare(client, fake_ai):
    asha = new_profile(client)
    request = httpx.Request("POST", "https://example.test")
    fake_ai.fail_with(InternalServerError("down", response=httpx.Response(500, request=request), body=None), model=QWEN)
    fake_ai.reply_with_text(TRANSCRIPTION, model=GEMMA)
    fake_ai.reply_with_text(TRANSCRIPTION, model=SPARE)
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [AMLODIPINE]})

    response = read(client, asha["token"])

    assert response.status_code == 200
    assert [reading["model"] for reading in response.json()["readings"]] == [GEMMA, SPARE]
    assert response.json()["medicines"][0]["unclear"] == []


def test_with_only_one_reading_every_name_is_flagged(client, fake_ai):
    asha = new_profile(client)
    fake_ai.reply_with_text(TRANSCRIPTION[:40], finish_reason="length", model=QWEN)  # cut off part-way: not trusted
    fake_ai.reply_with_text(TRANSCRIPTION, model=GEMMA)
    fake_ai.reply_with_text("", model=SPARE)  # and the spare can't read it either
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [AMLODIPINE]})

    response = read(client, asha["token"])

    assert [reading["model"] for reading in response.json()["readings"]] == [GEMMA]
    assert response.json()["medicines"][0]["unclear"] == ["name"]  # nothing to cross-check it against
    (organize,) = fake_ai.calls_to(ai.prescription_model())
    assert organize["messages"][-1]["content"].startswith("Only one reading was possible")


def test_thinking_text_is_dropped_and_small_slips_are_forgiven(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "<think>Let me read this carefully.</think>\n" + TRANSCRIPTION, TRANSCRIPTION)
    sos = {"name": "Dolo 650", "dose": "1 tablet", "times": None, "as_needed": True, "unclear": ["duration_days", "colour"]}
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [sos], "other_instructions": None})

    response = read(client, asha["token"])

    assert response.status_code == 200
    assert response.json()["readings"][0]["text"] == TRANSCRIPTION
    medicine = response.json()["medicines"][0]
    assert medicine["times"] == []
    assert medicine["unclear"] == ["duration", "other", "name"]  # unknown flags still warn
    assert medicine["name"] == ""  # "Dolo 650" is in neither reading, so it isn't shown
    assert response.json()["other_instructions"] == []


def test_drafts_bend_instead_of_failing_but_flag_what_changed(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai)
    messy = {
        "name": "Amlodipine",
        "times": "8 AM and 9:00 pm",  # a string instead of a list, in spoken form
        "food": "after meals",
        "duration_days": "30",
        "source_text": "x" * 400,
        "colour": "white",  # an extra key
        "unclear": ["Dosage "],
    }
    unreadable = {"name": "", "times": ["noonish", "08:00"], "food": "with tea", "duration_days": 0}
    many = [{"name": f"Medicine {n}", "times": ["08:00"]} for n in range(33)]
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [messy, unreadable, *many], "other_instructions": ["Review in 1 month"]})

    response = read(client, asha["token"])

    assert response.status_code == 200
    first, second, *rest = response.json()["medicines"]
    assert (first["times"], first["food"], first["duration_days"], len(first["source_text"])) == (["08:00", "21:00"], "after_food", 30, 300)
    assert first["unclear"] == ["dose"]
    assert second["name"] == ""  # left for the person to fill in
    assert second["times"] == ["08:00"]
    assert (second["food"], second["duration_days"]) == (None, None)
    assert second["unclear"] == ["name", "times", "food", "duration"]
    assert len(rest) == 28  # 30 medicines at most...
    assert response.json()["other_instructions"][-1].startswith("Only the first 30 medicines")  # ...and it says so


def test_a_list_wrapped_in_a_string_is_still_read(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai)
    wrapped = '[{"name": "Amlodipine", "times": ["08:00"]}], "other_instructions": ["junk after the list"]]'
    fake_ai.reply_with_tool("draft_medicines", {"medicines": wrapped})

    response = read(client, asha["token"])

    assert response.status_code == 200
    assert [medicine["name"] for medicine in response.json()["medicines"]] == ["Amlodipine"]


def test_photos_that_are_not_prescriptions_are_refused(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "<think>This is a grocery list.</think>\nNOT A PRESCRIPTION", "NOT A PRESCRIPTION")

    response = read(client, asha["token"])

    assert response.status_code == 422
    assert "prescription" in response.json()["detail"]
    assert fake_ai.calls_to(ai.prescription_model()) == []  # nothing to organize


def test_if_only_one_reader_refuses_the_other_reading_is_used_carefully(client, fake_ai):
    asha = new_profile(client)
    both_read(fake_ai, "NOT A PRESCRIPTION", TRANSCRIPTION)
    fake_ai.reply_with_tool("draft_medicines", {"medicines": [AMLODIPINE]})

    response = read(client, asha["token"])

    assert [reading["model"] for reading in response.json()["readings"]] == [GEMMA]
    assert response.json()["medicines"][0]["unclear"] == ["name"]


def test_a_medicine_strip_photo_gives_the_printed_name(client, fake_ai):
    asha = new_profile(client)
    fake_ai.reply_with_text(PACKAGE_TEXT, model=QWEN)
    printed = {"name": "Glycomet 500", "strength": "500 mg", "form": "tablet", "contains": "Metformin Hydrochloride 500 mg"}
    fake_ai.reply_with_tool("identify_medicine", printed)

    response = client.post("/api/medicines/read-package", json={"image_base64": JPEG, "media_type": "image/jpeg"}, headers=auth(asha["token"]))

    assert response.status_code == 200
    assert response.json() == {**printed, "reading": {"model": QWEN, "text": PACKAGE_TEXT}, "organizing_model": ai.model_name()}
    assert fake_ai.calls_to(GEMMA) == []  # printed text needs only one reader


def test_photos_that_are_not_medicine_packages_are_refused(client, fake_ai):
    asha = new_profile(client)
    fake_ai.reply_with_text("NOT A MEDICINE PACKAGE", model=QWEN)

    response = client.post("/api/medicines/read-package", json={"image_base64": JPEG, "media_type": "image/jpeg"}, headers=auth(asha["token"]))

    assert response.status_code == 422
    assert "medicine strip" in response.json()["detail"]
    assert client.post("/api/medicines/read-package", json={"image_base64": JPEG, "media_type": "image/jpeg"}).status_code == 401


def test_broken_images_are_refused_before_any_ai_call(client, fake_ai):
    asha = new_profile(client)
    for image, media_type in (("!" * 200, "image/jpeg"), (PNG, "image/jpeg"), (JPEG, "image/png"), (JPEG, "image/gif")):
        assert read(client, asha["token"], image, media_type).status_code == 422, (image[:10], media_type)
    assert fake_ai.requests == []


def test_reading_requires_sign_in_and_shares_the_ai_allowance(client, fake_ai, monkeypatch):
    unsigned = client.post("/api/prescriptions/read", json={"image_base64": JPEG, "media_type": "image/jpeg"})
    assert unsigned.status_code == 401

    monkeypatch.setattr(ai.profile_ai_limiter, "limit", 1)
    asha = new_profile(client)
    fake_ai.reply_with_notes()
    client.post("/api/notes/propose", json={"transcript": "hello there"}, headers=auth(asha["token"]))
    assert read(client, asha["token"]).status_code == 429


def test_confirmed_medicines_are_shared_in_the_circle(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])

    created = client.post("/api/medicines", json={**MEDICINE, "times": ["21:00", "8:00", "08:00"]}, headers=auth(priya["token"]))
    assert created.status_code == 201
    assert created.json()["times"] == ["08:00", "21:00"]
    assert created.json()["created_by_name"] == "Priya"
    listed = client.get("/api/medicines", headers=auth(asha["token"])).json()
    assert [(medicine["name"], medicine["end_date"]) for medicine in listed] == [("Amlodipine", "2026-11-04")]

    medicine_id = created.json()["id"]
    changed = client.put(
        f"/api/medicines/{medicine_id}", json={**MEDICINE, "dose": "half tablet", "end_date": None}, headers=auth(asha["token"])
    )
    assert changed.status_code == 200
    assert (changed.json()["dose"], changed.json()["end_date"], changed.json()["updated_by_name"]) == ("half tablet", None, "Asha")

    assert client.delete(f"/api/medicines/{medicine_id}", headers=auth(asha["token"])).status_code == 204
    assert client.get("/api/medicines", headers=auth(priya["token"])).json() == []


def test_medicine_schedules_are_validated(client):
    asha = new_profile(client)
    for bad in (
        {**MEDICINE, "end_date": "2026-10-01"},  # ends before it starts
        {**MEDICINE, "times": []},  # no time, and not "only when needed"
        {**MEDICINE, "times": ["25:00"]},
        {**MEDICINE, "food": "with_tea"},
        {**MEDICINE, "name": "  "},
    ):
        assert client.post("/api/medicines", json=bad, headers=auth(asha["token"])).status_code == 422, bad

    as_needed = client.post("/api/medicines", json={**MEDICINE, "times": ["08:00"], "as_needed": True}, headers=auth(asha["token"]))
    assert as_needed.status_code == 201
    assert as_needed.json()["times"] == []  # "only when needed" has no schedule to remind or log against
    for odd in ("0८:3०", "８:00", "8 AM"):  # other scripts' digits, full-width digits, spoken form
        response = client.post("/api/medicines", json={**MEDICINE, "times": [odd]}, headers=auth(asha["token"]))
        assert response.status_code == 422, odd


def test_other_care_profiles_cannot_touch_medicines(client):
    asha = new_profile(client)
    meera = new_profile(client, your_name="Meera")
    medicine = client.post("/api/medicines", json=MEDICINE, headers=auth(asha["token"])).json()

    assert client.get("/api/medicines", headers=auth(meera["token"])).json() == []
    assert client.put(f"/api/medicines/{medicine['id']}", json=MEDICINE, headers=auth(meera["token"])).status_code == 404
    assert client.delete(f"/api/medicines/{medicine['id']}", headers=auth(meera["token"])).status_code == 404


def test_deleting_the_profile_deletes_its_medicines(client):
    asha = new_profile(client)
    client.post("/api/medicines", json=MEDICINE, headers=auth(asha["token"]))

    assert client.delete("/api/profile", headers=auth(asha["token"])).status_code == 204
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Medication)) == 0
