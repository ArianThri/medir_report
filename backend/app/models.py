from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="doctor")
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    age: Mapped[str] = mapped_column(String(50), default="")
    gender: Mapped[str] = mapped_column(String(50), default="")
    date_of_birth: Mapped[str] = mapped_column(String(80), default="")
    reference: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_doctor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reports: Mapped[list["MedicalReport"]] = relationship(back_populates="patient", cascade="all, delete-orphan")

class PatientShare(Base):
    __tablename__ = "patient_shares"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    shared_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class MedicalReport(Base):
    __tablename__ = "medical_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), default="Medical Report")
    report_type: Mapped[str] = mapped_column(String(50), default="unknown_report")
    status: Mapped[str] = mapped_column(String(30), default="draft")
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    editable_report: Mapped[str] = mapped_column(Text, default="{}")
    doctor_opinion: Mapped[str] = mapped_column(Text, default="")
    storage_root: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    patient: Mapped[Patient] = relationship(back_populates="reports")
    sources: Mapped[list["ReportSourceFile"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    images: Mapped[list["ReportImage"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    extracted_tables: Mapped[list["ExtractedTable"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    sections: Mapped[list["ReportSection"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    measurements: Mapped[list["ReportMeasurement"]] = relationship(back_populates="report", cascade="all, delete-orphan")

class ReportSourceFile(Base):
    __tablename__ = "report_source_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_uid: Mapped[str] = mapped_column(String(64), index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("medical_reports.id"), index=True)
    original_filename: Mapped[str] = mapped_column(String(255), default="")
    stored_filename: Mapped[str] = mapped_column(String(255), default="")
    stored_path: Mapped[str] = mapped_column(Text, default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    table_count: Mapped[int] = mapped_column(Integer, default=0)
    extraction_type: Mapped[str] = mapped_column(String(30), default="")
    detected_document_type: Mapped[str] = mapped_column(String(50), default="unknown_report")
    extraction_status: Mapped[str] = mapped_column(String(50), default="pending")
    extracted_patient_name: Mapped[str] = mapped_column(String(255), default="")
    extracted_dob: Mapped[str] = mapped_column(String(80), default="")
    extracted_age: Mapped[str] = mapped_column(String(50), default="")
    extracted_gender: Mapped[str] = mapped_column(String(50), default="")
    extracted_reference: Mapped[str] = mapped_column(String(255), default="")
    extracted_clinical_indication: Mapped[str] = mapped_column(Text, default="")
    mismatch_warning: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    report: Mapped[MedicalReport] = relationship(back_populates="sources")
    images: Mapped[list["ReportImage"]] = relationship(back_populates="source_file", cascade="all, delete-orphan")
    extracted_tables: Mapped[list["ExtractedTable"]] = relationship(back_populates="source_file", cascade="all, delete-orphan")
    sections: Mapped[list["ReportSection"]] = relationship(back_populates="source_file", cascade="all, delete-orphan")
    measurements: Mapped[list["ReportMeasurement"]] = relationship(back_populates="source_file", cascade="all, delete-orphan")

class ReportImage(Base):
    __tablename__ = "report_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_uid: Mapped[str] = mapped_column(String(64), index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("medical_reports.id"), index=True)
    source_file_id: Mapped[int | None] = mapped_column(ForeignKey("report_source_files.id"), nullable=True)
    section_id: Mapped[int | None] = mapped_column(ForeignKey("report_sections.id"), nullable=True)
    page_number: Mapped[int] = mapped_column(Integer, default=0)
    panel_number: Mapped[int] = mapped_column(Integer, default=1)
    file_path: Mapped[str] = mapped_column(Text, default="")
    public_url: Mapped[str] = mapped_column(Text, default="")
    page_text: Mapped[str] = mapped_column(Text, default="")
    ocr_text: Mapped[str] = mapped_column(Text, default="")
    detected_heading: Mapped[str] = mapped_column(String(255), default="")
    suggested_section: Mapped[str] = mapped_column(String(255), default="")
    clinical_keywords: Mapped[str] = mapped_column(Text, default="[]")
    caption: Mapped[str] = mapped_column(String(255), default="")
    image_type: Mapped[str] = mapped_column(String(50), default="source_image")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    report: Mapped[MedicalReport] = relationship(back_populates="images")
    source_file: Mapped[ReportSourceFile | None] = relationship(back_populates="images")

class ReportSection(Base):
    __tablename__ = "report_sections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("medical_reports.id"), index=True)
    source_file_id: Mapped[int | None] = mapped_column(ForeignKey("report_source_files.id"), nullable=True, index=True)
    section_type: Mapped[str] = mapped_column(String(80), default="text")
    title: Mapped[str] = mapped_column(String(255), default="Section")
    body: Mapped[str] = mapped_column(Text, default="")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    report: Mapped[MedicalReport] = relationship(back_populates="sections")
    source_file: Mapped[ReportSourceFile | None] = relationship(back_populates="sections")

class ReportMeasurement(Base):
    __tablename__ = "report_measurements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("medical_reports.id"), index=True)
    source_file_id: Mapped[int | None] = mapped_column(ForeignKey("report_source_files.id"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    value: Mapped[str] = mapped_column(String(255), default="")
    unit: Mapped[str] = mapped_column(String(80), default="")
    reference_range: Mapped[str] = mapped_column(String(255), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    report: Mapped[MedicalReport] = relationship(back_populates="measurements")
    source_file: Mapped[ReportSourceFile | None] = relationship(back_populates="measurements")

class ExtractedTable(Base):
    __tablename__ = "extracted_tables"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("medical_reports.id"), index=True)
    source_file_id: Mapped[int] = mapped_column(ForeignKey("report_source_files.id"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    section_title: Mapped[str] = mapped_column(String(255), default="Extracted Table")
    page_number: Mapped[int] = mapped_column(Integer, default=0)
    table_index: Mapped[int] = mapped_column(Integer, default=1)
    raw_text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    report: Mapped[MedicalReport] = relationship(back_populates="extracted_tables")
    source_file: Mapped[ReportSourceFile] = relationship(back_populates="extracted_tables")
    rows: Mapped[list["ExtractedTableRow"]] = relationship(back_populates="table", cascade="all, delete-orphan")

class ExtractedTableRow(Base):
    __tablename__ = "extracted_table_rows"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("extracted_tables.id"), index=True)
    row_order: Mapped[int] = mapped_column(Integer, default=0)
    row_type: Mapped[str] = mapped_column(String(30), default="result")
    test_name: Mapped[str] = mapped_column(String(255), default="")
    flag: Mapped[str] = mapped_column(String(20), default="")
    result_value: Mapped[str] = mapped_column(String(255), default="")
    unit: Mapped[str] = mapped_column(String(80), default="")
    reference_range: Mapped[str] = mapped_column(String(255), default="")
    is_abnormal: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    raw_text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    table: Mapped[ExtractedTable] = relationship(back_populates="rows")
