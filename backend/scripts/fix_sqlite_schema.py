import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.db.init_db import init_db
init_db()
print("SQLite schema fixed successfully.")
