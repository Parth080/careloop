import json
import os
from types import SimpleNamespace
from typing import Any

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory database; must be set before the app is imported

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import ai, routes_circle, routes_notes  # noqa: E402
from server.db import Base, engine  # noqa: E402
from server.main import app  # noqa: E402


def completion(tool_calls: list[Any]) -> SimpleNamespace:
    message = SimpleNamespace(tool_calls=tool_calls, content=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class FakeAI:
    """Stands in for the Token Factory client: replays queued replies and records each request."""

    def __init__(self) -> None:
        self.replies: list[Any] = []
        self.requests: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def reply_with_notes(self, *notes: dict[str, Any]) -> None:
        function = SimpleNamespace(name="draft_notes", arguments=json.dumps({"notes": list(notes)}))
        self.replies.append(completion([SimpleNamespace(type="function", function=function)]))

    def reply_without_tool(self) -> None:
        self.replies.append(completion([]))

    def fail_with(self, error: Exception) -> None:
        self.replies.append(error)

    def _create(self, **request: Any) -> Any:
        self.requests.append(request)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def fake_ai() -> FakeAI:
    return FakeAI()


@pytest.fixture
def client(fake_ai: FakeAI):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiters = (routes_circle.profile_limiter, routes_circle.join_failure_limiter, routes_circle.invite_limiter)
    for limiter in (*limiters, *routes_notes.draft_limiters):
        limiter.reset()
    app.dependency_overrides[ai.get_ai_client] = lambda: fake_ai
    yield TestClient(app)
    app.dependency_overrides.clear()
