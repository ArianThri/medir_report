from __future__ import annotations

import json
import re
from typing import Any

from app.models import Patient, ReportImage, ReportMeasurement, ReportSection
from app.services.table_extraction import extract_tables_from_page_text
from app.services.document_processing import analyse_document, exams_for_type

PRIMARY_SECTION_ALIASES = {
    "carotid": "Carotid Doppler Scan",
    "doppler": "Carotid Doppler Scan",
    "thyroid": "Thyroid Scan",
    "abdomen": "Abdominal Scan",
    "abdominal": "Abdominal Scan",
    "liver": "Abdominal Scan",
    "gallbladder": "Abdominal Scan",
    "spleen": "Abdominal Scan",
    "pancreas": "Abdominal Scan",
    "kub": "KUB Scan",
    "kidney": "KUB Scan",
    "renal": "KUB Scan",
    "bladder": "KUB Scan",
    "prostate": "KUB Scan",
    "testes": "Testes Scan",
    "testis": "Testes Scan",
    "epididymis": "Testes Scan",
    "varicocele": "Testes Scan",
    "haematology": "Haematology",
    "hematology": "Haematology",
    "biochemistry": "Biochemistry",
    "endocrinology": "Endocrinology",
    "echocardiography": "Echocardiography",
    "left ventricle": "Echocardiography",
    "mitral valve": "Echocardiography",
    "aortic valve": "Echocardiography",
}

HEADING_RE = re.compile(r"(?im)^\s*(carotid doppler scan|thyroid scan|abdominal scan|kub scan|testes scan|haematology|hematology|biochemistry|endocrinology|conclusion|recommendation)\s*:?\s*$")

TABLE_LINE_RE = re.compile(r"^(.+?)\s+([*]?[<>]?[\d.]+|>\s*\d+|<\s*\d+|[\d.]+\s*%)\s+([A-Za-z%/\^0-9.µ]+)?\s+(.+?)?$")

BOILERPLATE_LINE_RE = re.compile(
    r"""(?ix)^\s*(?:
        page\s*:??\s*\d+\s*(?:/|of)\s*\d+(?:\s+by\s+monecho)?|
        by\s+monecho|
        registered\s+as\s+ultrasound\s+london\s+limited.*|
        end\s+of\s+report\s+produced\s+by.*|
        this\s+emailed\s+report\s+is\s+subject.*|
        authorised\s+by\s*:\s*clinical\s+pathology.*
    )\s*$"""
)


def is_boilerplate_line(line: str) -> bool:
    clean = " ".join((line or "").replace("\u00a0", " ").split())
    if not clean:
        return False
    return bool(BOILERPLATE_LINE_RE.match(clean))


def clean_source_report_text(text: str) -> str:
    if not text:
        return ""
    raw_lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    kept: list[str] = []
    for line in raw_lines:
        compact = " ".join(line.replace("\u00a0", " ").split())
        if is_boilerplate_line(compact):
            continue
        kept.append(line.rstrip())
    out: list[str] = []
    blank_count = 0
    for line in kept:
        if not line.strip():
            blank_count += 1
            if blank_count <= 1:
                out.append("")
        else:
            blank_count = 0
            out.append(line)
    return "\n".join(out).strip()


def normalise_section_key(text: str) -> str:
    t = (text or "").lower()
    for k, v in PRIMARY_SECTION_ALIASES.items():
        if k in t:
            return v
    return "Source Report Details"


