"""Per-device sign-in tokens, invite codes and simple in-memory rate limits."""

import hashlib
import secrets
import threading
import time
from collections import deque
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .db import Member, get_db, utcnow

# No 0/O or 1/I/L, so a code read aloud over the phone is hard to mistype.
INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
INVITE_LENGTH = 6


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(INVITE_LENGTH))


def normalize_invite_code(raw: str) -> str:
    return "".join(character for character in raw.upper() if character.isalnum())


def format_invite_code(code: str) -> str:
    return f"{code[:3]}-{code[3:]}"


class RateLimiter:
    """Allow at most `limit` events per `window` seconds for each key, within this server process."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        events = self._events.setdefault(key, deque())
        while events and now - events[0] >= self.window:
            events.popleft()
        return events

    def is_limited(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= self.limit

    def record(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._recent(key, now).append(now)

    def allow(self, key: str) -> bool:
        """Record an event and return True, unless the key is already at its limit."""
        with self._lock:
            now = time.monotonic()
            events = self._recent(key, now)
            if len(events) >= self.limit:
                return False
            events.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


MAX_BODY_BYTES = 10 * 1024 * 1024  # a resized prescription photo is well under this
TOO_LARGE = "That's too big to send. Try a smaller photo."


class BodySizeLimit:
    """Refuse request bodies over `limit` bytes before anything (even sign-in) reads them into memory."""

    def __init__(self, app: ASGIApp, limit: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = Headers(scope=scope).get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > self.limit):
            await JSONResponse({"detail": TOO_LARGE}, status_code=status.HTTP_413_CONTENT_TOO_LARGE)(scope, receive, send)
            return
        received = 0

        async def counted_receive() -> Message:  # for bodies sent without a declared length
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, TOO_LARGE)
            return message

        await self.app(scope, counted_receive, send)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def too_many(message: str) -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message)


DB = Annotated[Session, Depends(get_db)]


def current_member(db: DB, authorization: Annotated[str | None, Header()] = None) -> Member:
    scheme, _, token = (authorization or "").partition(" ")
    member = None
    if scheme.lower() == "bearer" and token:
        member = db.scalar(select(Member).where(Member.token_hash == hash_token(token), Member.removed_at.is_(None)))
    if member is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "This phone is no longer signed in to CareLoop.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    now = utcnow()
    if member.last_seen_at is None or now - member.last_seen_at > timedelta(minutes=5):
        member.last_seen_at = now
        db.commit()
    return member


CurrentMember = Annotated[Member, Depends(current_member)]
