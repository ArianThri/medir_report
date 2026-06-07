from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps import get_current_user, require_admin, require_approved_user
from app.models import User
from app.schemas import RegisterRequest
from app.security import create_access_token, get_password_hash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def user_to_dict(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_approved": user.is_approved,
        "is_active": user.is_active,
    }


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    first_user = db.query(User).count() == 0

    # Only the first account can become admin through registration. Every later
    # public registration is a doctor account, so users cannot create extra admins.
    role = "admin" if first_user else "doctor"

    # First account is the admin and is approved immediately. Later public
    # registrations are doctor accounts and must wait for admin approval.
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        hashed_password=get_password_hash(payload.password),
        role=role,
        is_approved=True if role == "admin" else False,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Account created", "user": user_to_dict(user)}


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username.lower().strip()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    if user.role != "admin" and not user.is_approved:
        raise HTTPException(status_code=403, detail="Your doctor account is waiting for admin approval")
    token = create_access_token(str(user.id), timedelta(minutes=settings.access_token_expire_minutes))
    return {"access_token": token, "token_type": "bearer", "user": user_to_dict(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@router.get("/doctors")
def doctors(user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    return [
        user_to_dict(u)
        for u in db.query(User)
        .filter(User.role == "doctor", User.is_active == True, User.is_approved == True)  # noqa: E712
        .order_by(User.full_name.asc(), User.email.asc())
        .all()
    ]


@router.get("/pending-doctors")
def pending(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [
        user_to_dict(u)
        for u in db.query(User)
        .filter(User.role == "doctor", User.is_approved == False, User.is_active == True)  # noqa: E712
        .order_by(User.created_at.desc())
        .all()
    ]


@router.post("/approve-doctor/{doctor_id}")
def approve(doctor_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    doctor = db.get(User, doctor_id)
    if not doctor or doctor.role != "doctor":
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.is_approved = True
    doctor.is_active = True
    db.commit()
    db.refresh(doctor)
    return {"message": "Doctor approved", "user": user_to_dict(doctor)}


@router.post("/deactivate-doctor/{doctor_id}")
def deactivate(doctor_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    doctor = db.get(User, doctor_id)
    if not doctor or doctor.role != "doctor":
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.is_active = False
    db.commit()
    db.refresh(doctor)
    return {"message": "Doctor deactivated", "user": user_to_dict(doctor)}
