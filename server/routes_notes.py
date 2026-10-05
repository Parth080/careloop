"""Care notes: AI drafts from a spoken update, then the person's approved, editable record."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError
from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session, selectinload

from .ai import UnusableDraft, draft_notes, get_ai_client, model_name
from .db import Member, Note, utcnow
from .schemas import NoteCreate, NoteOut, NoteUpdate, ProposeRequest, ProposeResponse
from .security import DB, CurrentMember, RateLimiter, client_ip, too_many

router = APIRouter(prefix="/api/notes", tags=["notes"])

AIClient = Annotated[OpenAI, Depends(get_ai_client)]

# AI drafts spend the server's Nebius credits, so cap them per care profile (shared by its members,
# so inviting more people doesn't raise it), per network, and for the whole server per day.
profile_draft_limiter = RateLimiter(limit=40, window=300)
network_draft_limiter = RateLimiter(limit=60, window=300)
daily_draft_limiter = RateLimiter(limit=3000, window=86_400)
draft_limiters = (profile_draft_limiter, network_draft_limiter, daily_draft_limiter)


def within_draft_limits(profile_id: int, ip: str) -> bool:
    checks = ((profile_draft_limiter, str(profile_id)), (network_draft_limiter, ip), (daily_draft_limiter, "server"))
    if any(limiter.is_limited(key) for limiter, key in checks):
        return False
    for limiter, key in checks:
        limiter.record(key)
    return True


def visible_to(me: Member) -> tuple[ColumnElement[bool], ...]:
    """Everyone in the circle sees shared notes; a private note is visible only to its author."""
    return Note.profile_id == me.profile_id, or_(Note.private.is_(False), Note.created_by_id == me.id)


def note_out(note: Note) -> NoteOut:
    return NoteOut(
        id=note.id,
        category=note.category,
        title=note.title,
        details=note.details,
        event_time_text=note.event_time_text,
        source_text=note.source_text,
        model=note.model,
        private=note.private,
        created_at=note.created_at,
        created_by_id=note.created_by_id,
        created_by_name=note.created_by.name if note.created_by else None,
        updated_at=note.updated_at,
        updated_by_name=note.updated_by.name if note.updated_by else None,
    )


def find_note(db: Session, me: Member, note_id: int) -> Note:
    note = db.scalar(select(Note).where(Note.id == note_id, *visible_to(me)))
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That note no longer exists.")
    return note


@router.post("/propose")
def propose_notes(body: ProposeRequest, request: Request, me: CurrentMember, db: DB, client: AIClient) -> ProposeResponse:
    if not within_draft_limits(me.profile_id, client_ip(request)):
        raise too_many("That's a lot of notes in a short time. Please wait a few minutes.")
    db.close()  # the model call can take seconds; don't hold a database connection meanwhile
    try:
        notes = draft_notes(client, body.transcript)
    except UnusableDraft as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The assistant couldn't organize that. Your words are still there; please try again."
        ) from exc
    except APITimeoutError as exc:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "The assistant took too long. Please try again.") from exc
    except RateLimitError as exc:
        raise too_many("The assistant is busy. Please try again shortly.") from exc
    except (APIConnectionError, APIStatusError) as exc:
        # Provider errors may echo request details, which can be private, so keep the message generic.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't reach the assistant. Please try again.") from exc
    return ProposeResponse(notes=notes, model=model_name())


@router.get("")
def list_notes(me: CurrentMember, db: DB) -> list[NoteOut]:
    notes = db.scalars(
        select(Note)
        .where(*visible_to(me))
        .options(selectinload(Note.created_by), selectinload(Note.updated_by))
        .order_by(Note.created_at.desc(), Note.id.desc())
        .limit(500)
    )
    return [note_out(note) for note in notes]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_note(body: NoteCreate, me: CurrentMember, db: DB) -> NoteOut:
    note = Note(profile_id=me.profile_id, created_by=me, **body.model_dump())
    db.add(note)
    db.commit()
    return note_out(note)


@router.put("/{note_id}")
def update_note(note_id: int, body: NoteUpdate, me: CurrentMember, db: DB) -> NoteOut:
    note = find_note(db, me, note_id)
    changes = body.model_dump()
    if note.created_by_id != me.id:
        del changes["private"]  # only the author decides who may see their note
    for field, value in changes.items():
        setattr(note, field, value)
    note.updated_by = me
    note.updated_at = utcnow()
    db.commit()
    return note_out(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, me: CurrentMember, db: DB) -> None:
    db.delete(find_note(db, me, note_id))
    db.commit()
