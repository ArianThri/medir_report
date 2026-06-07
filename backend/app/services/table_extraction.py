from __future__ import annotations

import csv
import io
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models import ExtractedTable, ExtractedTableRow, MedicalReport, ReportSourceFile

LAB_SECTION_TITLES = {
    "HAEMATOLOGY": "Haematology",
    "HEMATOLOGY": "Haematology",
    "BIOCHEMISTRY": "Biochemistry",
    "ENDOCRINOLOGY": "Endocrinology",
    "IMMUNOLOGY": "Immunology",
    "SEROLOGY": "Serology",
    "MICROBIOLOGY": "Microbiology",
    "URINE": "Urine",
    "URINALYSIS": "Urinalysis",
}

STOP_SECTION_PREFIXES = (
    "AUTHORISED BY",
    "END OF REPORT",
    "REPORT PRODUCED BY",
    "THIS EMAILED REPORT",
)

VALUE_RE = re.compile(r"^\*?\s*(?:[<>]=?|>/=|</=)?\s*\d+(?:\.\d+)?(?:\s*%\s*\d+(?:\.\d+)?|\s*%|\s+\d+(?:\.\d+)?)?$", re.I)
RANGE_RE = re.compile(
    r"^(?:\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?|[<>]=?\s*\d+(?:\.\d+)?|>/=\s*\d+(?:\.\d+)?|</=\s*\d+(?:\.\d+)?|up\s+to\s+\d+(?:\.\d+)?|optimum\s*[<>]?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s+and\s+over|\.)$",
    re.I,
)
UNIT_RE = re.compile(
    r"^(?P<unit>(?:g/L|mmol/L|mmol/l|x10\^?\d+/L|x10\^?\d+/l|fL|pg|IU/L|ug/L|ug/l|umol/L|mIU/L|pmol/l|nmol/L|mm/hr|%|mmol/mol))(?P<rest>.*)$",
    re.I,
)
INLINE_RESULT_RE = re.compile(
    r"^(?P<name>.+?)\s+(?P<flag>\*)?\s*(?P<value>(?:[<>]=?|>/=|</=)?\s*\d+(?:\.\d+)?(?:\s*%|\s+\d+(?:\.\d+)?)?)\s*(?P<unit>g/L|mmol/L|mmol/l|x10\^?\d+/L|x10\^?\d+/l|fL|pg|IU/L|ug/L|ug/l|umol/L|mIU/L|pmol/l|nmol/L|mm/hr|%|mmol/mol)?\s*(?P<range>.*)$",
    re.I,
)


def _clean(line: str) -> str:
    return " ".join((line or "").replace("\u00a0", " ").split())


def _detect_section(line: str) -> str | None:
    up = _clean(line).upper().strip(":")
    return LAB_SECTION_TITLES.get(up)


def _is_stop(line: str) -> bool:
    up = _clean(line).upper()
    return any(up.startswith(prefix) for prefix in STOP_SECTION_PREFIXES)


def _is_metadata_line(line: str) -> bool:
    low = _clean(line).lower()
    if not low:
        return True
    starters = (
        "name:", "dob", "gender:", "lab ref", "collected:", "received:", "hospital no", "reference:",
        "report date:", "page:", "page ", "london private", "dr ", "the london", "27 welbeck", "w1g",
        "authorised by", "end of report", "this emailed report", "report produced by", "produced by",
        "automated email system", "the doctors laboratory", "hospital no.:",
    )
    return low.startswith(starters)


def _looks_like_note(line: str) -> bool:
    low = _clean(line).lower()
    return low.startswith((
        "note", "please note", "adjusting", "as per", "interpretation", "consider", "agreed age-related",
        "united kingdom", "kingdom for", "prostate cancer", "advocated", "deficient", "insufficient", "normal range",
        "e/f ",
    )) or bool(re.match(r"^(?:[<>/=-]*\s*)?\d+\s*-?\s*\d*\s+years\b", low))


def _is_value_line(line: str) -> bool:
    return bool(VALUE_RE.match(_clean(line)))


def _is_range_line(line: str) -> bool:
    return bool(RANGE_RE.match(_clean(line)))


def _parse_unit_and_range(line: str) -> tuple[str, str] | None:
    raw = _clean(line)
    m = UNIT_RE.match(raw)
    if not m:
        return None
    unit = m.group("unit").strip()
    rest = _clean(m.group("rest") or "")
    return unit, rest


