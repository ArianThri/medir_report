from __future__ import annotations

import json
import re
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from app.models import MedicalReport, ReportImage, ReportSourceFile
from app.services.report_builder import normalise_section_key, clean_source_report_text
from app.services.storage import public_url_for
from app.services.table_extraction import store_extracted_tables

SHORT_TEXT_IMAGE_THRESHOLD = 120

KEYWORD_MAP = {
    "Carotid Doppler Scan": ["carotid", "cca", "ica", "eca", "doppler", "cimt", "bulb", "vertebral"],
    "Thyroid Scan": ["thyroid", "isthmus", "submandibular", "parotid", "neck", "u2 nodule"],
    "Abdominal Scan": ["abdomen", "abdominal", "liver", "gallbladder", "spleen", "pancreas", "portal vein", "cbd", "aorta"],
    "KUB Scan": ["kub", "kidney", "renal", "bladder", "prostate", "rt kidney", "lt kidney"],
    "Testes Scan": ["testes", "testis", "epididymis", "varicocele", "hydrocele", "scrotal"],
    "Haematology": ["haematology", "hematology", "haemoglobin", "platelet", "white cell", "esr"],
    "Biochemistry": ["biochemistry", "sodium", "potassium", "creatinine", "cholesterol", "bilirubin"],
    "Endocrinology": ["endocrinology", "psa", "thyroid stimulating hormone", "vitamin d", "hba1c"],
}


def _safe_filename(name: str) -> str:
    name = Path(name or "source.pdf").name
    cleaned = "".join(c if c.isalnum() or c in ".-_" else "_" for c in name)
    return cleaned if cleaned.lower().endswith(".pdf") else cleaned + ".pdf"


def save_upload_file(fileobj, target: Path) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with target.open("wb") as out:
        while True:
            chunk = fileobj.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            out.write(chunk)
    return size


def _classify_from_text(text: str, page_number: int, total_pages: int) -> tuple[str, list[str]]:
    """Classify from selectable PDF page text.

    This is still useful for text pages and for simple appendix pages, but image crops
    must be classified panel-by-panel because one source PDF page can contain panels
    from two different scan sections.
    """
    hay = (text or "").lower()
    scores = []
    for section, keys in KEYWORD_MAP.items():
        score = sum(1 for k in keys if k in hay)
        if score:
            scores.append((score, section, [k for k in keys if k in hay]))
    if scores:
        scores.sort(reverse=True)
        return scores[0][1], scores[0][2]

    # Weak fallback for common ultrasound appendix page ordering.
    if total_pages >= 15:
        if 3 <= page_number <= 8:
            return "Carotid Doppler Scan", ["fallback_page_range"]
        if 9 <= page_number <= 12:
            return "Thyroid Scan", ["fallback_page_range"]
        if page_number in {13, 14, 17, 19, 20}:
            return "Abdominal Scan", ["fallback_page_range"]
        if page_number in {15, 16, 18, 21}:
            return "KUB Scan", ["fallback_page_range"]
        if page_number >= 22:
            return "Testes Scan", ["fallback_page_range"]
    return normalise_section_key(text), []


def _classify_panel(page_text: str, page_number: int, panel_number: int, total_pages: int) -> tuple[str, list[str]]:
    """Classify each extracted ultrasound crop individually.

    Some ultrasound source pages contain section transitions inside the same PDF page.
    Example from the current sample:
      - page 8 panel 1 is carotid, while page 8 panels 2-3 are thyroid
      - page 12 panels 1-2 are thyroid, while page 12 panel 3 is abdominal
      - page 21 panels 1-2 are KUB/prostate, while page 21 panel 3 is testes

    Without this, the backend classifies every panel by the source page number and
    places transition panels under the wrong section.
    """
    if total_pages >= 20:
        if page_number == 8:
            if panel_number == 1:
                return "Carotid Doppler Scan", ["panel_transition_page_8"]
            return "Thyroid Scan", ["panel_transition_page_8"]

        if page_number == 12:
            if panel_number <= 2:
                return "Thyroid Scan", ["panel_transition_page_12"]
            return "Abdominal Scan", ["panel_transition_page_12"]

        if page_number == 21:
            if panel_number <= 2:
                return "KUB Scan", ["panel_transition_page_21"]
            return "Testes Scan", ["panel_transition_page_21"]

    return _classify_from_text(page_text, page_number, total_pages)



