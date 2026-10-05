from .helpers import auth, invite_and_join, new_profile


def test_contacts_are_shared_and_numbers_are_cleaned(client):
    asha = new_profile(client)
    priya = invite_and_join(client, asha["token"])

    saved = client.put("/api/contacts/emergency", json={"name": "Priya", "phone": "+91 98765-43210"}, headers=auth(priya["token"]))
    assert saved.status_code == 200
    assert saved.json()["phone"] == "+919876543210"
    assert saved.json()["updated_by_name"] == "Priya"

    listed = client.get("/api/contacts", headers=auth(asha["token"])).json()
    assert [(contact["role"], contact["phone"]) for contact in listed] == [("emergency", "+919876543210")]

    replaced = client.put("/api/contacts/emergency", json={"name": "Ravi", "phone": "(022) 2345 6789"}, headers=auth(asha["token"]))
    assert replaced.json()["name"] == "Ravi"
    assert replaced.json()["phone"] == "02223456789"
    assert len(client.get("/api/contacts", headers=auth(priya["token"])).json()) == 1


def test_invalid_contacts_are_rejected(client):
    asha = new_profile(client)
    for phone in ("12", "tel:999", "+91 98765 43210 ext 5", "9" * 16):
        response = client.put("/api/contacts/doctor", json={"name": "Dr. Rao", "phone": phone}, headers=auth(asha["token"]))
        assert response.status_code == 422, phone
    valid = {"name": "Neighbour", "phone": "9876543210"}
    assert client.put("/api/contacts/neighbour", json=valid, headers=auth(asha["token"])).status_code == 422


def test_removing_a_contact(client):
    asha = new_profile(client)
    client.put("/api/contacts/doctor", json={"name": "Dr. Rao", "phone": "9820012345"}, headers=auth(asha["token"]))

    assert client.delete("/api/contacts/doctor", headers=auth(asha["token"])).status_code == 204
    assert client.get("/api/contacts", headers=auth(asha["token"])).json() == []
    assert client.delete("/api/contacts/doctor", headers=auth(asha["token"])).status_code == 404