def _is_probable_test_name(line: str) -> bool:
    raw = _clean(line)
    if not raw or _is_metadata_line(raw) or _looks_like_note(raw) or _is_stop(raw):
        return False
    if _detect_section(raw):
        return False
    if _is_value_line(raw) or _is_range_line(raw) or _parse_unit_and_range(raw):
        return False
    if not any(ch.isalpha() for ch in raw):
        return False
    return True


def parse_lab_result_line(line: str) -> dict[str, Any] | None:
    """Fallback parser for PDFs where a whole lab row is extracted as one line."""
    raw = _clean(line)
    if not raw or _is_metadata_line(raw):
        return None
    if _looks_like_note(raw):
        return {"row_type": "note", "notes": raw, "raw_text": raw}
    m = INLINE_RESULT_RE.match(raw)
    if not m:
        return None
    name = _clean(m.group("name")).rstrip(" *")
    value = _clean(m.group("value")).replace("*", "")
    flag = "*" if (m.group("flag") or "*" in raw[: max(3, raw.find(value) if value in raw else 3)]) else ""
    unit = _clean(m.group("unit") or "")
    ref = _clean(m.group("range") or "")
    if ref and not (_is_range_line(ref) or "-" in ref or "up to" in ref.lower() or "optimum" in ref.lower()):
        # Keep noisy trailing text out of the structured reference-range cell.
        ref = ref if any(ch.isdigit() for ch in ref) else ""
    if not name or not value:
        return None
    return {
        "row_type": "result",
        "test_name": name,
        "flag": flag,
        "result_value": value,
        "unit": unit,
        "reference_range": ref,
        "is_abnormal": bool(flag),
        "notes": "",
        "raw_text": raw,
    }


def _consume_vertical_row(lines: list[str], i: int) -> tuple[dict[str, Any] | None, int]:
    name = _clean(lines[i])
    if not _is_probable_test_name(name):
        return None, i + 1

    j = i + 1
    while j < len(lines) and not _clean(lines[j]):
        j += 1
    if j >= len(lines):
        return None, i + 1

    value_line = _clean(lines[j])
    if not _is_value_line(value_line):
        inline = parse_lab_result_line(" ".join(lines[i : min(i + 4, len(lines))]))
        if inline:
            return inline, min(i + 4, len(lines))
        return None, i + 1

    flag = "*" if value_line.startswith("*") else ""
    value = value_line.lstrip("*").strip()
    unit = ""
    ref = ""
    raw_parts = [name, value_line]
    j += 1

    if j < len(lines):
        next_line = _clean(lines[j])
        unit_ref = _parse_unit_and_range(next_line)
        if unit_ref:
            unit, possible_ref = unit_ref
            raw_parts.append(next_line)
            if possible_ref:
                ref = possible_ref
            j += 1
        elif _is_range_line(next_line):
            ref = next_line
            raw_parts.append(next_line)
            j += 1

    if not ref and j < len(lines):
        next_line = _clean(lines[j])
        if _is_range_line(next_line):
            ref = next_line
            raw_parts.append(next_line)
            j += 1

    # A unit is sometimes embedded in the test name, e.g. HAEMOGLOBIN (g/L).
    if not unit:
        m = re.search(r"\(([^)]+)\)\s*$", name)
        candidate_unit = (m.group(1).strip() if m else "")
        if candidate_unit and UNIT_RE.match(candidate_unit):
            unit = candidate_unit

    return {
        "row_type": "result",
        "test_name": name,
        "flag": flag,
        "result_value": value,
        "unit": unit,
        "reference_range": ref,
        "is_abnormal": bool(flag),
        "notes": "",
        "raw_text": " ".join(raw_parts),
    }, j


