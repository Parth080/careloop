"""The emergency contact and the doctor, shared by everyone in the care circle."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from .db import TrustedContact, utcnow
from .schemas import ContactIn, ContactOut, ContactRole
from .security import DB, CurrentMember

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def contact_out(contact: TrustedContact) -> ContactOut:
    return ContactOut(
        role=contact.role,
        name=contact.name,
        phone=contact.phone,
        updated_at=contact.updated_at,
        updated_by_name=contact.updated_by.name if contact.updated_by else None,
    )


@router.get("")
def list_contacts(me: CurrentMember, db: DB) -> list[ContactOut]:
    contacts = db.scalars(
        select(TrustedContact)
        .where(TrustedContact.profile_id == me.profile_id)
        .options(selectinload(TrustedContact.updated_by))
        .order_by(TrustedContact.role)
    )
    return [contact_out(contact) for contact in contacts]


@router.put("/{role}")
def save_contact(role: ContactRole, body: ContactIn, me: CurrentMember, db: DB) -> ContactOut:
    contact = db.scalar(
        select(TrustedContact).where(TrustedContact.profile_id == me.profile_id, TrustedContact.role == role)
    ) or TrustedContact(profile_id=me.profile_id, role=role)
    contact.name = body.name
    contact.phone = body.phone
    contact.updated_by = me
    contact.updated_at = utcnow()
    db.add(contact)
    db.commit()
    return contact_out(contact)


@router.delete("/{role}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(role: ContactRole, me: CurrentMember, db: DB) -> None:
    removed = db.execute(
        delete(TrustedContact).where(TrustedContact.profile_id == me.profile_id, TrustedContact.role == role)
    ).rowcount
    if removed == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "There is no saved contact to remove.")
    db.commit()
