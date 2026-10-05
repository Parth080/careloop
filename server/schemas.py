"""Request and response shapes for the CareLoop API."""

import json
import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["care_recipient", "caregiver"]
Category = Literal["symptom", "appointment", "medication", "doctor", "general"]
ContactRole = Literal["emergency", "doctor"]
Name = Annotated[str, Field(min_length=1, max_length=80)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CreateProfileRequest(Input):
    your_name: Name
    your_role: Role
    person_name: Name | None = None  # the older adult; ignored when they are setting it up themselves

    @model_validator(mode="after")
    def person_is_named(self) -> "CreateProfileRequest":
        if self.your_role == "care_recipient":
            self.person_name = self.your_name
        elif not self.person_name:
            raise ValueError("Enter the name of the person you care for")
        return self


class JoinRequest(Input):
    code: str = Field(min_length=4, max_length=20)
    your_name: Name


class InviteRequest(Input):
    role: Role


class MemberOut(BaseModel):
    id: int
    name: str
    role: Role
    is_creator: bool
    is_me: bool
    can_remove: bool
    joined_at: datetime


class ProfileOut(BaseModel):
    id: int
    person_name: str


class CircleOut(BaseModel):
    me: MemberOut
    profile: ProfileOut
    members: list[MemberOut]
    can_manage: bool  # may remove caregivers and delete the whole profile


class SessionOut(CircleOut):
    token: str


class InviteOut(BaseModel):
    code: str
    role: Role
    expires_at: datetime


class NoteFields(Input):
    category: Category
    title: str = Field(min_length=1, max_length=120)
    details: str = Field(min_length=1, max_length=1000)
    event_time_text: str | None = Field(default=None, max_length=200)

    @field_validator("event_time_text")
    @classmethod
    def blank_time_is_unknown(cls, value: str | None) -> str | None:
        return value or None


class NoteCreate(NoteFields):
    source_text: str | None = Field(default=None, max_length=4000)
    model: str | None = Field(default=None, max_length=100)
    private: bool = False


class NoteUpdate(NoteFields):
    private: bool


class NoteOut(BaseModel):
    id: int
    category: Category
    title: str
    details: str
    event_time_text: str | None
    source_text: str | None
    model: str | None
    private: bool
    created_at: datetime
    created_by_id: int | None
    created_by_name: str | None
    updated_at: datetime | None
    updated_by_name: str | None


class ProposeRequest(Input):
    transcript: str = Field(min_length=2, max_length=4000)


class DraftList(Input):
    notes: list[NoteFields] = Field(max_length=4)


class ProposeResponse(BaseModel):
    notes: list[NoteFields]
    model: str


CLOCK = re.compile(r"([01][0-9]|2[0-3]):[0-5][0-9]")  # ASCII digits only: \\d also matches other scripts' digits
SPOKEN_CLOCK = re.compile(r"(1[0-2]|0?[1-9])(?:[:.]([0-5][0-9]))?\s*([ap])\.?\s*m\.?", re.IGNORECASE)
FoodTiming = Literal["before_food", "after_food", "with_food"]
MedicineField = Literal["name", "strength", "form", "dose", "times", "food", "duration", "instructions", "other"]
MEDICINE_FIELD_ALIASES = {
    "medicine": "name",
    "medicine_name": "name",
    "drug": "name",
    "dosage": "dose",
    "amount": "dose",
    "quantity": "dose",
    "time": "times",
    "timing": "times",
    "timings": "times",
    "frequency": "times",
    "schedule": "times",
    "duration_days": "duration",
    "days": "duration",
    "period": "duration",
    "food_timing": "food",
    "meal": "food",
    "meals": "food",
    "instruction": "instructions",
    "direction": "instructions",
    "directions": "instructions",
}
FOOD_ALIASES = {
    "before food": "before_food",
    "before meals": "before_food",
    "empty stomach": "before_food",
    "ac": "before_food",
    "after food": "after_food",
    "after meals": "after_food",
    "pc": "after_food",
    "with food": "with_food",
    "with meals": "with_food",
}
DRAFT_TEXT_LIMITS = {"name": 120, "strength": 60, "form": 40, "dose": 60, "instructions": 300, "source_text": 300}
MOST_MEDICINES = 30


def clock_from_text(text: str) -> str | None:
    """ "08:00", "8:00", "8:30 pm" or "8 AM" as "HH:MM"; None when it isn't clearly a time."""
    value = text.strip()
    if CLOCK.fullmatch(value.zfill(5)):
        return value.zfill(5)
    spoken = SPOKEN_CLOCK.fullmatch(value)
    if spoken:
        hour = int(spoken[1]) % 12 + (12 if spoken[3].lower() == "p" else 0)
        return f"{hour:02d}:{spoken[2] or '00'}"
    return None


class MedicineFields(Input):
    name: str = Field(min_length=1, max_length=120)
    strength: str | None = Field(default=None, max_length=60)
    form: str | None = Field(default=None, max_length=40)
    dose: str | None = Field(default=None, max_length=60)
    times: list[str] = Field(default_factory=list, max_length=8)  # local "HH:MM", 24-hour
    food: FoodTiming | None = None
    as_needed: bool = False
    instructions: str | None = Field(default=None, max_length=300)
    source_text: str | None = Field(default=None, max_length=300)

    @field_validator("strength", "form", "dose", "instructions", "source_text")
    @classmethod
    def blank_is_missing(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("times", mode="before")
    @classmethod
    def null_is_no_times(cls, value: object) -> object:
        return [] if value is None else value

    @field_validator("times")
    @classmethod
    def clock_times(cls, values: list[str]) -> list[str]:
        times = {value.strip().zfill(5) for value in values}  # accept "8:00" as "08:00"
        if not all(CLOCK.fullmatch(time) for time in times):
            raise ValueError("Times must look like 08:00 or 21:30")
        return sorted(times)


class MedicineDraft(MedicineFields):
    """What the assistant proposes. Lenient on purpose: anything it got wrong becomes an "unclear" flag for
    the person checking the photo, instead of failing the whole prescription."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    name: str = Field(default="", max_length=120)  # empty when it couldn't be read: the person fills it in
    duration_days: int | None = None
    unclear: list[MedicineField] = Field(default_factory=list)
    alternatives: list[str] = Field(default_factory=list, description="Other spellings of this medicine's name seen in the readings")

    @model_validator(mode="before")
    @classmethod
    def tidy(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        draft = dict(data)
        raw_flags = draft.get("unclear") if isinstance(draft.get("unclear"), list) else []
        flags = [MEDICINE_FIELD_ALIASES.get(str(flag).strip().lower(), str(flag).strip().lower()) for flag in raw_flags]
        flags = [flag if flag in MedicineField.__args__ else "other" for flag in flags]

        if not isinstance(draft.get("name"), str) or not draft["name"].strip():
            draft["name"] = ""
            flags.append("name")
        times = draft.get("times") or []
        if isinstance(times, str):  # e.g. "08:00 and 21:00"
            times = re.split(r",|\band\b", times)
        clocks = [clock_from_text(str(time)) for time in times if str(time).strip()]
        if None in clocks:
            flags.append("times")
        draft["times"] = [clock for clock in clocks if clock]
        food = draft.get("food")
        if food is not None and food not in FoodTiming.__args__:
            draft["food"] = FOOD_ALIASES.get(str(food).strip().lower().replace("_", " "))
            if draft["food"] is None:
                flags.append("food")
        days = draft.get("duration_days")
        if days is not None:
            try:
                draft["duration_days"] = int(days) if 1 <= int(days) <= 3650 else None
            except (TypeError, ValueError):
                draft["duration_days"] = None
            if draft["duration_days"] is None:
                flags.append("duration")
        for field, limit in DRAFT_TEXT_LIMITS.items():
            if isinstance(draft.get(field), str):
                draft[field] = draft[field][:limit]
        draft["unclear"] = list(dict.fromkeys(flags))
        spellings = draft.get("alternatives") if isinstance(draft.get("alternatives"), list) else []
        draft["alternatives"] = list(dict.fromkeys(str(item).strip()[:120] for item in spellings if str(item).strip()))[:4]
        return draft


class PrescriptionDraft(Input):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    medicines: list[MedicineDraft] = Field(max_length=MOST_MEDICINES)
    other_instructions: list[str] = Field(default_factory=list, max_length=12)

    @model_validator(mode="before")
    @classmethod
    def tidy(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        draft = dict(data)
        medicines = draft.get("medicines")
        if isinstance(medicines, str):  # some models wrap the list in a string, sometimes with junk after it
            try:
                medicines = json.JSONDecoder().raw_decode(medicines.strip())[0]
            except ValueError:
                pass
        advice = [str(line).strip()[:300] for line in draft.get("other_instructions") or [] if str(line).strip()]
        if isinstance(medicines, list) and len(medicines) > MOST_MEDICINES:
            medicines = medicines[:MOST_MEDICINES]
            advice.append(f"Only the first {MOST_MEDICINES} medicines were read. Please add the rest yourself.")
        draft["medicines"] = medicines
        draft["other_instructions"] = advice[-12:] if len(advice) > 12 else advice
        return draft


class PhotoRequest(Input):
    image_base64: str = Field(min_length=100, max_length=8_000_000)
    media_type: Literal["image/jpeg", "image/png"]


class Reading(BaseModel):
    """What one vision model read in a photo."""

    model: str
    text: str


class PrescriptionResponse(BaseModel):
    medicines: list[MedicineDraft]
    other_instructions: list[str]
    readings: list[Reading]  # usually two independent readings, so people can compare them with the photo
    organizing_model: str


class PackageDraft(Input):
    """What's printed on a medicine strip, bottle or box: far easier to read than a doctor's handwriting."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    name: str | None = Field(default=None, description="The brand name as printed, or the generic name if there is no brand")
    strength: str | None = None
    form: str | None = None
    contains: str | None = Field(default=None, description="The active ingredients with amounts, as printed")

    @model_validator(mode="before")
    @classmethod
    def tidy(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        limits = {"name": 120, "strength": 60, "form": 40, "contains": 300}
        trimmed = {key: value.strip()[:limits[key]] or None for key, value in data.items() if key in limits and isinstance(value, str)}
        return {**data, **trimmed}


class PackageResponse(PackageDraft):
    reading: Reading
    organizing_model: str


class MedicineIn(MedicineFields):
    start_date: date
    end_date: date | None = None

    @model_validator(mode="after")
    def schedule_makes_sense(self) -> "MedicineIn":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("The last day can't be before the first day")
        if self.as_needed:
            self.times = []  # "only when needed" has no schedule, so nothing can be reminded or logged against it
        elif not self.times:
            raise ValueError("Add at least one time, or mark it as taken only when needed")
        return self


class MedicineOut(MedicineIn):
    id: int
    created_at: datetime
    created_by_name: str | None
    updated_at: datetime | None
    updated_by_name: str | None


DoseStatus = Literal["taken", "skipped"]


class DoseKey(Input):
    medication_id: int
    day: date
    time: str = Field(pattern=rf"^{CLOCK.pattern}$")  # pydantic patterns aren't anchored by default


class DoseIn(DoseKey):
    status: DoseStatus


class DoseOut(BaseModel):
    medication_id: int
    day: date
    time: str
    status: DoseStatus
    recorded_by_name: str | None
    recorded_at: datetime


class AppointmentIn(Input):
    title: str = Field(min_length=1, max_length=120)
    day: date
    time: str | None = Field(default=None, pattern=rf"^{CLOCK.pattern}$")
    place: str | None = Field(default=None, max_length=200)
    with_whom: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("time", "place", "with_whom", "notes", mode="before")
    @classmethod
    def blank_is_missing(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


class AppointmentOut(AppointmentIn):
    id: int
    created_at: datetime
    created_by_name: str | None
    updated_at: datetime | None
    updated_by_name: str | None


PHONE_SEPARATORS = re.compile(r"[ ().-]")


class ContactIn(Input):
    name: Name
    phone: str = Field(min_length=3, max_length=25)

    @field_validator("phone")
    @classmethod
    def dialable(cls, value: str) -> str:
        number = PHONE_SEPARATORS.sub("", value)
        if not re.fullmatch(r"\+?[0-9]{3,15}", number):
            raise ValueError("Enter 3 to 15 digits, with an optional + at the start")
        return number


class ContactOut(BaseModel):
    role: ContactRole
    name: str
    phone: str
    updated_at: datetime
    updated_by_name: str | None