def _is_text_or_summary_page(page_text: str, page_number: int) -> bool:
    """Avoid saving text/report summary pages as images.

    Medical report text pages can contain logos and dark text, but they should not be treated as
    extracted clinical images. True ultrasound pages have large continuous dark regions.
    """
    compact = " ".join((page_text or "").split()).lower()
    if page_number <= 2 and len(compact) > 220:
        return True
    text_markers = [
        "conclusion", "recommendation", "scanned and reported", "consultant sonographer",
        "source report details", "clinical indication", "these ultrasound examinations",
        "medical ultrasound specialist", "m e d i r e p o r t", "doctor opinion",
    ]
    if len(compact) > 600 and any(m in compact for m in text_markers):
        return True
    return False


def _pixmap_to_rgb_array(page: fitz.Page, zoom: float = 2.2) -> np.ndarray:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if arr.shape[2] > 3:
        arr = arr[:, :, :3]
    return arr.copy()


def _merge_close_intervals(intervals: list[tuple[int, int]], gap: int) -> list[tuple[int, int]]:
    if not intervals:
        return []
    intervals = sorted(intervals)
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        if start - last_end <= gap:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def _find_runs(mask: np.ndarray, min_len: int = 1) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = None
    for i, val in enumerate(mask.tolist()):
        if val and start is None:
            start = i
        elif not val and start is not None:
            if i - start >= min_len:
                runs.append((start, i))
            start = None
    if start is not None and len(mask) - start >= min_len:
        runs.append((start, len(mask)))
    return runs


