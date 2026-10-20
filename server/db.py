"""Database models and sessions. SQLite by default; set DATABASE_URL to use another database."""

import os
from collections.abc import Iterator
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, String, Text, UniqueConstraint, create_engine, event
from sqlalchemy.engine import Dialect, Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parent / "data" / "careloop.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator[datetime]):
    """Store naive UTC (SQLite has no time zones) and always hand back aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Store only time-zone-aware datetimes")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


class CareProfile(Base):
    """The care record of one older adult, shared with the people they invite."""

    __tablename__ = "care_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    person_name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Member(Base):
    """One person's phone signed in to a care profile. Removal is soft so authorship stays visible."""

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20))  # "care_recipient" or "caregiver"
    is_creator: Mapped[bool] = mapped_column(Boolean, default=False)
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    removed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    profile: Mapped[CareProfile] = relationship()


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(12), unique=True)
    role: Mapped[str] = mapped_column(String(20))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    used_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(120))
    details: Mapped[str] = mapped_column(Text)
    event_time_text: Mapped[str | None] = mapped_column(String(200))
    source_text: Mapped[str | None] = mapped_column(Text)  # the words the person approved before AI drafting
    model: Mapped[str | None] = mapped_column(String(100))
    private: Mapped[bool] = mapped_column(Boolean, default=False)  # visible only to its author
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    created_by: Mapped[Member | None] = relationship(foreign_keys=[created_by_id])
    updated_by: Mapped[Member | None] = relationship(foreign_keys=[updated_by_id])


class Medication(Base):
    """A medicine someone in the circle confirmed, usually after checking it against a prescription photo."""

    __tablename__ = "medications"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    strength: Mapped[str | None] = mapped_column(String(60))
    form: Mapped[str | None] = mapped_column(String(40))
    dose: Mapped[str | None] = mapped_column(String(60))  # amount each time, e.g. "1 tablet"
    times: Mapped[list[str]] = mapped_column(JSON, default=list)  # local "HH:MM" times of day, sorted
    food: Mapped[str | None] = mapped_column(String(20))
    as_needed: Mapped[bool] = mapped_column(Boolean, default=False)
    instructions: Mapped[str | None] = mapped_column(String(300))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)  # last day, inclusive; None while ongoing
    source_text: Mapped[str | None] = mapped_column(String(300))  # the prescription line it came from
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    created_by: Mapped[Member | None] = relationship(foreign_keys=[created_by_id])
    updated_by: Mapped[Member | None] = relationship(foreign_keys=[updated_by_id])


class DoseLog(Base):
    """Whether one scheduled dose was taken or skipped, and who said so."""

    __tablename__ = "dose_logs"
    __table_args__ = (UniqueConstraint("medication_id", "day", "time"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    medication_id: Mapped[int] = mapped_column(ForeignKey("medications.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)  # the local calendar day the dose was due
    time: Mapped[str] = mapped_column(String(5))  # the scheduled "HH:MM"
    status: Mapped[str] = mapped_column(String(10))  # "taken" or "skipped"
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    recorded_by: Mapped[Member | None] = relationship()


class Appointment(Base):
    """A doctor visit, test or call, on a local calendar day with an optional time."""

    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    day: Mapped[date] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(String(5))  # local "HH:MM"; None until someone knows it
    place: Mapped[str | None] = mapped_column(String(200))
    with_whom: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    created_by: Mapped[Member | None] = relationship(foreign_keys=[created_by_id])
    updated_by: Mapped[Member | None] = relationship(foreign_keys=[updated_by_id])


class TrustedContact(Base):
    """The person to call in an emergency, and the doctor. One of each per care profile."""

    __tablename__ = "trusted_contacts"
    __table_args__ = (UniqueConstraint("profile_id", "role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("care_profiles.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "emergency" or "doctor"
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(20))
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    updated_by: Mapped[Member | None] = relationship()


def make_engine(url: str) -> Engine:
    if not url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True)
    options: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
    if url in ("sqlite://", "sqlite:///:memory:"):
        options["poolclass"] = StaticPool  # one shared in-memory database, used by tests
    engine = create_engine(url, **options)

    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection: Any, _record: Any) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    return engine


engine = make_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    if DATABASE_URL.startswith("sqlite:///") and DATABASE_URL != "sqlite:///:memory:":
        Path(DATABASE_URL.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