def split_text_sections(text: str) -> list[dict[str, Any]]:
    text = clean_source_report_text(text or "")
    matches = list(HEADING_RE.finditer(text))
    sections: list[dict[str, Any]] = []
    if not matches:
        return [{"id": "source_report_details", "title": "Source Report Details", "type": "text", "content": text.strip(), "images": []}]
    pre = text[:matches[0].start()].strip()
    if pre:
        sections.append({"id": "source_report_details", "title": "Source Report Details", "type": "text", "content": pre, "images": []})
    for i, m in enumerate(matches):
        raw_title = m.group(1).strip().title()
        title = "Haematology" if raw_title == "Hematology" else raw_title
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if title.lower() in {"conclusion", "recommendation"}:
            section_type = "text"
        elif title in {"Haematology", "Biochemistry", "Endocrinology"}:
            section_type = "lab_table"
        else:
            section_type = "scan_text"
        sections.append({"id": re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_"), "title": title, "type": section_type, "content": content, "images": []})
    return sections


def parse_lab_table(content: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    extracted = extract_tables_from_page_text(clean_source_report_text(content or ""), 0)
    for table in extracted:
        for row in table.get("rows") or []:
            if row.get("row_type") == "note":
                rows.append({"note": row.get("notes") or row.get("raw_text") or ""})
            else:
                if not row.get("test_name") and not row.get("result_value"):
                    continue
                rows.append({
                    "test": row.get("test_name", ""),
                    "result": row.get("result_value", ""),
                    "unit": row.get("unit", ""),
                    "reference_range": row.get("reference_range", ""),
                    "status": "Review" if row.get("is_abnormal") or row.get("flag") else "Normal",
                })
    if rows:
        return rows
    for line in (content or "").splitlines():
        line = " ".join(line.split())
        if not line or line.upper().startswith(("TEST RESULT", "PAGE", "MP")):
            continue
        m = TABLE_LINE_RE.match(line)
        if m:
            test, result, unit, ref = m.groups()
            status = "Review" if "*" in result or (ref and "review" in ref.lower()) else "Normal"
            rows.append({"test": test.strip(), "result": result.replace("*", "").strip(), "unit": (unit or "").strip(), "reference_range": (ref or "").strip(), "status": status})
        elif line.lower().startswith(("note", "please note", "adjusting", "interpretation")):
            rows.append({"note": line})
    return rows


def report_image_to_dict(img: ReportImage) -> dict[str, Any]:
    try:
        keywords = json.loads(img.clinical_keywords or "[]")
    except Exception:
        keywords = []
    return {
        "id": img.id,
        "image_uid": img.image_uid,
        "url": img.public_url,
        "file_path": img.file_path,
        "source_file_id": img.source_file_id,
        "section_id": getattr(img, "section_id", None),
        "page_number": img.page_number,
        "panel_number": img.panel_number,
        "page_text": img.page_text,
        "ocr_text": img.ocr_text,
        "detected_heading": img.detected_heading,
        "suggested_section": img.suggested_section,
        "clinical_keywords": keywords,
        "caption": img.caption or f"Source image page {img.page_number}.{img.panel_number}",
        "image_type": getattr(img, "image_type", "source_image") or "source_image",
    }


def _section_id(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (title or "section").lower()).strip("_") or "section"


def section_to_dict(section: ReportSection) -> dict[str, Any]:
    return {
        "id": _section_id(section.title),
        "db_id": section.id,
        "title": section.title,
        "type": section.section_type or "text",
        "content": section.body or "",
        "images": [],
        "source_file_id": section.source_file_id,
        "order_index": section.order_index,
    }


def measurement_to_dict(m: ReportMeasurement) -> dict[str, Any]:
    return {
        "id": m.id,
        "source_file_id": m.source_file_id,
        "category": m.category,
        "name": m.name,
        "value": m.value,
        "unit": m.unit,
        "reference_range": m.reference_range,
        "note": m.note,
        "order_index": m.order_index,
    }


def _image_confidence(img: dict[str, Any], suggested: str) -> str:
    """Return automatic placement confidence.

    Restored behaviour: if the extractor/AI has assigned a concrete section name,
    allow automatic placement. Doctors can still correct any placement by dragging
    images in the report builder. This keeps the older ultrasound samples working
    while preserving the new manual image editing workflow.
    """
    suggested_clean = (suggested or "").strip().lower()
    if not suggested_clean or suggested_clean in {"source report details", "unknown", "unknown report"}:
        return "low"
    return "high"

def _append_final_image_gallery(sections: list[dict[str, Any]], images: list[dict[str, Any]], report_type: str) -> None:
    if not images:
        return
    if report_type == "echocardiography":
        title = "Cardiac Images"
        content = "Source echocardiography images from the uploaded PDF. These images were kept together because automatic section placement is not reliable for unclear echocardiography frames."
        section_type = "image_gallery"
        section_id = "cardiac_images"
    else:
        title = "Additional Source Images"
        content = "Source images from the uploaded PDF that could not be confidently matched to a specific clinical section."
        section_type = "image_gallery"
        section_id = "additional_source_images"

    image_section = next((s for s in sections if (s.get("title") or "").strip().lower() == title.lower()), None)
    if image_section is None:
        image_section = {"id": section_id, "title": title, "type": section_type, "content": content, "images": []}
        sections.append(image_section)
    image_section.setdefault("images", []).extend(images)


def _attach_images(sections: list[dict[str, Any]], image_dicts: list[dict[str, Any]], report_type: str) -> None:
    """Attach images automatically when the extractor/AI provides a section.

    The automatic placement is intentionally restored because it worked well for
    source PDFs that include body-part labels or predictable section/page order.
    Manual drag-and-drop remains available in the frontend, so doctors can move
    any misplaced image after generation.
    """
    if not image_dicts:
        return

    unmatched: list[dict[str, Any]] = []
    for img in image_dicts:
        suggested = img.get("suggested_section") or normalise_section_key(" ".join([
            img.get("detected_heading", ""),
            img.get("ocr_text", ""),
            img.get("page_text", ""),
            img.get("caption", ""),
        ]))

        if _image_confidence(img, suggested) != "high":
            unmatched.append(img)
            continue

        suggested_key = (suggested or "").strip().lower()
        attached = False

        # Prefer an exact section match.
        for section in sections:
            if (section.get("title") or "").strip().lower() == suggested_key:
                section.setdefault("images", []).append(img)
                attached = True
                break

        # Common echo source images are not tied to a specific detailed section by
        # deterministic extraction. Keep them in Cardiac Images unless a later AI
        # enrichment gives a real section match.
        if not attached:
            unmatched.append(img)

    _append_final_image_gallery(sections, unmatched, report_type)

def build_editable_report(patient: Patient, text: str, images: list[ReportImage], report_type: str | None = None, persisted_sections: list[ReportSection] | None = None, measurements: list[ReportMeasurement] | None = None, source_files: list[Any] | None = None, extracted_tables: list[Any] | None = None) -> dict[str, Any]:
    image_dicts = [report_image_to_dict(i) for i in images]
    detected = analyse_document(text, image_count=len(image_dicts), table_count=len(extracted_tables or []))
    final_type = report_type or detected.document_type

    if persisted_sections:
        sections = [section_to_dict(s) for s in sorted(persisted_sections, key=lambda x: x.order_index)]
    else:
        sections = []
        for idx, s in enumerate(detected.sections):
            sections.append({
                "id": _section_id(s.get("title") or f"section_{idx+1}"),
                "title": s.get("title") or f"Section {idx+1}",
                "type": s.get("type") or "text",
                "content": s.get("content") or "",
                "images": [],
                "order_index": idx + 1,
            })
        if not sections:
            sections = split_text_sections(text)

    for section in sections:
        if section.get("type") == "lab_table":
            section["rows"] = parse_lab_table(f"{section.get('title', '')}\n{section.get('content', '')}")

    _attach_images(sections, image_dicts, final_type)

    measurement_rows = [measurement_to_dict(m) for m in sorted(measurements or [], key=lambda x: x.order_index)]
    if not measurement_rows:
        for idx, m in enumerate(detected.measurements, start=1):
            item = dict(m); item["order_index"] = idx; measurement_rows.append(item)

    patient_meta = detected.patient or {}
    clinical = detected.clinical_indication or patient.notes or "Check-up"
    exams = detected.exams or exams_for_type(final_type, sections)

    source_warnings = []
    for s in source_files or []:
        warning = getattr(s, "mismatch_warning", "") or ""
        if warning and warning not in source_warnings:
            source_warnings.append(warning)

    return {
        "title": "Medical Report",
        "subtitle": "AI-assisted clinical report generated from uploaded source reports",
        "report_type": final_type,
        "template": final_type,
        "patient": {
            "id": patient.id,
            "full_name": patient.full_name,
            "age": patient.age or patient_meta.get("age", ""),
            "gender": patient.gender or patient_meta.get("gender", ""),
            "date_of_birth": patient.date_of_birth or patient_meta.get("dob", ""),
            "reference": patient.reference or patient_meta.get("reference_id", ""),
            "clinical_indication": clinical,
            "source_patient": patient_meta,
        },
        "doctor_opinion": "",
        "examinations": exams,
        "sections": sections,
        "measurements": measurement_rows,
        "images": image_dicts,
        "source_warnings": source_warnings,
        "limitations": "This report should be reviewed, edited and approved by a qualified clinician before final use.",
    }
