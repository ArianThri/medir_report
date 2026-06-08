import os

from sqlalchemy.orm import Session

from app.models import User
from app.security import get_password_hash


def seed_admin_user(db: Session) -> None:
    """
    Creates or repairs the first admin account from environment variables.

    Required environment variables:
    ADMIN_EMAIL
    ADMIN_PASSWORD

    Optional:
    ADMIN_NAME
    """

    admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "").strip()
    admin_name = os.getenv("ADMIN_NAME", "Admin").strip() or "Admin"

    if not admin_email or not admin_password:
        print("Admin seed skipped: ADMIN_EMAIL or ADMIN_PASSWORD is missing.")
        return

    user = db.query(User).filter(User.email == admin_email).first()

    if user:
        changed = False

        if user.role != "admin":
            user.role = "admin"
            changed = True

        if not user.is_approved:
            user.is_approved = True
            changed = True

        if not user.is_active:
            user.is_active = True
            changed = True

        if not user.full_name:
            user.full_name = admin_name
            changed = True

        # Always update password from ADMIN_PASSWORD, so you can reset admin login safely.
        user.hashed_password = get_password_hash(admin_password)
        changed = True

        if changed:
            db.commit()

        print(f"Admin seed updated existing admin: {admin_email}")
        return

    admin = User(
        email=admin_email,
        full_name=admin_name,
        hashed_password=get_password_hash(admin_password),
        role="admin",
        is_approved=True,
        is_active=True,
    )

    db.add(admin)
    db.commit()

    print(f"Admin seed created admin: {admin_email}")