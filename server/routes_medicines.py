"""Medicines: read a prescription photo into a draft list, then keep the schedule people confirm."""

import base64
import binascii
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .ai import (
    AIClient,
    WrongPhoto,
    check_ai_limits,
    friendly_ai_errors,
    model_name,
    organize_prescription,
    prescription_model,
    read_package,
    read_prescription,
)
from .db import DoseLog, Medication, Member, utcnow
from .schemas import DoseIn, DoseOut, MedicineIn, MedicineOut, PackageResponse, PhotoRequest, PrescriptionResponse
from .security import DB, CurrentMember, client_ip

router = APIRouter(prefix="/api", tags=["medicines"])

IMAGE_SIGNATURES = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n"}
LONGEST_DOSE_RANGE = timedelta(days=62)


def medicine_out(medicine: Medication) -> MedicineOut:
    return MedicineOut(
        id=medicine.id,
        name=medicine.name,
        strength=medicine.strength,
        form=medicine.form,
        dose=medicine.dose,
        times=medicine.times,
        food=medicine.food,
        as_needed=medicine.as_needed,
        instructions=medicine.instructions,
        source_text=medicine.source_text,
        start_date=medicine.start_date,
        end_date=medicine.end_date,
        created_at=medicine.created_at,
        created_by_name=medicine.created_by.name if medicine.created_by else None,
        updated_at=medicine.updated_at,
        updated_by_name=medicine.updated_by.name if medicine.updated_by else None,
    )


def find_medicine(db: Session, me: Member, medicine_id: int) -> Medication:
    medicine = db.scalar(select(Medication).where(Medication.id == medicine_id, Medication.profile_id == me.profile_id))
    if medicine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That medicine is no longer in the list.")
    return medicine


def checked_image(body: PhotoRequest) -> str:
    """The photo's base64 without line breaks, after making sure it really is the image it claims to be."""
    image_base64 = "".join(body.image_base64.split())
    try:
        image = base64.b64decode(image_base64, validate=True)
    except binascii.Error:
        image = b""
    if not image.startswith(IMAGE_SIGNATURES[body.media_type]):  # checked before spending any AI credits
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That photo couldn't be opened. Please take it again.")
    return image_base64


@router.post("/prescriptions/read")
def read_prescription_photo(
    body: PhotoRequest, request: Request, me: CurrentMember, db: DB, client: AIClient
) -> PrescriptionResponse:
    image_base64 = checked_image(body)
    check_ai_limits(me.profile_id, client_ip(request))
    db.close()  # reading takes several seconds; don't hold a database connection meanwhile
    try:
        with friendly_ai_errors("Couldn't make sense of this prescription. Try a sharper photo, or add the medicines by hand."):
            readings = read_prescription(client, image_base64, body.media_type)
            draft = organize_prescription(client, readings)
    except WrongPhoto as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    # The photo itself is never stored: only medicines that someone confirms are saved.
    return PrescriptionResponse(
        medicines=draft.medicines,
        other_instructions=draft.other_instructions,
        readings=readings,
        organizing_model=prescription_model(),
    )


@router.post("/medicines/read-package")
def read_medicine_package(body: PhotoRequest, request: Request, me: CurrentMember, db: DB, client: AIClient) -> PackageResponse:
    image_base64 = checked_image(body)
    check_ai_limits(me.profile_id, client_ip(request))
    db.close()
    try:
        with friendly_ai_errors("Couldn't read this package. Try a sharper photo of the side with the name."):
            draft, reading = read_package(client, image_base64, body.media_type)
    except WrongPhoto as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return PackageResponse(**draft.model_dump(), reading=reading, organizing_model=model_name())


@router.get("/medicines")
def list_medicines(me: CurrentMember, db: DB) -> list[MedicineOut]:
    medicines = db.scalars(
        select(Medication)
        .where(Medication.profile_id == me.profile_id)
        .options(selectinload(Medication.created_by), selectinload(Medication.updated_by))
        .order_by(Medication.start_date.desc(), Medication.id.desc())
    )
    return [medicine_out(medicine) for medicine in medicines]


@router.post("/medicines", status_code=status.HTTP_201_CREATED)
def add_medicine(body: MedicineIn, me: CurrentMember, db: DB) -> MedicineOut:
    medicine = Medication(profile_id=me.profile_id, created_by=me, **body.model_dump())
    db.add(medicine)
    db.commit()
    return medicine_out(medicine)


@router.put("/medicines/{medicine_id}")
def update_medicine(medicine_id: int, body: MedicineIn, me: CurrentMember, db: DB) -> MedicineOut:
    medicine = find_medicine(db, me, medicine_id)
    for field, value in body.model_dump().items():
        setattr(medicine, field, value)
    medicine.updated_by = me
    medicine.updated_at = utcnow()
    db.commit()
    return medicine_out(medicine)


@router.delete("/medicines/{medicine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medicine(medicine_id: int, me: CurrentMember, db: DB) -> None:
    medicine = find_medicine(db, me, medicine_id)
    db.execute(delete(DoseLog).where(DoseLog.medication_id == medicine.id))
    db.delete(medicine)
    db.commit()


def dose_out(log: DoseLog) -> DoseOut:
    return DoseOut(
        medication_id=log.medication_id,
        day=log.day,
        time=log.time,
        status=log.status,
        recorded_by_name=log.recorded_by.name if log.recorded_by else None,
        recorded_at=log.recorded_at,
    )


@router.get("/doses")
def list_doses(from_day: date, to_day: date, me: CurrentMember, db: DB) -> list[DoseOut]:
    if to_day < from_day or to_day - from_day > LONGEST_DOSE_RANGE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ask for up to two months of doses at a time.")
    logs = db.scalars(
        select(DoseLog)
        .where(DoseLog.profile_id == me.profile_id, DoseLog.day >= from_day, DoseLog.day <= to_day)
        .options(selectinload(DoseLog.recorded_by))
        .order_by(DoseLog.day, DoseLog.time, DoseLog.medication_id)
    )
    return [dose_out(log) for log in logs]


@router.put("/doses")
def record_dose(body: DoseIn, me: CurrentMember, db: DB) -> DoseOut:
    medicine = find_medicine(db, me, body.medication_id)
    scheduled = body.time in medicine.times and medicine.start_date <= body.day and (medicine.end_date is None or body.day <= medicine.end_date)
    if not scheduled:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{medicine.name} isn't scheduled for then.")
    find_log = select(DoseLog).where(DoseLog.medication_id == medicine.id, DoseLog.day == body.day, DoseLog.time == body.time)
    for _ in range(2):  # two phones can mark the same dose at once; the second one updates the first's record
        log = db.scalar(find_log) or DoseLog(profile_id=me.profile_id, medication_id=medicine.id, day=body.day, time=body.time)
        log.status = body.status
        log.recorded_by = me
        log.recorded_at = utcnow()
        db.add(log)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        return dose_out(log)
    raise HTTPException(status.HTTP_409_CONFLICT, "Someone else just marked this dose. Please try again.")


@router.delete("/doses", status_code=status.HTTP_204_NO_CONTENT)
def undo_dose(medication_id: int, day: date, time: str, me: CurrentMember, db: DB) -> None:
    removed = db.execute(
        delete(DoseLog).where(
            DoseLog.profile_id == me.profile_id,
            DoseLog.medication_id == medication_id,
            DoseLog.day == day,
            DoseLog.time == time,
        )
    ).rowcount
    if removed == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nothing was recorded for that dose.")
    db.commit()
