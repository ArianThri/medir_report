from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.models import Patient

SUPPORTED_TYPES = {"lab_report", "general_ultrasound", "echocardiography", "unknown_report"}

ECHO_HEADINGS = [
    "Past Medical and Medication History", "Conclusion", "Study quality/Patient status/HR/ Rhythm",
    "Left Ventricle", "Left Atrium", "Septum", "LV Diastolic Function", "Mitral Valve",
    "Aortic Valve", "Aorta", "Right ventricle", "Right atrium", "IVC/hepatic veins",
    "Tricuspid valve", "Pulmonary valve", "Pulmonary artery", "Pericardium", "Others",
    "Impression", "Recommendation",
]

ULTRASOUND_HEADINGS = [
    "Carotid Doppler Scan", "Thyroid Scan", "Abdominal Scan", "KUB Scan", "Testes Scan",
    "Conclusion", "Recommendation",
]

LAB_HEADINGS = ["Haematology", "Hematology", "Biochemistry", "Endocrinology", "Immunology", "Serology", "Microbiology", "Urine", "Urinalysis"]

BOILERPLATE_CONTAINS = [
    "registered as ultrasound london limited",
    "reg. no. 07956078",
    "by monecho",
    "end of report produced by",
    "this emailed report is subject",
    "automated email system",
]

MEASUREMENT_RE = re.compile(
    r"^(?P<name>[A-Za-z][A-Za-z0-9’' /().%+-]{1,45})\s*(?::)?\s+(?P<value>(?:[<>]=?|>/=|</=)?\s*\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?)(?:\s*(?P<unit>cm2|cm|cc|%|m/s|m/sec|mmHg|msec|ms))?(?:\s*\((?P<note>[^)]*)\))?\s*$",
    re.I,
)

INLINE_METADATA = {
    "pin": re.compile(r"\bPIN\s*:\s*([A-Z0-9-]+)", re.I),
    "clinical_indication": re.compile(r"Clinical\s+Indication\s*:\s*([^\n]+)", re.I),
    "source_report_date": re.compile(r"(?:Report Date|Report of)\s*:?\s*([^\n]+)", re.I),
}

