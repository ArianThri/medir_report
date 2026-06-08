import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.db.seed_admin import seed_admin_user
from app.routers import auth, patients, reports


app = FastAPI(title="MediReport Pro", version="2.0.0")


# CORS
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").strip()

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if frontend_url and frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static files
Path("static").mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
def startup():
    init_db()
    Path("static/patient_data").mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        seed_admin_user(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "healthy", "app": "MediReport Pro"}


# Main API routes
app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


# Compatibility aliases for older frontend attempts
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(reports.router)