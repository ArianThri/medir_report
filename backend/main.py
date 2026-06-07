from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.db.init_db import init_db
from app.routers import auth, patients, reports
import os

app = FastAPI(title="MediReport Pro", version="2.0.0")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Path("static").mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
def startup():
    init_db()
    Path("static/patient_data").mkdir(parents=True, exist_ok=True)

@app.get("/health")
def health():
    return {"status": "healthy", "app": "MediReport Pro"}

app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
# Compatibility aliases for older frontend attempts.
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(reports.router)