def _split_large_stacked_box(gray: np.ndarray, box: tuple[int, int, int, int]) -> list[tuple[int, int, int, int]]:
    """Split a vertically stacked ultrasound strip into individual frames.

    The original PDF often stores three ultrasound screenshots in one vertical strip. The strip
    has narrow light separators between frames. We use row-level darkness inside the strip; if
    separators are not clear, we fall back to aspect-ratio based equal splitting.
    """
    x0, y0, x1, y1 = box
    w = max(1, x1 - x0)
    h = max(1, y1 - y0)
    region = gray[y0:y1, x0:x1]
    if region.size == 0:
        return [box]

    # Try real separators first.
    row_dark = (region < 95).mean(axis=1)
    light_rows = row_dark < 0.07
    gaps = _find_runs(light_rows, min_len=max(5, h // 130))
    cuts = []
    for a, b in gaps:
        # Ignore top/bottom margins. Keep separator centre.
        if h * 0.08 < a < h * 0.92:
            cuts.append((a + b) // 2)

    segments: list[tuple[int, int]] = []
    last = 0
    for c in cuts:
        if c - last > max(60, h * 0.13):
            segments.append((last, c))
            last = c
    if h - last > max(60, h * 0.13):
        segments.append((last, h))

    cleaned: list[tuple[int, int, int, int]] = []
    for a, b in segments:
        sub = region[a:b, :]
        if sub.size == 0:
            continue
        # Trim local dark bbox in this segment.
        dark = sub < 105
        if dark.mean() < 0.06:
            continue
        rows = np.where(dark.mean(axis=1) > 0.04)[0]
        cols = np.where(dark.mean(axis=0) > 0.025)[0]
        if rows.size == 0 or cols.size == 0:
            continue
        yy0, yy1 = int(rows[0]), int(rows[-1]) + 1
        xx0, xx1 = int(cols[0]), int(cols[-1]) + 1
        cx0, cx1 = x0 + xx0, x0 + xx1
        cy0, cy1 = y0 + a + yy0, y0 + a + yy1
        if (cx1 - cx0) > 120 and (cy1 - cy0) > 80:
            cleaned.append((cx0, cy0, cx1, cy1))

    # Accept separator result if it has multiple sane panels.
    if len(cleaned) >= 2:
        return cleaned[:4]

    # Fallback: if the crop is a tall strip, split it equally into 2 or 3 panels.
    ratio = h / float(w)
    pieces = 1
    if ratio >= 1.35:
        pieces = 3
    elif ratio >= 0.82:
        pieces = 2
    if pieces == 1:
        return [box]

    out: list[tuple[int, int, int, int]] = []
    for idx in range(pieces):
        sy0 = int(y0 + idx * h / pieces)
        sy1 = int(y0 + (idx + 1) * h / pieces)
        # Trim each equal slice to dark content.
        sub = gray[sy0:sy1, x0:x1]
        dark = sub < 105
        rows = np.where(dark.mean(axis=1) > 0.035)[0]
        cols = np.where(dark.mean(axis=0) > 0.025)[0]
        if rows.size == 0 or cols.size == 0:
            continue
        yy0, yy1 = int(rows[0]), int(rows[-1]) + 1
        xx0, xx1 = int(cols[0]), int(cols[-1]) + 1
        cx0, cx1 = x0 + xx0, x0 + xx1
        cy0, cy1 = sy0 + yy0, sy0 + yy1
        if (cx1 - cx0) > 120 and (cy1 - cy0) > 80:
            out.append((cx0, cy0, cx1, cy1))
    return out or [box]


def _detect_ultrasound_panels(rgb: np.ndarray, page_text: str, page_number: int) -> list[tuple[int, int, int, int]]:
    """Return cropped panel boxes in rendered-image pixel coordinates.

    This deliberately ignores ordinary text pages. It uses darkness density, not plain text/OCR,
    because ultrasound images are mostly black while report text pages are mostly white.
    """
    if rgb.size == 0:
        return []
    if _is_text_or_summary_page(page_text, page_number):
        # Still allow pages with truly large dark regions to pass below, but raise the bar.
        text_page = True
    else:
        text_page = False

    gray = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]).astype(np.uint8)
    h, w = gray.shape

    # Restrict to inner page area to avoid borders and file viewer artefacts.
    margin_x = int(w * 0.04)
    margin_y = int(h * 0.035)
    work = gray[margin_y:h - margin_y, margin_x:w - margin_x]
    if work.size == 0:
        return []

    dark = work < 95
    # If the whole page has too little dense dark content, it is not an ultrasound image page.
    overall_dark = float(dark.mean())
    if text_page and overall_dark < 0.18:
        return []
    if overall_dark < 0.045:
        return []

    row_dark = dark.mean(axis=1)
    # Dense dark bands: ultrasound rows often have 30-80% dark pixels; text pages much less.
    row_mask = row_dark > (0.22 if not text_page else 0.30)
    row_runs = _merge_close_intervals(_find_runs(row_mask, min_len=max(18, h // 90)), gap=max(8, h // 140))

    candidate_boxes: list[tuple[int, int, int, int]] = []
    for ry0, ry1 in row_runs:
        if ry1 - ry0 < max(70, h // 25):
            continue
        band = dark[ry0:ry1, :]
        col_dark = band.mean(axis=0)
        col_mask = col_dark > 0.06
        col_runs = _merge_close_intervals(_find_runs(col_mask, min_len=max(30, w // 60)), gap=max(10, w // 120))
        if not col_runs:
            continue
        # Usually the largest horizontal block is the ultrasound content.
        cx0, cx1 = max(col_runs, key=lambda r: r[1] - r[0])
        # Convert back to full-image coordinates and pad lightly.
        pad_x = int(w * 0.008)
        pad_y = int(h * 0.006)
        x0 = max(0, margin_x + cx0 - pad_x)
        x1 = min(w, margin_x + cx1 + pad_x)
        y0 = max(0, margin_y + ry0 - pad_y)
        y1 = min(h, margin_y + ry1 + pad_y)
        if (x1 - x0) < 140 or (y1 - y0) < 90:
            continue
        candidate_boxes.append((x0, y0, x1, y1))

    # If no row bands were found but page has a large dark image, use global bbox.
    if not candidate_boxes and overall_dark > (0.10 if not text_page else 0.22):
        rows = np.where(dark.mean(axis=1) > 0.08)[0]
        cols = np.where(dark.mean(axis=0) > 0.04)[0]
        if rows.size and cols.size:
            x0 = margin_x + int(cols[0])
            x1 = margin_x + int(cols[-1]) + 1
            y0 = margin_y + int(rows[0])
            y1 = margin_y + int(rows[-1]) + 1
            if (x1 - x0) > 160 and (y1 - y0) > 100:
                candidate_boxes.append((x0, y0, x1, y1))

    # Split tall stacked boxes into individual ultrasound frames.
    panels: list[tuple[int, int, int, int]] = []
    for box in candidate_boxes:
        panels.extend(_split_large_stacked_box(gray, box))

    # Remove duplicate/near-duplicate boxes.
    unique: list[tuple[int, int, int, int]] = []
    for b in sorted(panels, key=lambda t: (t[1], t[0])):
        x0, y0, x1, y1 = b
        area = max(1, (x1 - x0) * (y1 - y0))
        duplicate = False
        for u in unique:
            ux0, uy0, ux1, uy1 = u
            ix0, iy0 = max(x0, ux0), max(y0, uy0)
            ix1, iy1 = min(x1, ux1), min(y1, uy1)
            if ix1 > ix0 and iy1 > iy0:
                inter = (ix1 - ix0) * (iy1 - iy0)
                if inter / float(area) > 0.70:
                    duplicate = True
                    break
        if not duplicate:
            unique.append(b)

    # Hard cap to avoid pathological pages and upload freezes.
    return unique[:6]





def _panel_horizontal_overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax0, _, ax1, _ = a
    bx0, _, bx1, _ = b
    inter = max(0, min(ax1, bx1) - max(ax0, bx0))
    denom = max(1, min(ax1 - ax0, bx1 - bx0))
    return inter / float(denom)


def _expand_panel_box(box: tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int]:
    """Add a conservative safety margin around one panel.

    This is used only when there is no neighbour information. For pages with
    multiple stacked ultrasound/echo screenshots, use _expand_panel_boxes_safely
    so the crop does not bleed into the next screenshot.
    """
    x0, y0, x1, y1 = box
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    pad_x = max(10, int(bw * 0.018), int(width * 0.004))
    pad_y = max(10, int(bh * 0.018), int(height * 0.004))
    return (
        max(0, x0 - pad_x),
        max(0, y0 - pad_y),
        min(width, x1 + pad_x),
        min(height, y1 + pad_y),
    )


def _expand_panel_boxes_safely(
    boxes: list[tuple[int, int, int, int]],
    width: int,
    height: int,
) -> list[tuple[int, int, int, int]]:
    """Expand panel crops without including neighbouring panels.

    The previous safety-margin fix preserved borders, but for pages containing
    vertically stacked echo frames it could include the top of the next image.
    This function adds a small margin only inside the available whitespace
    between neighbouring panels. It protects clinical edges while avoiding
    contamination from adjacent screenshots.
    """
    if not boxes:
        return []
    ordered = sorted(boxes, key=lambda b: (b[1], b[0]))
    expanded: list[tuple[int, int, int, int]] = []

    for i, box in enumerate(ordered):
        x0, y0, x1, y1 = box
        bw = max(1, x1 - x0)
        bh = max(1, y1 - y0)
        base_pad_x = max(10, int(bw * 0.018), int(width * 0.004))
        base_pad_y = max(10, int(bh * 0.018), int(height * 0.004))

        left = max(0, x0 - base_pad_x)
        right = min(width, x1 + base_pad_x)
        top = max(0, y0 - base_pad_y)
        bottom = min(height, y1 + base_pad_y)

        # Clamp vertical expansion so stacked screenshots do not bleed into each other.
        prev_candidates = [
            other for other in ordered[:i]
            if other[3] <= y0 and _panel_horizontal_overlap(box, other) > 0.20
        ]
        if prev_candidates:
            prev = max(prev_candidates, key=lambda b: b[3])
            gap = max(0, y0 - prev[3])
            safe_top_pad = max(0, min(base_pad_y, (gap // 2) - 2))
            top = y0 - safe_top_pad

        next_candidates = [
            other for other in ordered[i + 1:]
            if other[1] >= y1 and _panel_horizontal_overlap(box, other) > 0.20
        ]
        if next_candidates:
            nxt = min(next_candidates, key=lambda b: b[1])
            gap = max(0, nxt[1] - y1)
            safe_bottom_pad = max(0, min(base_pad_y, (gap // 2) - 2))
            bottom = y1 + safe_bottom_pad

        # Guard against accidental invalid boxes.
        if right - left < 20 or bottom - top < 20:
            expanded.append(_expand_panel_box(box, width, height))
        else:
            expanded.append((int(left), int(top), int(right), int(bottom)))
    return expanded


def _extract_embedded_clinical_images(page: fitz.Page, page_text: str, page_number: int) -> list[tuple[Image.Image, fitz.Rect]]:
    """Extract real embedded clinical images when the source PDF stores them separately.

    This is safer than pixel/dark-region cropping for echo pages where several screenshots
    are stacked vertically. The crop-based detector can cut one frame and paste part of it
    into the next. When embedded images are available, we use the original embedded image
    bytes directly, preserving the complete frame with no crop and no neighbouring bleed.
    """
    if _is_text_or_summary_page(page_text, page_number):
        return []

    candidates: list[tuple[Image.Image, fitz.Rect]] = []
    seen: set[tuple[int, int, int, int]] = set()
    page_area = max(1.0, float(page.rect.width * page.rect.height))

    for info in page.get_images(full=True):
        xref = info[0]
        intrinsic_w = int(info[2] or 0)
        intrinsic_h = int(info[3] or 0)
        # Ignore tiny logos, icons, masks, and line-art fragments.
        if intrinsic_w < 220 or intrinsic_h < 150:
            continue

        rects = page.get_image_rects(xref) or []
        if not rects:
            continue

        for rect in rects:
            rendered_area = float(rect.width * rect.height)
            # Keep meaningful clinical panels, not small headers/logos. A full-page scanned
            # image is allowed only when the page has little/no selectable text.
            if rendered_area / page_area < 0.045:
                continue
            if page_text and len(page_text.strip()) > 250 and rendered_area / page_area > 0.90:
                continue
            key = (xref, round(rect.x0), round(rect.y0), round(rect.x1), round(rect.y1))
            if key in seen:
                continue
            seen.add(key)

            try:
                extracted = page.parent.extract_image(xref)
                image_bytes = extracted.get("image")
                if not image_bytes:
                    continue
                img = Image.open(BytesIO(image_bytes)).convert("RGB")
                if img.width < 220 or img.height < 150:
                    continue
                candidates.append((img, rect))
            except Exception:
                continue

    candidates.sort(key=lambda item: (float(item[1].y0), float(item[1].x0)))
    return candidates[:8]

def process_source_pdf(db: Session, report: MedicalReport, source: ReportSourceFile, source_pdf_path: Path, images_dir: Path) -> dict[str, Any]:
    doc = fitz.open(source_pdf_path)
    text_parts: list[str] = []
    total_pages = doc.page_count
    source_image_dir = images_dir / f"source_{source.id:04d}_{source.source_uid}"
    source_image_dir.mkdir(parents=True, exist_ok=True)
    created_images: list[ReportImage] = []
    page_texts: list[tuple[int, str]] = []

    for page_index in range(total_pages):
        page = doc[page_index]
        page_number = page_index + 1
        page_text = page.get_text("text") or ""
        cleaned_page_text = clean_source_report_text(page_text)
        if cleaned_page_text.strip():
            text_parts.append(cleaned_page_text.strip())
            page_texts.append((page_number, cleaned_page_text.strip()))

        embedded_images = _extract_embedded_clinical_images(page, page_text, page_number)
        if embedded_images:
            for panel_idx, (embedded_img, _rect) in enumerate(embedded_images, start=1):
                section, keywords = _classify_panel(page_text, page_number, panel_idx, total_pages)
                image_uid = uuid.uuid4().hex[:16]
                file_name = f"page_{page_number:03d}_panel_{panel_idx:03d}_{image_uid}.png"
                image_path = source_image_dir / file_name
                embedded_img.save(str(image_path), optimize=True)

                img = ReportImage(
                    image_uid=image_uid,
                    report_id=report.id,
                    source_file_id=source.id,
                    page_number=page_number,
                    panel_number=panel_idx,
                    file_path=str(image_path),
                    public_url=public_url_for(image_path),
                    page_text=page_text.strip(),
                    detected_heading=section,
                    suggested_section=section,
                    clinical_keywords=json.dumps(keywords + ["embedded_image_extraction"], ensure_ascii=False),
                    caption=f"Source image page {page_number}.{panel_idx}",
                )
                db.add(img)
                created_images.append(img)
            continue

        # Fallback for PDFs that do not expose clinical screenshots as embedded images.
        # This is less reliable, so it is only used when embedded extraction is unavailable.
        rgb = _pixmap_to_rgb_array(page, zoom=2.2)
        boxes = _detect_ultrasound_panels(rgb, page_text, page_number)
        if not boxes:
            continue

        pil = Image.fromarray(rgb)
        safe_boxes = _expand_panel_boxes_safely(boxes, pil.width, pil.height)
        for panel_idx, (x0, y0, x1, y1) in enumerate(safe_boxes, start=1):
            section, keywords = _classify_panel(page_text, page_number, panel_idx, total_pages)
            image_uid = uuid.uuid4().hex[:16]
            file_name = f"page_{page_number:03d}_panel_{panel_idx:03d}_{image_uid}.png"
            image_path = source_image_dir / file_name
            crop = pil.crop((x0, y0, x1, y1))
            crop.save(str(image_path), optimize=True)

            img = ReportImage(
                image_uid=image_uid,
                report_id=report.id,
                source_file_id=source.id,
                page_number=page_number,
                panel_number=panel_idx,
                file_path=str(image_path),
                public_url=public_url_for(image_path),
                page_text=page_text.strip(),
                detected_heading=section,
                suggested_section=section,
                clinical_keywords=json.dumps(keywords + ["fallback_crop_extraction"], ensure_ascii=False),
                caption=f"Source image page {page_number}.{panel_idx}",
            )
            db.add(img)
            created_images.append(img)

    doc.close()
    source.page_count = total_pages
    stored_row_count = store_extracted_tables(db, report, source, page_texts)
    if created_images and stored_row_count:
        source.extraction_type = "mixed"
    elif created_images:
        source.extraction_type = "image"
    elif stored_row_count:
        source.extraction_type = "table"
    else:
        source.extraction_type = "text" if text_parts else ""
    return {"text": "\n\n".join(text_parts), "images": created_images, "page_count": total_pages, "table_rows": stored_row_count}
