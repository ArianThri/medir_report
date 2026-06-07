from __future__ import annotations
from datetime import datetime
import json
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse, HTMLResponse, Response
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.deps import can_access_patient, require_approved_user
from app.models import MedicalReport, Patient, ReportSourceFile, ReportImage, ExtractedTable, ExtractedTableRow, ReportSection, ReportMeasurement, User
from app.schemas import ReportUpdate
from app.services.ai_service import enrich_report_images, openai_configured
from app.services.exports import save_html
from app.services.pdf_processing import process_source_pdf, save_upload_file, _safe_filename
from app.services.report_builder import build_editable_report, report_image_to_dict, section_to_dict, measurement_to_dict
from app.services.table_extraction import table_to_dict, report_tables_to_csv
from app.services.storage import ensure_report_dirs
from app.services.document_processing import analyse_document, mismatch_warning

router = APIRouter(prefix="/reports", tags=["reports"])

def _json_load(value, default):
    if isinstance(value, (dict, list)): return value
    try: return json.loads(value or "")
    except Exception: return default

def source_to_dict(s: ReportSourceFile):
    return {
        "id": s.id,
        "source_uid": s.source_uid,
        "original_filename": s.original_filename,
        "stored_filename": s.stored_filename,
        "stored_path": s.stored_path,
        "page_count": s.page_count,
        "file_size": s.file_size,
        "table_count": getattr(s, "table_count", 0) or 0,
        "extraction_type": getattr(s, "extraction_type", "") or "",
        "detected_document_type": getattr(s, "detected_document_type", "unknown_report") or "unknown_report",
        "extraction_status": getattr(s, "extraction_status", "") or "",
        "extracted_patient_name": getattr(s, "extracted_patient_name", "") or "",
        "extracted_dob": getattr(s, "extracted_dob", "") or "",
        "extracted_age": getattr(s, "extracted_age", "") or "",
        "extracted_gender": getattr(s, "extracted_gender", "") or "",
        "extracted_reference": getattr(s, "extracted_reference", "") or "",
        "extracted_clinical_indication": getattr(s, "extracted_clinical_indication", "") or "",
        "mismatch_warning": getattr(s, "mismatch_warning", "") or "",
        "order": s.order,
        "is_deleted": getattr(s, "is_deleted", False) or False,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }

def report_to_dict(r: MedicalReport):
    editable = _json_load(r.editable_report, {})
    images = [report_image_to_dict(i) for i in sorted(r.images, key=lambda x: (x.source_file_id or 0, x.page_number, x.panel_number))]
    sources = [source_to_dict(s) for s in sorted(r.sources, key=lambda x: x.order) if not getattr(s, "is_deleted", False)]
    tables = [table_to_dict(t) for t in sorted(r.extracted_tables, key=lambda x: (x.source_file_id, x.page_number, x.table_index))]
    sections = [section_to_dict(s) for s in sorted(getattr(r, "sections", []) or [], key=lambda x: x.order_index)]
    measurements = [measurement_to_dict(m) for m in sorted(getattr(r, "measurements", []) or [], key=lambda x: x.order_index)]
    warnings = [s.get("mismatch_warning") for s in sources if s.get("mismatch_warning")]
    if isinstance(editable, dict):
        editable["report_type"] = getattr(r, "report_type", "unknown_report") or "unknown_report"
        editable["images"] = images
        editable["source_files"] = sources
        editable["extracted_tables"] = tables
        editable["measurements"] = editable.get("measurements") or measurements
        editable["source_warnings"] = warnings
    return {
        "id": r.id,
        "report_uid": r.report_uid,
        "patient_id": r.patient_id,
        "uploaded_by_id": r.uploaded_by_id,
        "title": r.title,
        "report_type": getattr(r, "report_type", "unknown_report") or "unknown_report",
        "status": r.status,
        "storage_root": r.storage_root,
        "extracted_text": r.extracted_text,
        "editable_report": editable,
        "doctor_opinion": r.doctor_opinion,
        "source_files": sources,
        "report_sections": sections,
        "measurements": measurements,
        "extracted_images": images,
        "extracted_tables": tables,
        "source_warnings": warnings,
        "image_count": len(images),
        "table_count": sum(t.get("row_count", 0) for t in tables),
        "measurement_count": len(measurements),
        "source_count": len(sources),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }

def _get_report(report_id: int, db: Session, user: User) -> MedicalReport:
    r = db.get(MedicalReport, report_id)
    if not r: raise HTTPException(status_code=404, detail="Report not found")
    if not r.patient or not can_access_patient(db, user, r.patient): raise HTTPException(status_code=403, detail="Access denied")
    return r

def _report_type_from_sources(sources: list[ReportSourceFile]) -> str:
    types = [getattr(s, "detected_document_type", "unknown_report") or "unknown_report" for s in sources if not getattr(s, "is_deleted", False)]
    known = [t for t in types if t and t != "unknown_report"]
    if not known:
        return "unknown_report"
    if len(set(known)) == 1:
        return known[0]
    return "mixed_report"


def _persist_structured_document(db: Session, report: MedicalReport, source: ReportSourceFile, text: str, image_count: int, table_count: int) -> None:
    analysis = analyse_document(text, image_count=image_count, table_count=table_count)
    source.detected_document_type = analysis.document_type
    source.extraction_status = "processed"
    source.extracted_patient_name = analysis.patient.get("name", "")
    source.extracted_dob = analysis.patient.get("dob", "")
    source.extracted_age = analysis.patient.get("age", "")
    source.extracted_gender = analysis.patient.get("gender", "")
    source.extracted_reference = analysis.patient.get("reference_id", "")
    source.extracted_clinical_indication = analysis.clinical_indication or ""
    source.mismatch_warning = mismatch_warning(report.patient, analysis.patient)

    for idx, section in enumerate(analysis.sections, start=1):
        db.add(ReportSection(
            report_id=report.id,
            source_file_id=source.id,
            section_type=section.get("type") or "text",
            title=section.get("title") or f"Section {idx}",
            body=section.get("content") or "",
            order_index=(source.order or 0) * 1000 + idx,
        ))

    for idx, m in enumerate(analysis.measurements, start=1):
        db.add(ReportMeasurement(
            report_id=report.id,
            source_file_id=source.id,
            category=m.get("category") or "",
            name=m.get("name") or "",
            value=m.get("value") or "",
            unit=m.get("unit") or "",
            reference_range=m.get("reference_range") or "",
            note=m.get("note") or "",
            order_index=(source.order or 0) * 1000 + idx,
        ))


def _rebuild_report(db: Session, report: MedicalReport, use_vision: bool = False) -> MedicalReport:
    dirs = ensure_report_dirs(report.patient_id, report.id, report.report_uid)
    if dirs["images"].exists():
        shutil.rmtree(dirs["images"], ignore_errors=True)
    dirs["images"].mkdir(parents=True, exist_ok=True)

    db.query(ReportImage).filter_by(report_id=report.id).delete(synchronize_session=False)
    db.query(ReportSection).filter_by(report_id=report.id).delete(synchronize_session=False)
    db.query(ReportMeasurement).filter_by(report_id=report.id).delete(synchronize_session=False)
    table_ids = [tid for (tid,) in db.query(ExtractedTable.id).filter_by(report_id=report.id).all()]
    if table_ids:
        db.query(ExtractedTableRow).filter(ExtractedTableRow.table_id.in_(table_ids)).delete(synchronize_session=False)
        db.query(ExtractedTable).filter(ExtractedTable.id.in_(table_ids)).delete(synchronize_session=False)

    sources = db.query(ReportSourceFile).filter_by(report_id=report.id).order_by(ReportSourceFile.order).all()
    for source in sources:
        if getattr(source, "is_deleted", False):
            continue
        source.table_count = 0
        source.extraction_type = ""
        source.extraction_status = "processing"
        source.detected_document_type = "unknown_report"
        source.mismatch_warning = ""

    text_blocks = []
    for source in sources:
        if getattr(source, "is_deleted", False):
            continue
        path = Path(source.stored_path)
        if not path.exists():
            source.extraction_status = "missing_file"
            continue
        result = process_source_pdf(db, report, source, path, dirs["images"])
        db.flush()
        source_images = db.query(ReportImage).filter_by(report_id=report.id, source_file_id=source.id).all()
        source_tables = db.query(ExtractedTable).filter_by(report_id=report.id, source_file_id=source.id).all()
        source_text = (result.get("text") or "").strip()
        _persist_structured_document(db, report, source, source_text, image_count=len(source_images), table_count=len(source_tables))
        if source_text:
            text_blocks.append(f"SOURCE REPORT {source.order}: {source.original_filename}\n\n{source_text}")

    report.extracted_text = "\n\n".join(text_blocks).strip()
    report.report_type = _report_type_from_sources(sources)
    db.flush()
    enrich_report_images(db, report, use_vision=use_vision)

    persisted_sections = db.query(ReportSection).filter_by(report_id=report.id).order_by(ReportSection.order_index).all()
    measurements = db.query(ReportMeasurement).filter_by(report_id=report.id).order_by(ReportMeasurement.order_index).all()
    images = db.query(ReportImage).filter_by(report_id=report.id).order_by(ReportImage.source_file_id, ReportImage.page_number, ReportImage.panel_number).all()
    tables = db.query(ExtractedTable).filter_by(report_id=report.id).all()
    active_sources = [s for s in sources if not getattr(s, "is_deleted", False)]
    editable = build_editable_report(
        report.patient,
        report.extracted_text,
        images,
        report_type=report.report_type,
        persisted_sections=persisted_sections,
        measurements=measurements,
        source_files=active_sources,
        extracted_tables=tables,
    )
    report.editable_report = json.dumps(editable, ensure_ascii=False)
    report.title = editable.get("title") or report.title or "Medical Report"
    report.updated_at = datetime.utcnow()
    report.patient.updated_at = datetime.utcnow()
    db.add(report)
    return report

