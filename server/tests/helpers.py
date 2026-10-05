from typing import Any

from fastapi.testclient import TestClient

NOTE = {"category": "symptom", "title": "Nausea", "details": "Felt sick after breakfast", "event_time_text": "this morning"}


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def new_profile(
    client: TestClient, your_name: str = "Asha", your_role: str = "care_recipient", person_name: str | None = None
) -> dict[str, Any]:
    body = {"your_name": your_name, "your_role": your_role}
    if person_name:
        body["person_name"] = person_name
    response = client.post("/api/profiles", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def invite_and_join(client: TestClient, inviter_token: str, role: str = "caregiver", name: str = "Priya") -> dict[str, Any]:
    invite = client.post("/api/invites", json={"role": role}, headers=auth(inviter_token))
    assert invite.status_code == 201, invite.text
    response = client.post("/api/invites/accept", json={"code": invite.json()["code"], "your_name": name})
    assert response.status_code == 201, response.text
    return response.json()
