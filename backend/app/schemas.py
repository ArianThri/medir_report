from typing import Any
from pydantic import BaseModel, EmailStr

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    role: str = "doctor"

class PatientCreate(BaseModel):
    full_name: str
    age: str = ""
    gender: str = ""
    date_of_birth: str = ""
    reference: str = ""
    patient_reference: str = ""
    notes: str = ""
    assigned_doctor_id: int | None = None

class PatientUpdate(BaseModel):
    full_name: str | None = None
    age: str | None = None
    gender: str | None = None
    date_of_birth: str | None = None
    reference: str | None = None
    patient_reference: str | None = None
    notes: str | None = None
    assigned_doctor_id: int | None = None

class ShareRequest(BaseModel):
    doctor_id: int

class ReportUpdate(BaseModel):
    editable_report: dict[str, Any] | None = None
    doctor_opinion: str | None = None
    status: str = "draft"
