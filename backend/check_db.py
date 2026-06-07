import sqlite3

con = sqlite3.connect("medireport.db")
cur = con.cursor()

print("\n--- TABLES ---")
for row in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    print(row[0])

print("\n--- EXTRACTED TABLE SECTIONS ---")
try:
    for row in cur.execute("""
        SELECT id, report_id, source_file_id, patient_id, doctor_id, section_title, page_number
        FROM extracted_tables
        LIMIT 20
    """):
        print(row)
except Exception as e:
    print("Error:", e)

print("\n--- EXTRACTED TABLE ROWS ---")
try:
    for row in cur.execute("""
        SELECT table_id, test_name, flag, result_value, unit, reference_range, is_abnormal
        FROM extracted_table_rows
        LIMIT 50
    """):
        print(row)
except Exception as e:
    print("Error:", e)

print("\n--- TABLES LINKED TO PDF FILES ---")
try:
    for row in cur.execute("""
        SELECT t.id, s.original_filename, t.section_title, t.page_number
        FROM extracted_tables t
        LEFT JOIN report_source_files s ON s.id = t.source_file_id
        LIMIT 50
    """):
        print(row)
except Exception as e:
    print("Error:", e)

con.close()
