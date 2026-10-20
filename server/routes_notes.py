"""Care notes: AI drafts from a spoken update, then the person's approved, editable record."""

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session, selectinload

from .ai import AIClient, check_ai_limits, draft_notes, friendly_ai_errors, model_name
from .db import Member, Note, utcnow
from .schemas import NoteCreate, NoteOut, NoteUpdate, ProposeRequest, ProposeResponse
from .security import DB, CurrentMember, client_ip

router = APIRouter(prefix="/api/notes", tags=["notes"])


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
    check_ai_limits(me.profile_id, client_ip(request))
    db.close()  # the model call can take seconds; don't hold a database connection meanwhile
    with friendly_ai_errors("The assistant couldn't organize that. Your words are still there; please try again."):
        notes = draft_notes(client, body.transcript)
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
