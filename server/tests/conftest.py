import json
import os
import threading
from types import SimpleNamespace
from typing import Any

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory database; must be set before the app is imported

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import ai, routes_circle  # noqa: E402
from server.db import Base, engine  # noqa: E402
from server.main import app  # noqa: E402


def completion(tool_calls: list[Any], content: str | None = None, finish_reason: str = "stop") -> SimpleNamespace:
    message = SimpleNamespace(tool_calls=tool_calls, content=content)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])


class FakeAI:
    """Stands in for the Token Factory client: replays queued replies and records each request.

    Replies can be queued for one model (the two prescription readers run at the same time, so their
    order isn't fixed); calls to any other model take the next reply from the shared queue."""

    def __init__(self) -> None:
        self.replies: list[Any] = []
        self.by_model: dict[str, list[Any]] = {}
        self.requests: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _queue(self, model: str | None) -> list[Any]:
        return self.by_model.setdefault(model, []) if model else self.replies

    def reply_with_tool(self, name: str, arguments: dict[str, Any], model: str | None = None) -> None:
        function = SimpleNamespace(name=name, arguments=json.dumps(arguments))
        self._queue(model).append(completion([SimpleNamespace(type="function", function=function)]))

    def reply_with_notes(self, *notes: dict[str, Any]) -> None:
        self.reply_with_tool("draft_notes", {"notes": list(notes)})

    def reply_with_text(self, text: str, finish_reason: str = "stop", model: str | None = None) -> None:
        self._queue(model).append(completion([], content=text, finish_reason=finish_reason))

    def reply_without_tool(self) -> None:
        self.replies.append(completion([]))

    def fail_with(self, error: Exception, model: str | None = None) -> None:
        self._queue(model).append(error)

    def calls_to(self, model: str) -> list[dict[str, Any]]:
        return [request for request in self.requests if request["model"] == model]

    def _create(self, **request: Any) -> Any:
        with self._lock:
            self.requests.append(request)
            own = self.by_model.get(request["model"])
            reply = (own if own else self.replies).pop(0)
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
    for limiter in (*limiters, *ai.ai_limiters):
        limiter.reset()
    app.dependency_overrides[ai.get_ai_client] = lambda: fake_ai
    yield TestClient(app)
    app.dependency_overrides.clear()
