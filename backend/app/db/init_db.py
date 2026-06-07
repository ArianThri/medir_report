from __future__ import annotations

from sqlalchemy import inspect, text

from app.db.session import Base, engine
from app import models  # noqa: F401


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    inspector = inspect(conn)
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {col["name"] for col in inspector.get_columns(table_name)}


def _add_column_if_missing(conn, table_name: str, column_name: str, ddl: str) -> None:
    if not _column_exists(conn, table_name, column_name):
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"))


def _sqlite_migrations() -> None:
    """Small, safe migrations for existing local SQLite databases.

    SQLAlchemy create_all() creates missing tables, but it does not alter old tables.
    This keeps old MediReport databases usable after adding doctor ownership,
    approval and report-source columns without deleting patient/report data.
    """
    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names())

        if "users" in tables:
            _add_column_if_missing(conn, "users", "full_name", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "users", "role", "VARCHAR(30) DEFAULT 'doctor'")
            _add_column_if_missing(conn, "users", "is_approved", "BOOLEAN DEFAULT 0")
            _add_column_if_missing(conn, "users", "is_active", "BOOLEAN DEFAULT 1")
            _add_column_if_missing(conn, "users", "created_at", "DATETIME")
            conn.execute(text("UPDATE users SET role = 'doctor' WHERE role IS NULL OR role = ''"))
            conn.execute(text("UPDATE users SET is_approved = 1 WHERE role = 'admin' AND is_approved IS NULL"))
            conn.execute(text("UPDATE users SET is_approved = 0 WHERE role = 'doctor' AND is_approved IS NULL"))
            conn.execute(text("UPDATE users SET is_active = 1 WHERE is_active IS NULL"))

        if "patients" in tables:
            _add_column_if_missing(conn, "patients", "age", "VARCHAR(50) DEFAULT ''")
            _add_column_if_missing(conn, "patients", "gender", "VARCHAR(50) DEFAULT ''")
            _add_column_if_missing(conn, "patients", "date_of_birth", "VARCHAR(80) DEFAULT ''")
            _add_column_if_missing(conn, "patients", "reference", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "patients", "notes", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "patients", "created_by_id", "INTEGER")
            _add_column_if_missing(conn, "patients", "assigned_doctor_id", "INTEGER")
            _add_column_if_missing(conn, "patients", "created_at", "DATETIME")
            _add_column_if_missing(conn, "patients", "updated_at", "DATETIME")

        if "medical_reports" in tables:
            _add_column_if_missing(conn, "medical_reports", "report_uid", "VARCHAR(64)")
            _add_column_if_missing(conn, "medical_reports", "uploaded_by_id", "INTEGER")
            _add_column_if_missing(conn, "medical_reports", "title", "VARCHAR(255) DEFAULT 'Medical Report'")
            _add_column_if_missing(conn, "medical_reports", "report_type", "VARCHAR(50) DEFAULT 'unknown_report'")
            _add_column_if_missing(conn, "medical_reports", "status", "VARCHAR(30) DEFAULT 'draft'")
            _add_column_if_missing(conn, "medical_reports", "extracted_text", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "medical_reports", "editable_report", "TEXT DEFAULT '{}' ")
            _add_column_if_missing(conn, "medical_reports", "doctor_opinion", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "medical_reports", "storage_root", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "medical_reports", "created_at", "DATETIME")
            _add_column_if_missing(conn, "medical_reports", "updated_at", "DATETIME")
            conn.execute(text("UPDATE medical_reports SET status = 'draft' WHERE status IS NULL OR status = ''"))
            conn.execute(text("UPDATE medical_reports SET report_type = 'unknown_report' WHERE report_type IS NULL OR report_type = ''"))
            conn.execute(text("UPDATE medical_reports SET title = 'Medical Report' WHERE title IS NULL OR title = ''"))
            conn.execute(text("UPDATE medical_reports SET editable_report = '{}' WHERE editable_report IS NULL OR editable_report = ''"))

        if "report_source_files" in tables:
            _add_column_if_missing(conn, "report_source_files", "source_uid", "VARCHAR(64)")
            _add_column_if_missing(conn, "report_source_files", "stored_filename", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "stored_path", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "page_count", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_source_files", "file_size", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_source_files", "order", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_source_files", "created_at", "DATETIME")
            _add_column_if_missing(conn, "report_source_files", "table_count", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_source_files", "extraction_type", "VARCHAR(30) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "detected_document_type", "VARCHAR(50) DEFAULT 'unknown_report'")
            _add_column_if_missing(conn, "report_source_files", "extraction_status", "VARCHAR(50) DEFAULT 'pending'")
            _add_column_if_missing(conn, "report_source_files", "extracted_patient_name", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "extracted_dob", "VARCHAR(80) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "extracted_age", "VARCHAR(50) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "extracted_gender", "VARCHAR(50) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "extracted_reference", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "extracted_clinical_indication", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "mismatch_warning", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_source_files", "is_deleted", "BOOLEAN DEFAULT 0")
            conn.execute(text("UPDATE report_source_files SET stored_filename = '' WHERE stored_filename IS NULL"))
            conn.execute(text("UPDATE report_source_files SET page_count = 0 WHERE page_count IS NULL"))
            conn.execute(text("UPDATE report_source_files SET file_size = 0 WHERE file_size IS NULL"))
            conn.execute(text("UPDATE report_source_files SET table_count = 0 WHERE table_count IS NULL"))
            conn.execute(text("UPDATE report_source_files SET extraction_type = '' WHERE extraction_type IS NULL"))
            conn.execute(text("UPDATE report_source_files SET detected_document_type = 'unknown_report' WHERE detected_document_type IS NULL OR detected_document_type = ''"))
            conn.execute(text("UPDATE report_source_files SET extraction_status = 'pending' WHERE extraction_status IS NULL OR extraction_status = ''"))
            conn.execute(text("UPDATE report_source_files SET is_deleted = 0 WHERE is_deleted IS NULL"))

        if "report_images" in tables:
            _add_column_if_missing(conn, "report_images", "image_uid", "VARCHAR(64)")
            _add_column_if_missing(conn, "report_images", "source_file_id", "INTEGER")
            _add_column_if_missing(conn, "report_images", "section_id", "INTEGER")
            _add_column_if_missing(conn, "report_images", "page_number", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_images", "panel_number", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "report_images", "file_path", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "public_url", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "page_text", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "ocr_text", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "detected_heading", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "suggested_section", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "clinical_keywords", "TEXT DEFAULT '[]'")
            _add_column_if_missing(conn, "report_images", "caption", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_images", "image_type", "VARCHAR(50) DEFAULT 'source_image'")
            _add_column_if_missing(conn, "report_images", "created_at", "DATETIME")


        if "report_sections" in tables:
            _add_column_if_missing(conn, "report_sections", "report_id", "INTEGER")
            _add_column_if_missing(conn, "report_sections", "source_file_id", "INTEGER")
            _add_column_if_missing(conn, "report_sections", "section_type", "VARCHAR(80) DEFAULT 'text'")
            _add_column_if_missing(conn, "report_sections", "title", "VARCHAR(255) DEFAULT 'Section'")
            _add_column_if_missing(conn, "report_sections", "body", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_sections", "order_index", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_sections", "created_at", "DATETIME")

        if "report_measurements" in tables:
            _add_column_if_missing(conn, "report_measurements", "report_id", "INTEGER")
            _add_column_if_missing(conn, "report_measurements", "source_file_id", "INTEGER")
            _add_column_if_missing(conn, "report_measurements", "category", "VARCHAR(120) DEFAULT ''")
            _add_column_if_missing(conn, "report_measurements", "name", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_measurements", "value", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_measurements", "unit", "VARCHAR(80) DEFAULT ''")
            _add_column_if_missing(conn, "report_measurements", "reference_range", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "report_measurements", "note", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "report_measurements", "order_index", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "report_measurements", "created_at", "DATETIME")

        if "extracted_tables" in tables:
            _add_column_if_missing(conn, "extracted_tables", "report_id", "INTEGER")
            _add_column_if_missing(conn, "extracted_tables", "source_file_id", "INTEGER")
            _add_column_if_missing(conn, "extracted_tables", "patient_id", "INTEGER")
            _add_column_if_missing(conn, "extracted_tables", "doctor_id", "INTEGER")
            _add_column_if_missing(conn, "extracted_tables", "section_title", "VARCHAR(255) DEFAULT 'Extracted Table'")
            _add_column_if_missing(conn, "extracted_tables", "page_number", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "extracted_tables", "table_index", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "extracted_tables", "raw_text", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "extracted_tables", "created_at", "DATETIME")

        if "extracted_table_rows" in tables:
            _add_column_if_missing(conn, "extracted_table_rows", "table_id", "INTEGER")
            _add_column_if_missing(conn, "extracted_table_rows", "row_order", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "extracted_table_rows", "row_type", "VARCHAR(30) DEFAULT 'result'")
            _add_column_if_missing(conn, "extracted_table_rows", "test_name", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "flag", "VARCHAR(20) DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "result_value", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "unit", "VARCHAR(80) DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "reference_range", "VARCHAR(255) DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "is_abnormal", "BOOLEAN DEFAULT 0")
            _add_column_if_missing(conn, "extracted_table_rows", "notes", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "raw_text", "TEXT DEFAULT ''")
            _add_column_if_missing(conn, "extracted_table_rows", "created_at", "DATETIME")


def init_db():
    Base.metadata.create_all(bind=engine)
    if engine.url.get_backend_name() == "sqlite":
        _sqlite_migrations()
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database initialised.")
