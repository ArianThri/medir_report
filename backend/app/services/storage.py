from pathlib import Path
from app.core.config import settings

DATA_ROOT = Path("static") / "patient_data"

def ensure_report_dirs(patient_id: int, report_id: int, report_uid: str) -> dict[str, Path]:
    root = DATA_ROOT / f"patient_{patient_id:04d}" / f"report_{report_id:04d}_{report_uid}"
    dirs = {
        "root": root,
        "sources": root / "sources",
        "images": root / "extracted_images",
        "exports": root / "exports",
    }
    for p in dirs.values():
        p.mkdir(parents=True, exist_ok=True)
    return dirs

def public_url_for(path: Path) -> str:
    path = Path(path)
    try:
        rel = path.relative_to(Path("static"))
    except ValueError:
        rel = path
    return f"{settings.static_base_url}/{str(rel).replace('\\\\', '/').replace('\\', '/')}"
