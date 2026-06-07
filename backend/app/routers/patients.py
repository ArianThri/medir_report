from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import can_access_patient, require_approved_user
from app.models import MedicalReport, Patient, PatientShare, User
from app.schemas import PatientCreate, PatientUpdate, ShareRequest

router = APIRouter(prefix="/patients", tags=["patients"])


def report_summary(r: MedicalReport):
    return {
        "id": r.id,
        "report_uid": r.report_uid,
        "title": r.title,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "image_count": len(r.images),
        "source_count": len(r.sources),
    }


def patient_to_dict(p: Patient, include_reports: bool = False):
    data = {
        "id": p.id,
        "full_name": p.full_name,
        "age": p.age,
        "gender": p.gender,
        "date_of_birth": p.date_of_birth,
        "reference": p.reference,
        "patient_reference": p.reference,
        "notes": p.notes,
        "created_by_id": p.created_by_id,
        "assigned_doctor_id": p.assigned_doctor_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }
    if include_reports:
        data["reports"] = [
            report_summary(r)
            for r in sorted(p.reports, key=lambda x: x.updated_at or x.created_at, reverse=True)
        ]
    return data


def _visible_patient_query(db: Session, user: User):
    if user.role == "admin":
        return db.query(Patient)
    shared_ids = select(PatientShare.patient_id).where(PatientShare.doctor_id == user.id)
    return db.query(Patient).filter(
        or_(
            Patient.created_by_id == user.id,
            Patient.assigned_doctor_id == user.id,
            Patient.id.in_(shared_ids),
        )
    )


def _get_doctor_or_400(db: Session, doctor_id: int | None) -> User | None:
    if doctor_id is None:
        return None
    doctor = db.get(User, doctor_id)
    if not doctor or doctor.role != "doctor" or not doctor.is_active or not doctor.is_approved:
        raise HTTPException(status_code=400, detail="Assigned doctor does not exist or is not approved")
    return doctor


@router.get("")
def list_patients(user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    patients = _visible_patient_query(db, user).order_by(Patient.updated_at.desc()).all()
    return [patient_to_dict(p, include_reports=True) for p in patients]


@router.post("")
def create_patient(payload: PatientCreate, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    if user.role == "doctor":
        assigned_doctor_id = user.id
        created_by_id = user.id
    else:
        assigned_doctor_id = payload.assigned_doctor_id
        if assigned_doctor_id is not None:
            _get_doctor_or_400(db, assigned_doctor_id)
        created_by_id = user.id

    patient = Patient(
        full_name=payload.full_name.strip(),
        age=payload.age,
        gender=payload.gender,
        date_of_birth=payload.date_of_birth,
        reference=payload.reference or payload.patient_reference,
        notes=payload.notes,
        created_by_id=created_by_id,
        assigned_doctor_id=assigned_doctor_id,
        updated_at=datetime.utcnow(),
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient, include_reports=True)


@router.get("/{patient_id}")
def get_patient(patient_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not can_access_patient(db, user, patient):
        raise HTTPException(status_code=403, detail="Access denied")
    return patient_to_dict(patient, include_reports=True)


@router.put("/{patient_id}")
def update_patient(patient_id: int, payload: PatientUpdate, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not can_access_patient(db, user, patient):
        raise HTTPException(status_code=403, detail="Access denied")

    data = payload.model_dump(exclude_unset=True)
    if data.get("patient_reference") and not data.get("reference"):
        data["reference"] = data["patient_reference"]

    # A doctor can edit the clinical/patient fields but cannot move the patient
    # into another doctor's ownership. Admin can reassign when needed.
    if user.role != "admin":
        data.pop("assigned_doctor_id", None)
    elif "assigned_doctor_id" in data:
        _get_doctor_or_400(db, data.get("assigned_doctor_id"))

    for key, value in data.items():
        if key != "patient_reference":
            setattr(patient, key, value)
    patient.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient, include_reports=True)


@router.post("/{patient_id}/share")
def share(patient_id: int, payload: ShareRequest, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not can_access_patient(db, user, patient):
        raise HTTPException(status_code=403, detail="Access denied")
    if payload.doctor_id in {patient.created_by_id, patient.assigned_doctor_id}:
        return {"message": "Patient already available to this doctor"}
    _get_doctor_or_400(db, payload.doctor_id)
    existing = db.query(PatientShare).filter(
        PatientShare.patient_id == patient_id,
        PatientShare.doctor_id == payload.doctor_id,
    ).first()
    if not existing:
        db.add(PatientShare(patient_id=patient_id, doctor_id=payload.doctor_id, shared_by_id=user.id))
        db.commit()
    return {"message": "Patient shared"}
