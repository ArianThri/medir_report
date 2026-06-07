import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models import User
from app.security import get_password_hash

init_db()
db = SessionLocal()
email = input("Admin email [admin@example.com]: ").strip() or "admin@example.com"
password = input("Admin password [Admin12345!]: ").strip() or "Admin12345!"
user = db.query(User).filter(User.email == email.lower()).first()
if not user:
    user = User(email=email.lower(), full_name="Admin", hashed_password=get_password_hash(password), role="admin", is_approved=True, is_active=True)
    db.add(user)
else:
    user.hashed_password = get_password_hash(password)
    user.role = "admin"
    user.is_approved = True
    user.is_active = True
db.commit()
print("Admin ready")
print("Email:", email)
print("Password:", password)
