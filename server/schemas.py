"""Request and response shapes for the CareLoop API."""

import re
from datetime import datetime
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
