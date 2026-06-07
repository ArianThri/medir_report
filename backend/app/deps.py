from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Patient, PatientShare, User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    sub = decode_token(token)
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")
    user = db.get(User, int(sub))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user

def require_approved_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin" and not user.is_approved:
        raise HTTPException(status_code=403, detail="Doctor account is pending admin approval")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def can_access_patient(db: Session, user: User, patient: Patient) -> bool:
    if user.role == "admin":
        return True
    if patient.created_by_id == user.id or patient.assigned_doctor_id == user.id:
        return True
    return db.query(PatientShare).filter(PatientShare.patient_id == patient.id, PatientShare.doctor_id == user.id).first() is not None
