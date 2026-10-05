"""Appointments: doctor visits, tests and calls that anyone in the care circle can add."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .db import Appointment, Member, utcnow
from .schemas import AppointmentIn, AppointmentOut
from .security import DB, CurrentMember

router = APIRouter(prefix="/api/appointments", tags=["appointments"])


def appointment_out(appointment: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=appointment.id,
        title=appointment.title,
        day=appointment.day,
        time=appointment.time,
        place=appointment.place,
        with_whom=appointment.with_whom,
        notes=appointment.notes,
        created_at=appointment.created_at,
        created_by_name=appointment.created_by.name if appointment.created_by else None,
        updated_at=appointment.updated_at,
        updated_by_name=appointment.updated_by.name if appointment.updated_by else None,
    )


def find_appointment(db: Session, me: Member, appointment_id: int) -> Appointment:
    appointment = db.scalar(
        select(Appointment).where(Appointment.id == appointment_id, Appointment.profile_id == me.profile_id)
    )
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That appointment is no longer in the list.")
    return appointment


@router.get("")
def list_appointments(me: CurrentMember, db: DB) -> list[AppointmentOut]:
    appointments = db.scalars(
        select(Appointment)
        .where(Appointment.profile_id == me.profile_id)
        .options(selectinload(Appointment.created_by), selectinload(Appointment.updated_by))
        .order_by(Appointment.day, Appointment.time.is_(None), Appointment.time, Appointment.id)
    )
    return [appointment_out(appointment) for appointment in appointments]


@router.post("", status_code=status.HTTP_201_CREATED)
def add_appointment(body: AppointmentIn, me: CurrentMember, db: DB) -> AppointmentOut:
    appointment = Appointment(profile_id=me.profile_id, created_by=me, **body.model_dump())
    db.add(appointment)
    db.commit()
    return appointment_out(appointment)


@router.put("/{appointment_id}")
def update_appointment(appointment_id: int, body: AppointmentIn, me: CurrentMember, db: DB) -> AppointmentOut:
    appointment = find_appointment(db, me, appointment_id)
    for field, value in body.model_dump().items():
        setattr(appointment, field, value)
    appointment.updated_by = me
    appointment.updated_at = utcnow()
    db.commit()
    return appointment_out(appointment)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(appointment_id: int, me: CurrentMember, db: DB) -> None:
    db.delete(find_appointment(db, me, appointment_id))
    db.commit()
