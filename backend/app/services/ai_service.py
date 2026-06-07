from __future__ import annotations
import base64
import json
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import MedicalReport, ReportImage
from app.services.report_builder import normalise_section_key, build_editable_report, clean_source_report_text

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None

def openai_configured() -> bool:
    return bool(settings.openai_api_key and not settings.openai_api_key.startswith("put_")) and OpenAI is not None

def _client():
    if not openai_configured():
        return None
    return OpenAI(api_key=settings.openai_api_key)

def enrich_image_with_vision(img: ReportImage, allowed_sections: list[str]) -> None:
    client = _client()
    path = Path(img.file_path)
    if not client or not path.exists():
        return
    try:
        b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
        prompt = (
            "You are reading a medical report source image. Identify only visible labels or clearly readable body-part text. "
            "Do not guess from anatomy when the image is unclear. Return strict JSON with keys: "
            "detected_heading, suggested_section, ocr_text, clinical_keywords, confidence. "
            "confidence must be high only if a visible label/body part/section name is readable in the image; otherwise low. "
            f"suggested_section must be one of: {allowed_sections}."
        )
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role":"user","content":[{"type":"text","text":prompt},{"type":"image_url","image_url":{"url":f"data:image/png;base64,{b64}"}}]}],
            response_format={"type":"json_object"},
            temperature=0,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        suggested = data.get("suggested_section") or normalise_section_key(" ".join([data.get("detected_heading", ""), data.get("ocr_text", "")]))
        if suggested not in allowed_sections:
            suggested = normalise_section_key(suggested)
        img.detected_heading = data.get("detected_heading") or suggested
        img.suggested_section = suggested
        img.ocr_text = data.get("ocr_text") or img.ocr_text
        keywords = data.get("clinical_keywords") or []
        if not isinstance(keywords, list):
            keywords = [str(keywords)]
        confidence = str(data.get("confidence") or "").strip().lower()
        readable_text = " ".join([str(data.get("detected_heading") or ""), str(data.get("ocr_text") or "")]).lower()
        if confidence == "high":
            keywords.append("vision_confidence_high")
        if any(term in readable_text for term in ["carotid", "thyroid", "abdomen", "abdominal", "kidney", "renal", "bladder", "testes", "testis", "epididymis", "kub"]):
            keywords.append("vision_body_label")
        img.clinical_keywords = json.dumps(keywords, ensure_ascii=False)
    except Exception:
        return


def apply_panel_transition_overrides(img: ReportImage) -> bool:
    """Correct section assignment for mixed-section transition source pages.

    This is deterministic and cheap. It is applied before and after optional OpenAI
    vision so that known transition pages are not misplaced by page-range fallback.
    """
    changed = False
    section = None
    keywords = []

    if img.page_number == 8:
        if img.panel_number == 1:
            section = "Carotid Doppler Scan"
        else:
            section = "Thyroid Scan"
        keywords = ["panel_transition_page_8"]

    elif img.page_number == 12:
        if img.panel_number <= 2:
            section = "Thyroid Scan"
        else:
            section = "Abdominal Scan"
        keywords = ["panel_transition_page_12"]

    elif img.page_number == 21:
        if img.panel_number <= 2:
            section = "KUB Scan"
        else:
            section = "Testes Scan"
        keywords = ["panel_transition_page_21"]

    if section and img.suggested_section != section:
        img.suggested_section = section
        img.detected_heading = section
        img.clinical_keywords = json.dumps(keywords, ensure_ascii=False)
        changed = True
    return changed

def enrich_report_images(db: Session, report: MedicalReport, use_vision: bool = False) -> MedicalReport:
    allowed = ["Carotid Doppler Scan", "Thyroid Scan", "Abdominal Scan", "KUB Scan", "Testes Scan", "Haematology", "Biochemistry", "Endocrinology", "Echocardiography", "Cardiac Images", "Source Report Details"]
    images = db.query(ReportImage).filter(ReportImage.report_id == report.id).order_by(ReportImage.source_file_id, ReportImage.page_number, ReportImage.panel_number).all()

    # First apply cheap deterministic overrides. This also fixes already-extracted
    # reports when the user clicks Generate AI Draft / Enrich metadata.
    for img in images:
        apply_panel_transition_overrides(img)

    if use_vision:
        for img in images:
            enrich_image_with_vision(img, allowed)
            # Keep known mixed-page corrections stable after vision, too.
            apply_panel_transition_overrides(img)
    generated = build_editable_report(report.patient, report.extracted_text or "", images, report_type=getattr(report, "report_type", None))
    old = {}
    try:
        old = json.loads(report.editable_report or "{}")
    except Exception:
        old = {}

    # Preserve manually edited draft content when images are enriched or when the
    # report is rebuilt after adding/removing source PDFs. The generated structure
    # is still used for fresh reports and for refreshed image/source metadata.
    if isinstance(old, dict) and old:
        editable = generated
        for key in ("title", "subtitle", "patient", "doctor_opinion", "limitations"):
            if old.get(key) not in (None, "", [], {}):
                editable[key] = old[key]

        old_sections = {}
        for section in old.get("sections") or []:
            sid = section.get("id") or section.get("title")
            if sid:
                old_sections[str(sid).lower()] = section

        merged_sections = []
        for section in generated.get("sections") or []:
            sid = str(section.get("id") or section.get("title") or "").lower()
            old_section = old_sections.get(sid)
            if old_section:
                merged = {**section}
                # Keep doctor's manual text/table edits, but refresh image placement.
                for keep_key in ("title", "content", "rows", "type"):
                    if old_section.get(keep_key) not in (None, "", [], {}):
                        value = old_section[keep_key]
                        if keep_key == "content" and isinstance(value, str):
                            value = clean_source_report_text(value)
                        merged[keep_key] = value
                merged["images"] = section.get("images", [])
                merged_sections.append(merged)
            else:
                merged_sections.append(section)

        # Keep extra custom sections the doctor may have added in the future.
        generated_keys = {str(s.get("id") or s.get("title") or "").lower() for s in generated.get("sections") or []}
        for section in old.get("sections") or []:
            sid = str(section.get("id") or section.get("title") or "").lower()
            if sid and sid not in generated_keys:
                merged_sections.append(section)

        editable["sections"] = merged_sections
    else:
        editable = generated

    editable["images"] = [build_editable_report.__globals__["report_image_to_dict"](i) for i in images]
    editable["doctor_opinion"] = editable.get("doctor_opinion") or report.doctor_opinion or ""
    report.editable_report = json.dumps(editable, ensure_ascii=False)
    db.add(report)
    return report
