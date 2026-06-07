# MediReport Pro Rebuilt

This rebuild separates data at the correct level:

```text
Patient
  └── Report
      └── Source PDF
          └── Extracted image/page metadata
```

Images are no longer saved in a shared global report folder. Each report gets its own folder under:

```text
backend/static/patient_data/patient_0001/report_0001_<report_uid>/
  sources/
  extracted_images/
  exports/
```

## Backend setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python scripts\fix_sqlite_schema.py
python scripts\create_admin.py
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000/health
```

## Frontend setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --force
```

Open:

```text
http://127.0.0.1:5173/
```

## Important routes

```text
POST /api/auth/login
GET  /api/auth/me
GET  /api/patients
POST /api/patients
GET  /api/patients/{patient_id}
POST /api/reports/patients/{patient_id}/upload-pdfs
GET  /api/reports/{report_id}
POST /api/reports/{report_id}/ai-enhance?use_vision=true
GET  /api/reports/{report_id}/debug-images
GET  /api/reports/{report_id}/download-html
```

## Debug images

After uploading PDFs, open:

```text
http://127.0.0.1:8000/api/reports/<REPORT_ID>/debug-images
```

Expected: `image_count` should be greater than 0 for reports with ultrasound/source images.

## OpenAI

Set your real key in `backend/.env`:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o
```

The system works without OpenAI using deterministic extraction and fallback matching. OpenAI vision can improve `suggested_section` for hard image pages.