@router.post("/patients/{patient_id}/upload-pdfs")
async def upload_patient_pdfs(patient_id: int, files: list[UploadFile] = File(...), report_id: int | None = Form(None), use_vision: str = Form("false"), user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    patient = db.get(Patient, patient_id)
    if not patient: raise HTTPException(status_code=404, detail="Patient not found")
    if not can_access_patient(db, user, patient): raise HTTPException(status_code=403, detail="Access denied")
    if not files: raise HTTPException(status_code=400, detail="Upload at least one PDF")

    if report_id:
        report = _get_report(report_id, db, user)
        if report.patient_id != patient_id: raise HTTPException(status_code=400, detail="Report does not belong to this patient")
    else:
        report = MedicalReport(patient_id=patient_id, uploaded_by_id=user.id, report_uid=uuid.uuid4().hex[:16], title="Medical Report", status="draft")
        db.add(report); db.flush()
        dirs = ensure_report_dirs(patient_id, report.id, report.report_uid)
        report.storage_root = str(dirs["root"])

    dirs = ensure_report_dirs(patient_id, report.id, report.report_uid)
    start_order = len(report.sources) + 1
    added = []
    for offset, file in enumerate(files):
        name = file.filename or f"source_{start_order + offset}.pdf"
        if not name.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Only PDF files are allowed: {name}")
        uid = uuid.uuid4().hex[:12]
        safe_name = f"source_{start_order + offset:03d}_{uid}_{_safe_filename(name)}"
        stored_path = dirs["sources"] / safe_name
        size = save_upload_file(file.file, stored_path)
        source = ReportSourceFile(report_id=report.id, source_uid=uid, original_filename=name, stored_filename=safe_name, stored_path=str(stored_path), file_size=size, order=start_order + offset)
        db.add(source); db.flush(); added.append(source)
    _rebuild_report(db, report, use_vision=str(use_vision).lower() in {"true", "1", "yes"})
    db.commit(); db.refresh(report)
    return {"message": f"{len(added)} PDF file(s) uploaded and report rebuilt", "added_source_files": [source_to_dict(s) for s in added], "report": report_to_dict(report)}

@router.post("/upload-multiple")
async def upload_multiple(patient_id: int = Form(...), files: list[UploadFile] = File(...), report_id: int | None = Form(None), use_vision: str = Form("false"), user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    return await upload_patient_pdfs(patient_id, files, report_id, use_vision, user, db)

@router.get("/{report_id}")
def get_report(report_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    return report_to_dict(_get_report(report_id, db, user))

@router.post("/{report_id}/source-files")
async def add_source_files(report_id: int, files: list[UploadFile] = File(...), use_vision: str = Form("false"), user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    return await upload_patient_pdfs(report.patient_id, files, report.id, use_vision, user, db)

@router.delete("/{report_id}/source-files/{source_id}")
def delete_source(report_id: int, source_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    source = db.get(ReportSourceFile, source_id)
    if not source or source.report_id != report.id: raise HTTPException(status_code=404, detail="Source file not found")
    try:
        Path(source.stored_path).unlink(missing_ok=True)
    except Exception:
        pass
    db.delete(source); db.flush()
    _rebuild_report(db, report, use_vision=False)
    db.commit(); db.refresh(report)
    return {"message": "Source file removed and report rebuilt", "report": report_to_dict(report)}

@router.post("/{report_id}/rebuild")
def rebuild(report_id: int, use_vision: bool = Query(False), user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    _rebuild_report(db, report, use_vision=use_vision)
    db.commit(); db.refresh(report)
    return {"message": "Report rebuilt", "report": report_to_dict(report)}

@router.post("/{report_id}/enrich-image-metadata")
def enrich_images(report_id: int, use_vision: bool = Query(False), user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    enrich_report_images(db, report, use_vision=use_vision)
    db.commit(); db.refresh(report)
    return {"message": "Image metadata enriched", "report": report_to_dict(report)}

@router.put("/{report_id}")
def update_report(report_id: int, payload: ReportUpdate, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    editable = payload.editable_report or _json_load(report.editable_report, {}) or {}
    # Keep persistent report-level images and source files in sync even if frontend sends no images.
    editable["images"] = [report_image_to_dict(i) for i in report.images]
    editable["source_files"] = [source_to_dict(s) for s in report.sources]
    editable["extracted_tables"] = [table_to_dict(t) for t in sorted(report.extracted_tables, key=lambda x: (x.source_file_id, x.page_number, x.table_index))]
    editable["doctor_opinion"] = payload.doctor_opinion or editable.get("doctor_opinion", "")
    report.editable_report = json.dumps(editable, ensure_ascii=False)
    report.doctor_opinion = editable["doctor_opinion"]
    report.title = editable.get("title") or report.title or "Medical Report"
    report.status = payload.status if payload.status in {"draft", "final"} else "draft"
    report.updated_at = datetime.utcnow(); report.patient.updated_at = datetime.utcnow()
    db.commit(); db.refresh(report)
    return {"message": "Report saved", "report": report_to_dict(report)}

@router.post("/{report_id}/save-draft")
def save_draft(report_id: int, payload: ReportUpdate, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    payload.status = "draft"
    return update_report(report_id, payload, user, db)

@router.post("/{report_id}/save-final")
def save_final(report_id: int, payload: ReportUpdate, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    payload.status = "final"
    return update_report(report_id, payload, user, db)

@router.post("/{report_id}/ai-enhance")
def ai_enhance(report_id: int, use_vision: bool = Query(False), user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    # AI currently enriches image metadata and rebuilds the structured report. It does not delete images or append a bottom dump.
    report = _get_report(report_id, db, user)
    enrich_report_images(db, report, use_vision=use_vision and openai_configured())
    db.commit(); db.refresh(report)
    return {"message": "AI/metadata enhancement completed", "report": report_to_dict(report)}

@router.get("/{report_id}/debug-images")
def debug_images(report_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    return {"report_id": report.id, "patient_id": report.patient_id, "storage_root": report.storage_root, "source_count": len(report.sources), "image_count": len(report.images), "images": [report_image_to_dict(i) for i in report.images[:20]]}

@router.get("/{report_id}/tables")
def get_report_tables(report_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    tables = db.query(ExtractedTable).filter_by(report_id=report.id).order_by(ExtractedTable.source_file_id, ExtractedTable.page_number, ExtractedTable.table_index).all()
    return {"report_id": report.id, "table_count": len(tables), "tables": [table_to_dict(t) for t in tables]}

@router.get("/{report_id}/tables.csv")
def download_tables_csv(report_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    tables = db.query(ExtractedTable).filter_by(report_id=report.id).order_by(ExtractedTable.source_file_id, ExtractedTable.page_number, ExtractedTable.table_index).all()
    csv_text = report_tables_to_csv(tables)
    return Response(content=csv_text, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=report_{report.id}_tables.csv"})

@router.get("/{report_id}/download-html")
def download_html(report_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    report = _get_report(report_id, db, user)
    data = _json_load(report.editable_report, {})
    path = ensure_report_dirs(report.patient_id, report.id, report.report_uid)["exports"] / f"medical_report_{report.id}.html"
    save_html(data, path)
    return FileResponse(path, filename=f"medical_report_{report.id}.html", media_type="text/html")

@router.get("/{report_id}/download-pdf")
def download_pdf(report_id: int, user: User = Depends(require_approved_user), db: Session = Depends(get_db)):
    # Returns HTML by default. Use browser print/save-as-PDF for exact web-layout matching.
    return download_html(report_id, user, db)
