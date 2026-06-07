from __future__ import annotations
from pathlib import Path
from html import escape

def render_report_html(data: dict) -> str:
    patient = data.get("patient", {})
    parts = ["<html><head><meta charset='utf-8'><title>Medical Report</title><style>body{font-family:Arial,sans-serif;color:#111;margin:28px}.brand{letter-spacing:.3em;color:#9a6a00;font-weight:700;font-size:12px}.card{border:1px solid #e5c985;border-radius:14px;padding:16px;margin:14px 0}h1{font-size:32px;margin:8px 0}h2{font-size:18px;margin:20px 0 8px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.field{border:1px solid #e8d9b5;border-radius:10px;padding:10px}.label{font-size:10px;color:#8a6500;text-transform:uppercase;font-weight:700}.img{max-width:520px;display:block;margin:14px auto;border:1px solid #e8d9b5;border-radius:12px;padding:8px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #eadbb8;padding:8px;text-align:left}th{background:#fff6df;color:#6f5200;font-size:11px;text-transform:uppercase}.review{color:#a00000;font-weight:700}</style></head><body>"]
    parts.append("<div class='brand'>MEDIREPORT PRO</div>")
    parts.append(f"<h1>{escape(data.get('title','Medical Report'))}</h1>")
    parts.append(f"<p>{escape(data.get('subtitle',''))}</p>")
    parts.append("<div class='card meta'>")
    for label, value in [("Patient Name", patient.get("full_name")), ("Age / Gender", f"{patient.get('age','')} / {patient.get('gender','')}"), ("Reference", patient.get("reference")), ("Clinical Indication", patient.get("clinical_indication"))]:
        parts.append(f"<div class='field'><div class='label'>{escape(label)}</div><div>{escape(str(value or ''))}</div></div>")
    parts.append("</div>")
    
    for warning in data.get('source_warnings', []) or []:
        parts.append(f"<div class='card'><strong>Source Patient Check:</strong> {escape(str(warning))}</div>")
    parts.append(f"<h2>Doctor Opinion</h2><div class='card'>{escape(data.get('doctor_opinion') or 'Click here to add doctor opinion...')}</div>")
    measurements = data.get('measurements') or []
    if measurements:
        parts.append("<h2>Echocardiography Measurements</h2><div class='card'><table><thead><tr><th>Category</th><th>Measurement</th><th>Value</th><th>Unit</th><th>Note</th></tr></thead><tbody>")
        for m in measurements:
            parts.append(f"<tr><td>{escape(str(m.get('category','')))}</td><td>{escape(str(m.get('name','')))}</td><td><strong>{escape(str(m.get('value','')))}</strong></td><td>{escape(str(m.get('unit','')))}</td><td>{escape(str(m.get('note') or m.get('reference_range') or ''))}</td></tr>")
        parts.append("</tbody></table></div>")

    for sec in data.get("sections", []):
        parts.append(f"<h2>{escape(sec.get('title','Section'))}</h2><div class='card'>")
        rows = sec.get("rows") or []
        if rows:
            parts.append("<table><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Status</th></tr></thead><tbody>")
            for r in rows:
                if r.get("note"):
                    parts.append(f"<tr><td colspan='5'><em>{escape(r.get('note'))}</em></td></tr>")
                else:
                    cls = "review" if str(r.get("status","normal")).lower() == "review" else ""
                    parts.append(f"<tr><td>{escape(r.get('test',''))}</td><td class='{cls}'>{escape(r.get('result',''))}</td><td>{escape(r.get('unit',''))}</td><td>{escape(r.get('reference_range',''))}</td><td class='{cls}'>{escape(r.get('status',''))}</td></tr>")
            parts.append("</tbody></table>")
        else:
            content = escape(sec.get("content", "")).replace("\n", "<br>")
            parts.append(content)
        for img in sec.get("images", []):
            parts.append(f"<figure><img class='img' src='{escape(img.get('url',''))}'><figcaption>{escape(img.get('caption',''))}</figcaption></figure>")
        parts.append("</div>")
    parts.append(f"<h2>Limitations</h2><p>{escape(data.get('limitations',''))}</p></body></html>")
    return "".join(parts)

def save_html(data: dict, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_report_html(data), encoding="utf-8")
    return path