def extract_tables_from_pages(page_texts: list[tuple[int, str]]) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    active_section: str | None = None

    def close_current() -> None:
        nonlocal current
        if current and current.get("rows"):
            tables.append(current)
        current = None

    for page_number, page_text in page_texts:
        lines = [_clean(l) for l in (page_text or "").splitlines()]
        i = 0
        while i < len(lines):
            line = lines[i]
            if not line:
                i += 1
                continue

            section = _detect_section(line)
            if section:
                close_current()
                active_section = section
                current = {"section_title": section, "page_number": page_number, "rows": [], "raw_lines": [line]}
                i += 1
                continue

            if _is_stop(line):
                close_current()
                active_section = None
                i += 1
                continue

            if active_section and current is None:
                current = {"section_title": active_section, "page_number": page_number, "rows": [], "raw_lines": []}

            if not current:
                i += 1
                continue

            current.setdefault("raw_lines", []).append(line)

            if _looks_like_note(line):
                current["rows"].append({
                    "row_type": "note",
                    "row_order": len(current["rows"]) + 1,
                    "notes": line,
                    "raw_text": line,
                })
                i += 1
                continue

            row, next_i = _consume_vertical_row(lines, i)
            if row:
                row["row_order"] = len(current["rows"]) + 1
                current["rows"].append(row)
                # Add consumed lines to raw_lines so the source text is auditable.
                for extra in lines[i + 1 : next_i]:
                    if extra:
                        current.setdefault("raw_lines", []).append(extra)
                i = next_i
                continue

            inline = parse_lab_result_line(line)
            if inline:
                inline["row_order"] = len(current["rows"]) + 1
                current["rows"].append(inline)
            i += 1

    close_current()
    return tables


def extract_tables_from_page_text(page_text: str, page_number: int) -> list[dict[str, Any]]:
    return extract_tables_from_pages([(page_number, page_text)])


def store_extracted_tables(db: Session, report: MedicalReport, source: ReportSourceFile, page_texts: list[tuple[int, str]]) -> int:
    table_count = 0
    row_count = 0
    extracted = extract_tables_from_pages(page_texts)
    for table_index, table_data in enumerate(extracted, start=1):
        table = ExtractedTable(
            report_id=report.id,
            source_file_id=source.id,
            patient_id=report.patient_id,
            doctor_id=report.uploaded_by_id,
            section_title=table_data.get("section_title") or "Extracted Table",
            page_number=int(table_data.get("page_number") or 0),
            table_index=table_index,
            raw_text="\n".join(table_data.get("raw_lines") or []),
        )
        db.add(table)
        db.flush()
        table_count += 1
        for row in table_data.get("rows") or []:
            db.add(ExtractedTableRow(
                table_id=table.id,
                row_order=int(row.get("row_order") or 0),
                row_type=row.get("row_type") or "result",
                test_name=row.get("test_name") or "",
                flag=row.get("flag") or "",
                result_value=row.get("result_value") or "",
                unit=row.get("unit") or "",
                reference_range=row.get("reference_range") or "",
                is_abnormal=bool(row.get("is_abnormal")),
                notes=row.get("notes") or "",
                raw_text=row.get("raw_text") or "",
            ))
            row_count += 1
    source.table_count = table_count
    if table_count and source.extraction_type != "mixed":
        source.extraction_type = "table"
    return row_count


def table_to_dict(table: ExtractedTable) -> dict[str, Any]:
    rows = sorted(table.rows or [], key=lambda r: r.row_order)
    return {
        "id": table.id,
        "source_file_id": table.source_file_id,
        "section_title": table.section_title,
        "page_number": table.page_number,
        "table_index": table.table_index,
        "row_count": len(rows),
        "rows": [
            {
                "id": row.id,
                "row_order": row.row_order,
                "row_type": row.row_type,
                "test_name": row.test_name,
                "flag": row.flag,
                "result_value": row.result_value,
                "unit": row.unit,
                "reference_range": row.reference_range,
                "is_abnormal": row.is_abnormal,
                "notes": row.notes,
                "raw_text": row.raw_text,
            }
            for row in rows
        ],
    }


def report_tables_to_csv(tables: list[ExtractedTable]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["source_file_id", "section_title", "page_number", "table_index", "row_order", "test_name", "flag", "result_value", "unit", "reference_range", "is_abnormal", "notes", "raw_text"])
    for table in tables:
        for row in sorted(table.rows or [], key=lambda r: r.row_order):
            writer.writerow([
                table.source_file_id,
                table.section_title,
                table.page_number,
                table.table_index,
                row.row_order,
                row.test_name,
                row.flag,
                row.result_value,
                row.unit,
                row.reference_range,
                "yes" if row.is_abnormal else "no",
                row.notes,
                row.raw_text,
            ])
    return output.getvalue()