@dataclass
class ExtractedDocument:
    document_type: str = "unknown_report"
    patient: dict[str, str] = field(default_factory=dict)
    clinical_indication: str = ""
    source_report_date: str = ""
    sections: list[dict[str, Any]] = field(default_factory=list)
    measurements: list[dict[str, str]] = field(default_factory=list)
    exams: list[dict[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def normalize_text(text: str) -> str:
    text = (text or "").replace("\u00a0", " ").replace("\ufffc", " ")
    # Basic source-text cleanup. The report_builder cleaner performs additional legacy cleanup,
    # but this module must stay independent to avoid circular imports.
    lines = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        compact = " ".join(line.split())
        low = compact.lower()
        if not compact:
            lines.append(""); continue
        if low == "by monecho" or re.match(r"^page\s*:??\s*\d+\s*(?:/|of)\s*\d+", low):
            continue
        lines.append(line.rstrip())
    return "\n".join(lines).strip()


def _clean_lines(text: str) -> list[str]:
    lines = []
    for line in normalize_text(text).splitlines():
        compact = " ".join(line.split())
        if not compact:
            lines.append("")
            continue
        low = compact.lower()
        if any(marker in low for marker in BOILERPLATE_CONTAINS):
            continue
        if re.match(r"^page\s*:??\s*\d+\s*(?:/|of)\s*\d+", low):
            continue
        lines.append(compact)
    out=[]; blank=False
    for line in lines:
        if not line:
            if not blank: out.append(line)
            blank=True
        else:
            blank=False; out.append(line)
    return out


def classify_document(text: str, image_count: int = 0, table_count: int = 0) -> str:
    hay = normalize_text(text).lower()
    if any(k in hay for k in ["echocardiography report", "left ventricle", "lvef", "tapse", "mitral valve", "aortic valve", "tricuspid valve", "lv diastolic", "crt-d"]):
        return "echocardiography"
    if any(k in hay for k in ["haematology", "hematology", "biochemistry", "endocrinology", "haemoglobin", "platelet count", "cholesterol", "ferritin", "vitamin d"]):
        return "lab_report"
    if any(k in hay for k in ["carotid doppler scan", "thyroid scan", "abdominal scan", "kub scan", "testes scan", "ultrasound examination", "sonographic"]):
        return "general_ultrasound"
    if image_count >= 3 and any(k in hay for k in ["ultrasound", "scan", "doppler"]):
        return "general_ultrasound"
    if table_count:
        return "lab_report"
    return "unknown_report"


def extract_patient_metadata(text: str) -> dict[str, str]:
    cleaned = normalize_text(text)
    flat = " ".join(cleaned.split())
    patient: dict[str, str] = {}

    # Common format: Mr. NAME, born on dd/mm/yyyy (79 years) - LPU...
    m = re.search(r"\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+([A-Z][A-Z .'-]+?),\s*born\s+on\s+([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\s*\(([^)]*?years?)\)\s*(?:-|–)?\s*([A-Z0-9-]+)?", flat, re.I)
    if m:
        patient["name"] = " ".join(m.group(1).split()).title()
        patient["dob"] = m.group(2).strip()
        patient["age"] = m.group(3).strip()
        if m.group(4): patient["reference_id"] = m.group(4).strip()

    # Lab format: Name: X ... DOB | Age: dd/mm/yyyy | 45 ... Gender: M ... Lab Ref no.: id
    m = re.search(r"Name\s*:\s*([A-Z][A-Z .'-]+?)\s+Report Produced", flat, re.I)
    if m and not patient.get("name"):
        patient["name"] = " ".join(m.group(1).split()).title()
    m = re.search(r"DOB\s*\|\s*Age\s*:\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\s*\|\s*([0-9]+)", flat, re.I)
    if m:
        patient["dob"] = m.group(1).strip(); patient["age"] = f"{m.group(2).strip()} years"
    m = re.search(r"Gender\s*:\s*([A-Z][A-Za-z]*)", flat, re.I)
    if m:
        g = m.group(1).strip().upper()
        patient["gender"] = "Male" if g in {"M", "MALE"} else "Female" if g in {"F", "FEMALE"} else m.group(1).strip()
    m = re.search(r"Lab Ref no\.?:\s*([A-Z0-9-]+)", flat, re.I)
    if m and not patient.get("reference_id"):
        patient["reference_id"] = m.group(1).strip()
    m = INLINE_METADATA["pin"].search(cleaned)
    if m:
        patient["reference_id"] = m.group(1).strip()
    if "gender" not in patient:
        title = re.search(r"\b(Mr|Mrs|Ms|Miss)\.?\s+", flat, re.I)
        if title:
            patient["gender"] = "Male" if title.group(1).lower() == "mr" else "Female"
    return patient


def extract_source_metadata(text: str) -> tuple[str, str]:
    cleaned = normalize_text(text)
    clinical = ""
    report_date = ""
    m = INLINE_METADATA["clinical_indication"].search(cleaned)
    if m: clinical = " ".join(m.group(1).split())
    m = re.search(r"Echocardiography Report of\s*([^\n]+)", cleaned, re.I)
    if m: report_date = " ".join(m.group(1).split())
    else:
        m = re.search(r"Report Date\s*:\s*([^\n]+)", cleaned, re.I)
        if m: report_date = " ".join(m.group(1).split())
    return clinical, report_date


def _heading_regex(headings: list[str]) -> re.Pattern | None:
    if not headings:
        return None
    escaped = [re.escape(h) for h in headings]
    return re.compile(r"(?im)^\s*(" + "|".join(escaped) + r")\s*:??\s*$")


def split_sections_by_headings(text: str, headings: list[str], default_title: str = "Source Report Details", default_type: str = "text") -> list[dict[str, Any]]:
    cleaned = "\n".join(_clean_lines(text))
    rx = _heading_regex(headings)
    if not rx:
        body = cleaned.strip()
        return [{"title": default_title, "type": default_type, "content": body, "images": []}] if body else []
    matches = list(rx.finditer(cleaned))
    sections: list[dict[str, Any]] = []
    if not matches:
        body = cleaned.strip()
        return [{"title": default_title, "type": default_type, "content": body, "images": []}] if body else []
    pre = cleaned[: matches[0].start()].strip()
    if pre:
        sections.append({"title": default_title, "type": default_type, "content": pre, "images": []})
    for idx, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
        body = cleaned[start:end].strip()
        if body or title.lower() in {"conclusion", "recommendation", "impression"}:
            sections.append({"title": title, "type": default_type, "content": body, "images": []})
    return sections


def extract_echo_measurements(text: str) -> list[dict[str, str]]:
    measurements: list[dict[str, str]] = []
    category = "Echocardiography"
    for line in _clean_lines(text):
        if not line or len(line) > 140:
            continue
        if line.upper() in {"AORTA", "MV", "TV/PV", "DIASTOLIC FUNCTION"}:
            category = line.title()
            continue
        parts = re.split(r"\s{3,}", line)
        for part in parts:
            part = part.strip(" :")
            if not part:
                continue
            m = MEASUREMENT_RE.match(part)
            if not m:
                m2 = re.match(r"^(?P<name>[A-Za-z][A-Za-z0-9’' /().%+-]{1,45})\s*:\s*(?P<value>[<>]?\s*\d+(?:\.\d+)?)(?:\s*(?P<unit>cm2|cm|cc|%|m/s|m/sec|mmHg|msec|ms))?", part, re.I)
                if not m2: continue
                groups = m2.groupdict()
            else:
                groups = m.groupdict()
            name = " ".join((groups.get("name") or "").split()).strip(" :")
            value = " ".join((groups.get("value") or "").split())
            if not name or not value or name.lower().startswith(("page", "pin")):
                continue
            measurements.append({
                "category": category,
                "name": name,
                "value": value,
                "unit": (groups.get("unit") or "").strip(),
                "reference_range": "",
                "note": (groups.get("note") or "").strip(),
            })
    out=[]; seen=set()
    for m in measurements:
        key=(m["category"].lower(), m["name"].lower(), m["value"], m["unit"])
        if key in seen: continue
        seen.add(key); out.append(m)
    return out[:80]


def exams_for_type(document_type: str, sections: list[dict[str, Any]], table_sections: list[str] | None = None) -> list[dict[str, str]]:
    if document_type == "echocardiography":
        return [
            {"title": "Echocardiography", "subtitle": "Cardiac ultrasound"},
            {"title": "LV Function", "subtitle": "Ejection fraction and wall motion"},
            {"title": "Valves", "subtitle": "Mitral, aortic and tricuspid valves"},
            {"title": "Doppler Measurements", "subtitle": "Flow and pressure measurements"},
            {"title": "Cardiac Images", "subtitle": "Source echo images"},
        ]
    titles = []
    for s in sections:
        title = s.get("title", "")
        low = title.lower()
        if low not in {"source report details", "conclusion", "recommendation", "limitations"}:
            titles.append(title)
    for t in table_sections or []:
        if t not in titles: titles.append(t)
    return [{"title": t, "subtitle": ""} for t in titles[:10]]


def mismatch_warning(selected: Patient, extracted_patient: dict[str, str]) -> str:
    warnings=[]
    src_name=(extracted_patient.get("name") or "").strip().lower()
    case_name=(selected.full_name or "").strip().lower()
    if src_name and case_name:
        src_words={w for w in re.split(r"\W+", src_name) if len(w)>2}
        case_words={w for w in re.split(r"\W+", case_name) if len(w)>2}
        if src_words and case_words and len(src_words & case_words) == 0:
            warnings.append(f"Selected case appears different from source patient. Selected case: {selected.full_name}. Source report: {extracted_patient.get('name')}.")
    src_ref=(extracted_patient.get("reference_id") or "").strip().lower()
    case_ref=(selected.reference or "").strip().lower()
    if src_ref and case_ref and src_ref != case_ref:
        warnings.append(f"Patient reference differs. Selected case: {selected.reference}. Source report: {extracted_patient.get('reference_id')}.")
    return " ".join(warnings)


def analyse_document(text: str, image_count: int = 0, table_count: int = 0) -> ExtractedDocument:
    cleaned = normalize_text(text)
    doc_type = classify_document(cleaned, image_count=image_count, table_count=table_count)
    patient = extract_patient_metadata(cleaned)
    clinical, report_date = extract_source_metadata(cleaned)
    if doc_type == "echocardiography":
        sections = split_sections_by_headings(cleaned, ECHO_HEADINGS, "Echocardiography Summary", "echo_text")
        measurements = extract_echo_measurements(cleaned)
    elif doc_type == "general_ultrasound":
        sections = split_sections_by_headings(cleaned, ULTRASOUND_HEADINGS, "Source Report Details", "scan_text")
        measurements = []
    elif doc_type == "lab_report":
        sections = split_sections_by_headings(cleaned, LAB_HEADINGS, "Source Report Details", "lab_table")
        measurements = []
    else:
        sections = split_sections_by_headings(cleaned, [], "Source Report Details", "text")
        measurements = []
    exams = exams_for_type(doc_type, sections)
    return ExtractedDocument(doc_type, patient, clinical, report_date, sections, measurements, exams)
