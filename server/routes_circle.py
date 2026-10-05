"""Care profiles, invites and members: who can see and change one older adult's care record."""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import CareProfile, Invite, Member, Note, TrustedContact, utcnow
from .schemas import CircleOut, CreateProfileRequest, InviteOut, InviteRequest, JoinRequest, MemberOut, ProfileOut, SessionOut
from .security import (
    DB,
    CurrentMember,
    RateLimiter,
    client_ip,
    format_invite_code,
    hash_token,
    new_invite_code,
    new_token,
    normalize_invite_code,
    too_many,
)

router = APIRouter(prefix="/api", tags=["care circle"])

INVITE_LIFETIME = timedelta(hours=48)
profile_limiter = RateLimiter(limit=20, window=3600)  # new profiles per network per hour
join_failure_limiter = RateLimiter(limit=10, window=900)  # wrong invite codes per network per 15 minutes
invite_limiter = RateLimiter(limit=20, window=3600)  # new codes per care profile per hour


def can_manage(me: Member) -> bool:
    """The older adult controls their own record; whoever set it up may manage caregivers too."""
    return me.role == "care_recipient" or me.is_creator


def may_remove(me: Member, target: Member) -> bool:
    if target.id == me.id or me.role == "care_recipient":
        return True
    return me.is_creator and target.role == "caregiver"


def active_members(db: Session, profile_id: int) -> list[Member]:
    query = select(Member).where(Member.profile_id == profile_id, Member.removed_at.is_(None))
    return list(db.scalars(query.order_by(Member.created_at, Member.id)))


def has_care_recipient(db: Session, profile_id: int) -> bool:
    return any(member.role == "care_recipient" for member in active_members(db, profile_id))


def circle_for(db: Session, me: Member) -> CircleOut:
    def out(member: Member) -> MemberOut:
        return MemberOut(
            id=member.id,
            name=member.name,
            role=member.role,
            is_creator=member.is_creator,
            is_me=member.id == me.id,
            can_remove=member.id != me.id and may_remove(me, member),
            joined_at=member.created_at,
        )

    return CircleOut(
        me=out(me),
        profile=ProfileOut(id=me.profile.id, person_name=me.profile.person_name),
        members=[out(member) for member in active_members(db, me.profile_id)],
        can_manage=can_manage(me),
    )


def signed_in(db: Session, member: Member) -> SessionOut:
    """Give this phone a new sign-in token. The server keeps only its hash."""
    token = new_token()
    member.token_hash = hash_token(token)
    db.add(member)
    db.commit()
    return SessionOut(token=token, **circle_for(db, member).model_dump())


def delete_profile_data(db: Session, profile_id: int) -> None:
    for model in (Note, TrustedContact, Invite, Member):
        db.execute(delete(model).where(model.profile_id == profile_id))
    db.execute(delete(CareProfile).where(CareProfile.id == profile_id))


def already_joined(person_name: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, f"{person_name} already uses CareLoop on their own phone.")


@router.post("/profiles", status_code=status.HTTP_201_CREATED)
def create_profile(body: CreateProfileRequest, request: Request, db: DB) -> SessionOut:
    if not profile_limiter.allow(client_ip(request)):
        raise too_many("Too many new profiles from this network. Please try again later.")
    profile = CareProfile(person_name=body.person_name)
    return signed_in(db, Member(profile=profile, name=body.your_name, role=body.your_role, is_creator=True))


@router.get("/me")
def read_circle(me: CurrentMember, db: DB) -> CircleOut:
    return circle_for(db, me)


@router.post("/invites", status_code=status.HTTP_201_CREATED)
def create_invite(body: InviteRequest, me: CurrentMember, db: DB) -> InviteOut:
    if body.role == "care_recipient":
        # Whoever joins with this code gets full control, so only the people who already have it may hand it out.
        if not can_manage(me):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"Only whoever set up CareLoop can add {me.profile.person_name}'s phone."
            )
        if has_care_recipient(db, me.profile_id):
            raise already_joined(me.profile.person_name)
    if not invite_limiter.allow(str(me.profile_id)):
        raise too_many("That's a lot of invite codes. Please try again in an hour.")
    for _ in range(5):
        invite = Invite(
            profile_id=me.profile_id,
            code=new_invite_code(),
            role=body.role,
            created_by_id=me.id,
            expires_at=utcnow() + INVITE_LIFETIME,
        )
        db.add(invite)
        try:
            db.commit()
        except IntegrityError:  # that random code is taken; draw another
            db.rollback()
            continue
        return InviteOut(code=format_invite_code(invite.code), role=invite.role, expires_at=invite.expires_at)
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Couldn't create an invite code. Please try again.")


@router.post("/invites/accept", status_code=status.HTTP_201_CREATED)
def join_with_invite(body: JoinRequest, request: Request, db: DB) -> SessionOut:
    ip = client_ip(request)
    if join_failure_limiter.is_limited(ip):
        raise too_many("Too many wrong codes. Please wait 15 minutes and try again.")
    now = utcnow()
    invite = db.scalar(
        select(Invite)
        .join(Member, Member.id == Invite.created_by_id)
        .where(
            Invite.code == normalize_invite_code(body.code),
            Invite.used_at.is_(None),
            Invite.expires_at > now,
            Member.removed_at.is_(None),  # a code dies with its creator's access
        )
    )
    # Claim the code in one statement so two phones can't both use it.
    claim = update(Invite).where(Invite.id == (invite.id if invite else -1), Invite.used_at.is_(None))
    if invite is None or db.execute(claim.values(used_at=now)).rowcount != 1:
        db.rollback()
        join_failure_limiter.record(ip)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That code didn't work. Check it, or ask for a new code.")
    if invite.role == "care_recipient" and has_care_recipient(db, invite.profile_id):
        person_name = db.get_one(CareProfile, invite.profile_id).person_name
        db.rollback()
        raise already_joined(person_name)
    member = Member(profile_id=invite.profile_id, name=body.your_name, role=invite.role)
    db.add(member)
    db.flush()
    invite.used_by_id = member.id
    return signed_in(db, member)


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(member_id: int, me: CurrentMember, db: DB) -> None:
    target = db.scalar(
        select(Member).where(Member.id == member_id, Member.profile_id == me.profile_id, Member.removed_at.is_(None))
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person is no longer in this care circle.")
    if not may_remove(me, target):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Only {me.profile.person_name} or whoever set up CareLoop can remove people."
        )
    now = utcnow()
    target.removed_at = now
    target.token_hash = None
    # Their unused codes stop working, and private notes nobody else can see leave with them.
    db.execute(update(Invite).where(Invite.created_by_id == target.id, Invite.used_at.is_(None)).values(expires_at=now))
    db.execute(delete(Note).where(Note.created_by_id == target.id, Note.private.is_(True)))
    db.flush()
    if not active_members(db, me.profile_id):
        delete_profile_data(db, me.profile_id)  # the last person left, so nothing should linger
    db.commit()


@router.delete("/profile", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(me: CurrentMember, db: DB) -> None:
    if not can_manage(me):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Only {me.profile.person_name} or whoever set up CareLoop can delete everything."
        )
    delete_profile_data(db, me.profile_id)
    db.commit()
