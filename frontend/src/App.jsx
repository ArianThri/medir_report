import React, { useEffect, useMemo, useRef, useState } from "react";
import maleGenderIcon from "./assets/medireport_male_gender_icon.svg";
import femaleGenderIcon from "./assets/medireport_female_gender_icon.svg";
const clinicLogo = "/clinic-logo.jpeg";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
const API_BASE = () => API_BASE_URL;

const TOKEN_KEY = "medireport_access_token";
const LOCAL_PROFILE_KEY = "medireport_local_profile";

function getLocalProfile() {
  try { return JSON.parse(localStorage.getItem(LOCAL_PROFILE_KEY) || "{}"); } catch { return {}; }
}
function saveLocalProfile(profile) {
  localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile || {}));
  window.dispatchEvent(new CustomEvent("medireport-profile-updated", { detail: profile || {} }));
}

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = options.headers ? { ...options.headers } : {};

  if (token) headers.Authorization = `Bearer ${token}`;

  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const candidates = [path];
  if (path.startsWith("/api/")) candidates.push(path.replace(/^\/api/, ""));
  else candidates.push(`/api${path}`);

  let lastError = null;

  for (const candidate of [...new Set(candidates)]) {
    try {
      const res = await fetch(`${API_BASE()}${candidate}`, {
        ...options,
        headers,
      });

      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

      if (!res.ok) {
        const message = typeof data === "string" ? data : data.detail || "Request failed";
        const err = new Error(Array.isArray(message) ? JSON.stringify(message) : message);
        err.status = res.status;
        throw err;
      }

      return data;
    } catch (err) {
      lastError = err;
      const shouldTryNext =
        err?.status === 404 ||
        err?.status === 405 ||
        err?.message === "Failed to fetch" ||
        err instanceof TypeError;

      if (!shouldTryNext) throw err;
    }
  }

  throw lastError || new Error("Request failed");
}

// Legacy helpers required by the original protected Report Builder.
// Other pages continue to use apiRequest from the completed frontend.
const API = API_BASE();
function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(path, options = {}, token = "") {
  const res = await fetch(`${API_BASE()}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders(token) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.detail) || data || `Request failed: ${res.status}`);
  return data;
}

function parseJsonMaybe(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function imageUrl(img) {
  const raw = img?.url || img?.path || "";
  if (!raw) return "";
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  let normalised = raw.replace(/\\/g, "/");
  const staticIndex = normalised.indexOf("static/");
  if (staticIndex >= 0) normalised = `/${normalised.slice(staticIndex)}`;
  if (!normalised.startsWith("/")) normalised = `/${normalised}`;
  return `${API_BASE()}${normalised}`;
}

function downloadHtmlFile(filename, html) {
  const full = `<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title><style>
    :root{--ink:#17140f;--muted:#766f63;--gold:#c9942b;--gold2:#ecd8a7;--paper:#fffdf7;--line:#e8d9bb;--soft:#fbf5e7}
    *{box-sizing:border-box} html,body{margin:0;padding:0;background:#ece7dc;font-family:Inter,Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}.luxury-print-document{background:#ece7dc;padding:24px 0}.luxury-sheet{position:relative;width:210mm;height:297mm;margin:0 auto 24px;background:var(--paper);padding:16mm 15mm;border:1.5px solid #d7b46f;box-shadow:0 18px 50px rgba(30,20,5,.12);break-after:page;page-break-after:always;overflow:hidden}.luxury-sheet:last-child{break-after:auto;page-break-after:auto}.luxury-sheet>*{position:relative;z-index:2}.luxury-sheet:before{content:"";position:absolute;inset:7mm;border:1px solid #ead8aa;pointer-events:none}.luxury-sheet:after{content:"";position:absolute;inset:10mm;border:.5px solid rgba(201,148,43,.22);pointer-events:none}.corner{position:absolute!important;width:21mm;height:21mm;border-color:#c9942b;z-index:3!important}.corner.tl{top:8mm;left:8mm;border-top:1.4px solid;border-left:1.4px solid}.corner.tr{top:8mm;right:8mm;border-top:1.4px solid;border-right:1.4px solid}.corner.bl{bottom:8mm;left:8mm;border-bottom:1.4px solid;border-left:1.4px solid}.corner.br{bottom:8mm;right:8mm;border-bottom:1.4px solid;border-right:1.4px solid}.cover-sheet{display:flex;flex-direction:column;align-items:center;text-align:center;padding:19mm 18mm}.print-logo{width:42mm;height:42mm;margin:2mm auto 6mm;border:0;border-radius:0;display:grid;place-items:center;background:transparent}.print-logo img,.clinic-logo-img{max-width:42mm;max-height:42mm;width:auto;height:auto;object-fit:contain;display:block}.print-brand{text-transform:uppercase;letter-spacing:.34em;color:#9c7525;font-weight:800;font-size:12px;margin-bottom:9mm}.luxury-sheet h1{font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.08;margin:0 0 4mm;letter-spacing:.015em}.subtitle{color:var(--muted);margin:0 auto 9mm;max-width:135mm;line-height:1.5}.patient-card{display:grid;grid-template-columns:repeat(2,1fr);gap:5mm;width:150mm;margin:8mm auto}.patient-card div,.summary-card,.doctor-opinion-block,.print-section,.print-card{border:1px solid var(--line);background:#fffefa;border-radius:10px;padding:5mm;break-inside:avoid;page-break-inside:avoid}.patient-card span{display:block;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2mm}.patient-card strong{font-family:Georgia,serif;font-size:15px}.summary-card{width:158mm;text-align:left;margin-top:3mm}.summary-card h2,.sheet-heading h2{font-family:Georgia,serif;margin:0;color:#1b1710}.summary-card ul{margin:4mm 0 0 6mm;padding:0;line-height:1.55}.cover-footer{margin-top:auto;color:#9b8f7d;font-size:11px}.sheet-heading{display:flex;align-items:center;gap:5mm;border-bottom:1px solid var(--line);padding-bottom:4mm;margin-bottom:6mm;break-inside:avoid;page-break-inside:avoid}.sheet-heading span{width:13mm;height:13mm;border:1px solid var(--gold2);border-radius:50%;display:grid;place-items:center;color:#9c7525;font-family:Georgia,serif;background:#fffaf0}.section-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.doctor-opinion-block,.print-section{margin-bottom:5mm}.doctor-opinion-block h3,.print-section h3,.print-card h3{margin:0 0 3mm;font-family:Georgia,serif;font-size:16px}.doctor-opinion-block p,.print-section p,.print-card p{margin:0 0 2.8mm;line-height:1.45;font-size:12.2px;break-inside:avoid;page-break-inside:avoid;orphans:3;widows:3}.muted-print{color:#9a9286}.print-image-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5mm}.print-image-grid figure{margin:0;border:1px solid var(--line);border-radius:10px;padding:3mm;background:#fff;break-inside:avoid;page-break-inside:avoid}.print-image-grid img{width:100%;height:72mm;object-fit:cover;border-radius:6px}.print-image-grid figcaption{text-align:center;color:var(--muted);font-size:10.5px;margin-top:2mm}.source-page-sheet{padding:13mm 11mm}.source-page-sheet .source-page-frame{height:268mm;border:1px solid var(--line);border-radius:9px;background:#fffefa;padding:4mm;display:flex;align-items:center;justify-content:center;overflow:hidden}.source-page-sheet img{max-width:100%;max-height:100%;object-fit:contain;display:block}.source-page-caption{position:absolute;left:18mm;right:18mm;bottom:11mm;text-align:center;color:#8f8065;font-size:10.5px}.signature-row{display:flex;justify-content:space-between;align-items:end;gap:18mm;margin-top:24mm}.signature-row span{display:block;color:var(--muted);font-size:12px}.signature-row strong{font-family:Georgia,serif;font-size:18px}.signature-line{height:20mm;flex:0 0 75mm;border-bottom:1px solid #b99043}.lab-table{width:100%;border-collapse:collapse;font-size:10.5px}.lab-table th,.lab-table td{border:1px solid var(--line);padding:5px}.lab-table th{background:#fff7e3;text-align:left}.abnormal-row td{color:#b00020;font-weight:700}.table-notes{font-size:11px;background:#fffaf0;border-left:3px solid var(--gold);padding:8px;margin-top:8px}
    @page{size:A4 portrait;margin:0}@media print{html,body,.luxury-print-document{background:white!important;padding:0!important}.luxury-sheet{margin:0!important;box-shadow:none!important;width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;break-after:page;page-break-after:always}.luxury-sheet:last-child{break-after:auto;page-break-after:auto}}
  </style></head><body>${html}</body></html>`;
  const blob = new Blob([full], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeReport(report, patient) {
  const base = parseJsonMaybe(report, null);

  if (base) {
    const sections = Array.isArray(base.sections) ? base.sections : [];
    const nestedImages = sections.flatMap((section) => Array.isArray(section.images) ? section.images : []);
    const topImages = Array.isArray(base.images) ? base.images : [];
    const extractedImages = Array.isArray(base.extracted_images) ? base.extracted_images : [];

    return {
      ...base,
      patient: {
        full_name: patient?.full_name || base.patient?.full_name || "",
        age: patient?.age ?? base.patient?.age ?? "",
        gender: patient?.gender || base.patient?.gender || "",
        date_of_birth: patient?.date_of_birth || base.patient?.date_of_birth || "",
        patient_reference: patient?.patient_reference || patient?.reference || base.patient?.patient_reference || base.patient?.reference || "",
        reference: patient?.reference || base.patient?.reference || "",
      },
      sections,
      images: [...topImages, ...nestedImages, ...extractedImages]
        .filter(Boolean)
        .map((img) => ({ ...img, url: imageUrl(img) })),
      limitations:
        base.limitations ||
        sections.find((s) => String(s.title || "").toLowerCase().includes("limitation"))?.content ||
        "This report preserves uploaded source material and must be reviewed, edited, and approved by a qualified clinician before use.",
      doctor_opinion: base.doctor_opinion || "",
    };
  }

  return {
    title: "Luxury Medical Report",
    subtitle: "Consolidated patient report",
    patient: {
      full_name: patient?.full_name || "",
      age: patient?.age || "",
      gender: patient?.gender || "",
      date_of_birth: patient?.date_of_birth || "",
      patient_reference: patient?.patient_reference || patient?.reference || "",
      reference: patient?.reference || "",
    },
    doctor_opinion: "",
    sections: [],
    images: [],
    source_files: [],
    limitations: "This report should be reviewed by a qualified doctor before final use.",
  };
}


function renderLabTablesHtml(section, esc) {
  const tables = Array.isArray(section.tables) ? section.tables : [];
  if (!tables.length) return "";

  return tables.map((table) => {
    const rows = Array.isArray(table.rows) ? table.rows : [];
    if (!rows.length) return "";
    const notes = Array.isArray(table.notes) ? table.notes.filter(Boolean) : [];
    const notesHtml = notes.length ? `<div class="table-notes"><strong>Notes:</strong><ul>${notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>` : "";
    return `<div class="lab-table-block">
      <div class="lab-table-title">${esc(table.title || "Laboratory Results")}${table.source_file ? ` <span>${esc(table.source_file)}</span>` : ""}</div>
      <table class="lab-table">
        <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead>
        <tbody>${rows.map((row) => `<tr class="${row.flag ? "abnormal-row" : ""}">
          <td>${esc(row.test || row.name || "")}</td>
          <td><strong>${esc(row.result || row.value || "")}</strong></td>
          <td>${esc(row.unit || "")}</td>
          <td>${esc(row.reference_range || row.range || "")}</td>
          <td><strong>${esc(row.flag || "")}</strong></td>
        </tr>`).join("")}</tbody>
      </table>
      ${notesHtml}
    </div>`;
  }).join("");
}

function renderSectionHtml(section, esc) {
  const type = section.type || "text";
  if (type === "source_text") return "";
  if (type === "images") return "";
  const tableHtml = type === "tables" ? renderLabTablesHtml(section, esc) : "";
  const content = section.content ? `<div class="section-content">${esc(section.content)}</div>` : "";
  return `<section class="section"><h2>${esc(section.title)}</h2>${content}${tableHtml}</section>`;
}

function reportTextBlocks(value) {
  return String(value || "")
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}


function clampText(value, max = 1200) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function findExtractedSourceText(report) {
  const sections = report?.sections || [];
  const found = sections.find((section) => {
    const id = String(section.id || "").toLowerCase();
    const title = String(section.title || "").toLowerCase();
    return id.includes("source-extracted") || title.includes("extracted source") || title.includes("source report text");
  });
  return found?.content || "";
}

function normaliseLabName(name) {
  return String(name || "")
    .replace(/^[•\-*\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyHeading(line) {
  const clean = String(line || "").trim().replace(/[:]+$/, "");
  if (!clean || clean.length > 70) return false;
  if (/page\s+\d+|source report|produced by|authorised by|collected|received|report date|hospital no|reference|email|system|msc|doctor|consultant|specialist|vascular scientist|room\d+/i.test(clean)) return false;
  if (/\d/.test(clean) && /(g\/l|mmol|iu\/l|ug\/l|ng\/ml|x10|%|fl|pg|pmol|nmol|mm|cm|ml|\d\s*[-–]\s*\d)/i.test(clean)) return false;
  const letters = clean.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  if (/^(haematology|hematology|biochemistry|lipid profile|lipid|endocrinology|thyroid(?: scan| function)?|vitamin|iron|glycaemic|glycemic|renal|liver|kidney|hormone|prostate|urine|carotid(?: doppler)?(?: scan)?|abdominal(?: scan)?|abdomen|kub(?: scan)?|testes|scrotal|conclusion|recommendation|recommendations|clinical interpretation|clinical indication|men health check)/i.test(clean)) return true;
  return clean === clean.toUpperCase() && !/\d/.test(clean);
}

function isBoilerplateSourceLine(line) {
  const clean = String(line || "").trim();
  if (!clean) return true;
  if (/^page\s*\d+\s*(?:of|\/)\s*\d+(?:\s+by\s+\w+)?$/i.test(clean)) return true;
  if (/^page\s*:?\s*\d+\s*(?:of|\/)\s*\d+$/i.test(clean)) return true;
  if (/^by\s+monEcho$/i.test(clean)) return true;
  if (/^source report\s+\d+:/i.test(clean)) return true;
  if (/^(produced by|authorised by|automated email system|this emailed report is subject)/i.test(clean)) return true;
  return false;
}

function isPatientFemale(patient = {}) {
  const gender = String(patient.gender || "").trim().toLowerCase();
  if (/^(female|f|woman|women|زن|خانم)$/.test(gender)) return true;
  if (/\bfemale\b|\bwoman\b|\bwomen\b|زن|خانم/.test(gender)) return true;
  return false;
}

function normaliseGender(gender = "") {
  const clean = String(gender || "").trim();
  if (/^(m|male|man|مرد)$/i.test(clean)) return "Male";
  if (/^(f|female|woman|زن|خانم)$/i.test(clean)) return "Female";
  return clean;
}

function inferLabFlag(result, referenceRange, line = "") {
  if (/\*|high|low|abnormal|elevated|deficient|insufficient/i.test(line)) return "Review";
  const value = Number(String(result || "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(value)) return "";
  const range = String(referenceRange || "");
  const between = range.match(/([<>]?\d+(?:\.\d+)?)\s*[-–]\s*([<>]?\d+(?:\.\d+)?)/);
  if (between) {
    const low = Number(between[1].replace(/[^0-9.-]/g, ""));
    const high = Number(between[2].replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(low) && Number.isFinite(high) && (value < low || value > high)) return "Review";
  }
  const less = range.match(/(?:<|up\s*to|optimum\s*<)\s*(\d+(?:\.\d+)?)/i);
  if (less && value > Number(less[1])) return "Review";
  const greater = range.match(/(?:>|>=|over)\s*(\d+(?:\.\d+)?)/i);
  if (greater && value < Number(greater[1])) return "Review";
  return "";
}

function parseStructuredSourceReport(rawText) {
  const source = String(rawText || "");
  if (!source.trim()) return { tables: [], notes: [] };
  const lines = source
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  const tablesByTitle = new Map();
  const notes = [];
  let currentTitle = "Laboratory Results";
  let currentSource = "";

  const getTable = (title) => {
    const key = title || "Laboratory Results";
    if (!tablesByTitle.has(key)) tablesByTitle.set(key, { title: key, rows: [], notes: [] });
    return tablesByTitle.get(key);
  };

  const addNote = (line) => {
    const clean = normaliseLabName(line);
    if (!clean || isBoilerplateSourceLine(clean)) return;
    const duplicate = notes.some((n) => n.text === clean && n.section === currentTitle);
    if (!duplicate) notes.push({ section: currentTitle || "Source Details", source: currentSource, text: clean });
  };

  const addRow = (row) => {
    const table = getTable(currentTitle);
    const duplicate = table.rows.some((existing) => existing.test === row.test && existing.result === row.result && existing.unit === row.unit && existing.reference_range === row.reference_range);
    if (!duplicate) table.rows.push(row);
  };

  for (let rawLine of lines) {
    let line = rawLine.replace(/\s*\|\s*/g, " | ").replace(/\s{2,}/g, " ").trim();
    if (!line) continue;
    const sourceMatch = line.match(/^SOURCE REPORT\s+\d+\s*:\s*(.+)$/i);
    if (sourceMatch) {
      currentSource = sourceMatch[1].trim();
      addNote(line);
      continue;
    }
    if (isLikelyHeading(line)) {
      currentTitle = normaliseLabName(line.replace(/[:]+$/, ""));
      getTable(currentTitle);
      continue;
    }

    const patterns = [
      /^(.{2,70}?)\s+([*<>]?\s*\d+(?:\.\d+)?)\s+([a-zA-Z%µμ\/\^0-9.-]+)?\s+([<>]?\d+(?:\.\d+)?\s*[-–]\s*[<>]?\d+(?:\.\d+)?)(?:\s|$)/,
      /^(.{2,70}?)\s+([*<>]?\s*\d+(?:\.\d+)?)\s+([a-zA-Z%µμ\/\^0-9.-]+)?\s+(<\s*\d+(?:\.\d+)?|>\s*\d+(?:\.\d+)?|>=\s*\d+(?:\.\d+)?|up\s*to\s*\d+(?:\.\d+)?|optimum\s*<\s*\d+(?:\.\d+)?)(?:\s|$)/i,
      /^(.{2,70}?)\s+([*<>]?\s*\d+(?:\.\d+)?)\s+(normal|within normal range|elevated|mildly elevated|low|high|insufficient|deficient)(?:\s|$)/i,
    ];
    let matched = null;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) { matched = match; break; }
    }

    if (matched) {
      const test = normaliseLabName(matched[1]);
      if (test && test.length >= 2 && !/^(please note|note ref|adjusting|as per|interpretation|deficient|insufficient|normal range|consider|page)$/i.test(test)) {
        const result = String(matched[2] || "").replace(/\s/g, "");
        const unit = matched[4] ? (matched[3] || "") : "";
        const reference = matched[4] || matched[3] || "";
        addRow({
          test,
          result,
          unit,
          reference_range: reference,
          flag: inferLabFlag(result, reference, line),
          source_line: line,
        });
        continue;
      }
    }

    // Keep every non-table line as a structured source note so no source detail is silently removed.
    addNote(line);
  }

  const tables = Array.from(tablesByTitle.values()).filter((table) => table.rows.length);
  return { tables, notes };
}

function parseLabTablesFromText(rawText) {
  return parseStructuredSourceReport(rawText).tables;
}

function getPrintableLabTables(report) {
  const explicit = (report?.sections || [])
    .filter((section) => section.type === "tables" && Array.isArray(section.tables))
    .flatMap((section) => section.tables || []);
  if (explicit.length) return explicit;
  return parseLabTablesFromText(findExtractedSourceText(report));
}

function getPrintableSourceNotes(report) {
  const explicit = (report?.sections || [])
    .filter((section) => section.type === "source_notes" && Array.isArray(section.notes))
    .flatMap((section) => section.notes || []);
  if (explicit.length) return explicit;
  return parseStructuredSourceReport(findExtractedSourceText(report)).notes;
}

function splitNotesForPrint(notes, notesPerPage = 28) {
  const pages = [];
  const list = Array.isArray(notes) ? notes : [];
  for (let i = 0; i < list.length; i += notesPerPage) pages.push(list.slice(i, i + notesPerPage));
  return pages;
}

function splitTablesForPrint(tables, rowsPerPage = 22) {
  const pages = [];
  for (const table of tables || []) {
    const rows = Array.isArray(table.rows) ? table.rows : [];
    for (let i = 0; i < rows.length; i += rowsPerPage) {
      pages.push({ ...table, rows: rows.slice(i, i + rowsPerPage), part: Math.floor(i / rowsPerPage) + 1, totalParts: Math.ceil(rows.length / rowsPerPage) });
    }
  }
  return pages;
}

function tableToHtml(table, esc) {
  const rows = Array.isArray(table.rows) ? table.rows : [];
  return `<div class="print-table-wrap">
    <h3>${esc(table.title || "Laboratory Results")}${table.totalParts > 1 ? ` <span>Part ${table.part} of ${table.totalParts}</span>` : ""}</h3>
    <table class="print-lab-table">
      <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Status</th></tr></thead>
      <tbody>${rows.map((row) => `<tr class="${row.flag ? "abnormal-row" : ""}"><td>${esc(row.test || row.name || "")}</td><td>${esc(row.result || row.value || "")}</td><td>${esc(row.unit || "")}</td><td>${esc(row.reference_range || row.range || "")}</td><td>${row.flag ? "Review" : "Normal"}</td></tr>`).join("")}</tbody>
    </table>
  </div>`;
}

async function ensurePdfDownloadLibraries() {
  if (window.html2pdf) return window.html2pdf;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-medireport-html2pdf="true"]');
    if (existing) {
      if (window.html2pdf) return resolve();
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.dataset.medireportHtml2pdf = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("PDF generator library could not be loaded."));
    document.head.appendChild(script);
  });
  if (!window.html2pdf) throw new Error("PDF generator library is unavailable.");
  return window.html2pdf;
}

async function downloadReportPdf(filename, html) {
  const html2pdf = await ensurePdfDownloadLibraries();

  const wrapper = document.createElement("div");
  wrapper.className = "pdf-export-root";
  wrapper.innerHTML = html;
  wrapper.style.position = "fixed";
  wrapper.style.left = "0";
  wrapper.style.top = "0";
  wrapper.style.width = "210mm";
  wrapper.style.background = "#ffffff";
  wrapper.style.opacity = "1";
  wrapper.style.zIndex = "2147483647";
  wrapper.style.pointerEvents = "none";
  wrapper.style.visibility = "visible";
  document.body.appendChild(wrapper);

  try {
    const doc = wrapper.querySelector(".luxury-print-document") || wrapper;
    const sheets = Array.from(wrapper.querySelectorAll(".luxury-sheet"));
    if (!sheets.length) throw new Error("No printable report pages were found.");
    sheets.forEach((sheet) => {
      sheet.style.width = "210mm";
      sheet.style.height = "297mm";
      sheet.style.minHeight = "297mm";
      sheet.style.maxHeight = "297mm";
      sheet.style.margin = "0";
      sheet.style.boxShadow = "none";
      sheet.style.background = "#fffdf7";
      sheet.style.overflow = "hidden";
    });

    await waitForImagesToLoad(wrapper);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const options = {
      margin: 0,
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#fffdf7",
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.max(doc.scrollWidth, 794),
        windowHeight: Math.max(doc.scrollHeight, 1123),
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
      pagebreak: { mode: ["css", "legacy"], before: ".luxury-sheet" },
    };

    await html2pdf().set(options).from(doc).save();
  } finally {
    wrapper.remove();
  }
}



function patientFigureHtml(isFemale) {
  if (isFemale) {
    return `<svg class="cover-human-svg" viewBox="0 0 120 245" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="female patient icon">
      <circle cx="60" cy="34" r="20" fill="#d6a13a"/>
      <path d="M37 74 C43 58 77 58 83 74 L96 145 C98 154 86 158 83 148 L76 108 L72 154 L84 154 L72 212 L63 212 L60 158 L57 212 L48 212 L36 154 L48 154 L44 108 L37 148 C34 158 22 154 24 145 Z" fill="#d6a13a"/>
      <path d="M49 213 L37 229" stroke="#d6a13a" stroke-width="8" stroke-linecap="round"/>
      <path d="M71 213 L83 229" stroke="#d6a13a" stroke-width="8" stroke-linecap="round"/>
    </svg>`;
  }
  return `<svg class="cover-human-svg" viewBox="0 0 120 245" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="male patient icon">
    <circle cx="60" cy="34" r="20" fill="#d6a13a"/>
    <path d="M41 72 C45 60 75 60 79 72 L86 151 C87 161 74 163 73 153 L70 102 L68 213 L58 213 L56 102 L53 213 L43 213 L50 102 L47 153 C46 163 33 161 34 151 Z" fill="#d6a13a"/>
    <path d="M49 214 L38 230" stroke="#d6a13a" stroke-width="8" stroke-linecap="round"/>
    <path d="M70 214 L82 230" stroke="#d6a13a" stroke-width="8" stroke-linecap="round"/>
  </svg>`;
}

function CoverPatientFigure({ isFemale }) {
  return <span dangerouslySetInnerHTML={{ __html: patientFigureHtml(isFemale) }} />;
}

function LiveStructuredTablesSection({ section }) {
  const tables = Array.isArray(section?.tables) ? section.tables : [];
  return (
    <section className="live-section-block live-structured-block">
      <div className="section-drag-tools no-print"><Icon name="grip" size={18} /></div>
      <h3>{section?.title || "Structured Medical Report Tables"}</h3>
      {tables.length ? tables.map((table, tableIndex) => (
        <div className="live-table-wrap" key={`${table.title || 'table'}-${tableIndex}`}>
          <h4>{table.title || "Laboratory Results"}</h4>
          <table className="live-lab-table">
            <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Status</th></tr></thead>
            <tbody>{(table.rows || []).map((row, rowIndex) => <tr className={row.flag ? "abnormal-row" : ""} key={`${row.test || row.name}-${rowIndex}`}><td>{row.test || row.name}</td><td>{row.result || row.value}</td><td>{row.unit}</td><td>{row.reference_range || row.range}</td><td>{row.flag ? "Review" : "Normal"}</td></tr>)}</tbody>
          </table>
        </div>
      )) : <p className="muted">No structured table data yet.</p>}
    </section>
  );
}

function groupSourceNotes(notes = []) {
  const groups = [];
  const seen = new Map();
  for (const note of notes || []) {
    const section = note.section || "Source Detail";
    if (!seen.has(section)) {
      seen.set(section, { section, items: [] });
      groups.push(seen.get(section));
    }
    const text = String(note.text || "").trim();
    if (text && !seen.get(section).items.includes(text)) seen.get(section).items.push(text);
  }
  return groups;
}

function LiveSourceNotesSection({ section }) {
  const groups = groupSourceNotes(Array.isArray(section?.notes) ? section.notes : []);
  return (
    <section className="live-section-block live-source-notes-block">
      <div className="section-drag-tools no-print"><Icon name="grip" size={18} /></div>
      <h3>{section?.title || "Source Report Details"}</h3>
      <div className="live-source-note-list grouped">
        {groups.length ? groups.map((group, index) => (
          <div key={`${group.section}-${index}`} className="source-detail-group">
            <span>{group.section || "Source Detail"}</span>
            <ul>{group.items.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul>
          </div>
        )) : <p className="muted">No source details extracted yet.</p>}
      </div>
    </section>
  );
}

async function waitForImagesToLoad(root) {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 2500);
    });
  }));
}

function chunkArray(list, size) {
  const chunks = [];
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function reportToHtml(report) {
  const patient = report.patient || {};
  const sections = report.sections || [];
  const sectionImages = sections.flatMap((sec) => Array.isArray(sec.images) ? sec.images : []);
  const images = [...(report.images || []), ...sectionImages]
    .filter(Boolean)
    .map((img) => ({ ...img, url: imageUrl(img) }))
    .filter((img, index, arr) => img.url && arr.findIndex((x) => x.url === img.url) === index);
  const sourcePages = (report.source_pages || [])
    .filter(Boolean)
    .map((img) => ({ ...img, url: imageUrl(img) }))
    .filter((img) => img.url);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const isFemale = isPatientFemale(patient);
  const reportLabel = isFemale ? "Women’s Health Medical Report" : "Men’s Health Medical Report";
  const patientInfo = [
    ["Patient", patient.full_name || "Not specified"],
    ["Date of Birth", patient.date_of_birth || "Not specified"],
    ["Age / Gender", `${patient.age || ""}${patient.gender ? " / " + normaliseGender(patient.gender) : ""}` || "Not specified"],
    ["Reference / ID", patient.patient_reference || patient.reference || "Not specified"],
    ["Report Date", new Date().toLocaleDateString()],
    ["Clinical Indication", report.clinical_indication || "Check-up"],
  ];
  const labTablePages = splitTablesForPrint(getPrintableLabTables(report), 22);
  const notePages = splitNotesForPrint(getPrintableSourceNotes(report), 24);
  const contentSections = sections.filter((sec) => {
    const id = String(sec.id || "").toLowerCase();
    const type = String(sec.type || "").toLowerCase();
    const title = String(sec.title || "").toLowerCase();
    return !id.includes("source-lab") && !id.includes("source-detail") && !title.includes("extracted source") && type !== "tables" && type !== "source_notes" && type !== "images";
  });
  const paragraphHtml = (text) => {
    const blocks = reportTextBlocks(text);
    return blocks.length ? blocks.map((b) => `<p>${esc(b)}</p>`).join("") : `<p class="muted-print">No content added.</p>`;
  };
  const notesHtml = (notes) => `<div class="source-note-list grouped">${groupSourceNotes(notes).map((group) => `<div><span>${esc(group.section || "Source Detail")}</span><ul>${group.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`).join("")}</div>`;
  const imagePages = images.length ? chunkArray(images, 2).map((group, pageIndex) => `<section class="luxury-sheet media-sheet"><div class="sheet-heading"><span>IMG${pageIndex + 1}</span><h2>Extracted Source Images</h2></div><div class="print-image-grid">${group.map((img, imgIndex) => `<figure><img src="${esc(img.url)}" alt="${esc(img.filename || "Extracted source image")}"><figcaption>${esc(img.filename || `Extracted image ${pageIndex * 2 + imgIndex + 1}`)}</figcaption></figure>`).join("")}</div></section>`).join("") : "";
  const sourceAppendix = "";

  return `<main class="luxury-print-document">
    <section class="luxury-sheet cover-sheet medical-cover-sheet">
      <div class="cover-logo-slot"><img class="clinic-logo-img" src="${clinicLogo}" alt="Nuvia Health London LTD logo"><div><strong>Nuvia Health London LTD</strong><span>Clinical report workspace</span></div></div>
      <div class="cover-title-block"><h1>${esc(reportLabel)}</h1><p>Comprehensive overview of uploaded clinical source reports</p></div>
      <div class="cover-patient-card"><div class="patient-figure" aria-hidden="true">${patientFigureHtml(isFemale)}</div><div class="patient-lines">${patientInfo.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div></div>
      <div class="cover-footer-strip"><span>Generated by MediReport Pro</span><span>Reviewed by responsible clinician before final use</span></div>
    </section>

    ${labTablePages.map((table, index) => `<section class="luxury-sheet lab-results-sheet"><div class="sheet-heading"><span>${String(index + 1).padStart(2, "0")}</span><h2>${esc(table.title || "Laboratory Results")}</h2></div>${tableToHtml(table, esc)}</section>`).join("")}

    ${notePages.map((notes, index) => `<section class="luxury-sheet source-notes-sheet"><div class="sheet-heading"><span>N${index + 1}</span><h2>Source Report Details</h2></div>${notesHtml(notes)}</section>`).join("")}

    ${contentSections.length ? `<section class="luxury-sheet clinical-summary-sheet"><div class="sheet-heading"><span>CL</span><h2>Clinical Notes</h2></div><div class="section-grid">${contentSections.map((sec, i) => `<article class="print-section"><h3>${esc(sec.title || `Section ${i + 1}`)}</h3>${paragraphHtml(sec.content)}</article>`).join("")}</div></section>` : ""}

    ${report.doctor_opinion ? `<section class="luxury-sheet"><div class="sheet-heading"><span>DR</span><h2>Doctor Opinion</h2></div><article class="doctor-opinion-block">${paragraphHtml(report.doctor_opinion)}</article></section>` : ""}

    ${imagePages}
    ${sourceAppendix}

    <section class="luxury-sheet final-sheet"><div class="sheet-heading"><span>END</span><h2>Approval</h2></div><article class="print-section">${paragraphHtml(report.limitations || "This report should be reviewed, edited and approved by a qualified clinician before final use.")}</article><div class="signature-row"><div><span>Authorised by</span><strong>Responsible Clinician</strong></div><div class="signature-line"></div></div></section>
  </main>`;
}

function PrintLuxuryReport({ report, media = [], sourcePages = [] }) {
  const patient = report.patient || {};
  const sections = report.sections || [];
  const isFemale = isPatientFemale(patient);
  const reportLabel = isFemale ? "Women’s Health Medical Report" : "Men’s Health Medical Report";
  const imageItems = [...media.map((m) => ({ url: m.url, filename: m.name })), ...(report.images || [])]
    .filter((img, index, arr) => img?.url && arr.findIndex((x) => x.url === img.url) === index);
  const labTablePages = splitTablesForPrint(getPrintableLabTables(report), 22);
  const notePages = splitNotesForPrint(getPrintableSourceNotes(report), 24);
  const contentSections = sections.filter((sec) => {
    const id = String(sec.id || "").toLowerCase();
    const type = String(sec.type || "").toLowerCase();
    const title = String(sec.title || "").toLowerCase();
    return !id.includes("source-lab") && !id.includes("source-detail") && !title.includes("extracted source") && type !== "tables" && type !== "source_notes" && type !== "images";
  });
  const patientInfo = [
    ["Patient", patient.full_name || "Not specified"],
    ["Date of Birth", patient.date_of_birth || "Not specified"],
    ["Age / Gender", `${patient.age || ""}${patient.gender ? " / " + normaliseGender(patient.gender) : ""}` || "Not specified"],
    ["Reference / ID", patient.patient_reference || patient.reference || "Not specified"],
    ["Report Date", new Date().toLocaleDateString()],
    ["Clinical Indication", report.clinical_indication || "Check-up"],
  ];
  const renderText = (text) => {
    const blocks = reportTextBlocks(text);
    return blocks.length ? blocks.map((b, i) => <p key={i}>{b}</p>) : <p className="muted-print">No content added.</p>;
  };
  const renderLabTable = (table, index) => (
    <section className="luxury-sheet lab-results-sheet" key={`lab-${index}`}>
      <div className="sheet-heading"><span>{String(index + 1).padStart(2, "0")}</span><h2>{table.title || "Laboratory Results"}</h2></div>
      <div className="print-table-wrap"><h3>{table.title || "Laboratory Results"}{table.totalParts > 1 ? <span> Part {table.part} of {table.totalParts}</span> : null}</h3><table className="print-lab-table"><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Status</th></tr></thead><tbody>{(table.rows || []).map((row, rowIndex) => <tr className={row.flag ? "abnormal-row" : ""} key={`${row.test}-${rowIndex}`}><td>{row.test || row.name}</td><td>{row.result || row.value}</td><td>{row.unit}</td><td>{row.reference_range || row.range}</td><td>{row.flag ? "Review" : "Normal"}</td></tr>)}</tbody></table></div>
    </section>
  );

  return (
    <main className="luxury-print-document print-only">
      <section className="luxury-sheet cover-sheet medical-cover-sheet">
        <div className="cover-logo-slot"><img className="clinic-logo-img" src={clinicLogo} alt="Nuvia Health London LTD logo" /><div><strong>Nuvia Health London LTD</strong><span>Clinical report workspace</span></div></div>
        <div className="cover-title-block"><h1>{reportLabel}</h1><p>Comprehensive overview of uploaded clinical source reports</p></div>
        <div className="cover-patient-card"><div className="patient-figure" aria-hidden="true"><CoverPatientFigure isFemale={isFemale} /></div><div className="patient-lines">{patientInfo.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div>
        <div className="cover-footer-strip"><span>Generated by MediReport Pro</span><span>Reviewed by responsible clinician before final use</span></div>
      </section>

      {labTablePages.map(renderLabTable)}

      {notePages.map((notes, index) => <section className="luxury-sheet source-notes-sheet" key={`notes-${index}`}><div className="sheet-heading"><span>{`N${index + 1}`}</span><h2>Source Report Details</h2></div><div className="source-note-list grouped">{groupSourceNotes(notes).map((group, groupIndex) => <div className="source-detail-group" key={`${group.section}-${groupIndex}`}><span>{group.section || "Source Detail"}</span><ul>{group.items.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul></div>)}</div></section>)}

      {contentSections.length ? <section className="luxury-sheet clinical-summary-sheet"><div className="sheet-heading"><span>CL</span><h2>Clinical Notes</h2></div><div className="section-grid">{contentSections.map((sec, i) => <article className="print-section" key={sec.id || i}><h3>{sec.title || `Section ${i + 1}`}</h3>{renderText(sec.content)}</article>)}</div></section> : null}

      {report.doctor_opinion ? <section className="luxury-sheet"><div className="sheet-heading"><span>DR</span><h2>Doctor Opinion</h2></div><article className="doctor-opinion-block">{renderText(report.doctor_opinion)}</article></section> : null}

      {chunkArray(imageItems, 2).map((group, pageIndex) => <section className="luxury-sheet media-sheet" key={`media-${pageIndex}`}><div className="sheet-heading"><span>{`IMG${pageIndex + 1}`}</span><h2>Extracted Source Images</h2></div><div className="print-image-grid">{group.map((img, i) => <figure key={img.url || `${pageIndex}-${i}`}><img src={img.url} alt={img.filename || "Extracted source image"} /><figcaption>{img.filename || `Extracted image ${pageIndex * 2 + i + 1}`}</figcaption></figure>)}</div></section>)}

      {/* Original full PDF pages are not printed as separate pages; separated diagnostic images are used instead. */}

      <section className="luxury-sheet final-sheet"><div className="sheet-heading"><span>END</span><h2>Approval</h2></div><article className="print-section">{renderText(report.limitations || "This report should be reviewed, edited and approved by a qualified clinician before final use.")}</article><div className="signature-row"><div><span>Authorised by</span><strong>Responsible Clinician</strong></div><div className="signature-line" /></div></section>
    </main>
  );
}

function Logo() {
  return (
    <div className="logo-wrap site-logo-wrap">
      <img className="site-logo-img" src={clinicLogo} alt="Nuvia Health London LTD logo" />
      <div>
        <strong>Nuvia Health</strong>
        <span>Clinical report workspace</span>
      </div>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">§</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const paths = {
    dashboard: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h5v-6h4v6h5v-9.5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    patient: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1.2c0-3.5 3.1-6.3 7-6.3s7 2.8 7 6.3V21"/><circle cx="12" cy="12" r="9"/></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></>,
    id: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12" r="2"/><path d="M12 10h5"/><path d="M12 14h5"/><path d="M6.4 16.5c.5-1 1.2-1.5 2.1-1.5s1.6.5 2.1 1.5"/></>,
    clinical: <><path d="M9 4h6"/><path d="M10 2h4v4h-4z"/><rect x="5" y="5" width="14" height="17" rx="2"/><path d="M8 12h8"/><path d="M8 16h6"/><path d="M12 9v6"/><path d="M9 12h6"/></>,
    report: <><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5"/><path d="M10 13h6"/><path d="M10 17h4"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/></>,
    template: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h4"/></>,
    account: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.36.2.62.52.76.9.11.28.38.48.68.48H21a2 2 0 1 1 0 4h-.08c-.65 0-1.23.36-1.52.94Z"/></>,
    help: <><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.5 1.7c-.8 1.1-2.1 1.3-2.1 3"/><path d="M12 17h.01"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></>,
    spark: <><path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6Z"/><path d="m19 15 .8 2.7 2.7.8-2.7.8L19 22l-.8-2.7-2.7-.8 2.7-.8Z"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    menu: <><path d="M12 5h.01"/><path d="M12 12h.01"/><path d="M12 19h.01"/></>,
    grip: <><path d="M9 5h.01"/><path d="M9 12h.01"/><path d="M9 19h.01"/><path d="M15 5h.01"/><path d="M15 12h.01"/><path d="M15 19h.01"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    image: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    refresh: <><path d="M21 12a9 9 0 0 1-15.5 6.36"/><path d="M3 12A9 9 0 0 1 18.5 5.64"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    list: <><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></>,
    alert: <><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 14 3-3 3 2 5-6"/></>,
    adminShield: <><path d="M12 3 5.5 6v5.5c0 4.3 2.8 8.2 6.5 9.5 3.7-1.3 6.5-5.2 6.5-9.5V6L12 3Z"/><circle cx="12" cy="10" r="2.2"/><path d="M8.9 16c.8-1.7 2-2.5 3.1-2.5s2.3.8 3.1 2.5"/></>,
    stethoscope: <><path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M8 3v4"/><path d="M14 3v4"/><path d="M14 8a4 4 0 0 0 4 4h1"/><circle cx="19" cy="13" r="2"/></>,
    userPlus: <><circle cx="10" cy="8" r="3.2"/><path d="M4.5 19c.8-2.9 3-4.6 5.5-4.6s4.7 1.7 5.5 4.6"/><path d="M18 8v6"/><path d="M15 11h6"/></>,
  };
  return <svg {...common}>{paths[name] || paths.report}</svg>;
}

function DoctorSidebar({ user, screen, setScreen, onLogout }) {
  const active = screen.startsWith("report-builder:") ? "report-builder" : screen;
  const [localProfile, setLocalProfile] = useState(() => getLocalProfile());

  useEffect(() => {
    const update = () => setLocalProfile(getLocalProfile());
    window.addEventListener("medireport-profile-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("medireport-profile-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const displayName = localProfile.full_name || user.full_name || "Doctor";
  const displayEmail = localProfile.email || user.email;
  const sidebarInitials = (displayName || displayEmail || "DR")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="sidebar doctor-sidebar">
      <Logo />
      <div className="doctor-profile-card sidebar-profile-no-arrow">
        <div className="doctor-avatar sidebar-avatar-image">
          {localProfile.avatar ? <img src={localProfile.avatar} alt="Doctor profile" /> : sidebarInitials || "DR"}
        </div>
        <div>
          <strong>{displayName}</strong>
          <span>{displayEmail}</span>
        </div>
      </div>

      <nav className="nav-list icon-nav">
        <button className={active === "dashboard" ? "active" : ""} onClick={() => setScreen("dashboard")}><Icon name="dashboard" />Dashboard</button>
        <button className={active === "cases" ? "active" : ""} onClick={() => setScreen("cases")}><Icon name="users" />Patient Cases</button>
        <button className={active === "report-builder" ? "active" : ""} onClick={() => setScreen("report-builder")}><Icon name="report" />Report Builder</button>
        <button className={active === "uploads" ? "active" : ""} onClick={() => setScreen("uploads")}><Icon name="upload" />Uploads</button>
        <button className={active === "templates" ? "active" : ""} onClick={() => setScreen("templates")}><Icon name="template" />Templates</button>
        {user.role === "admin" && <button className={active === "admin" ? "active" : ""} onClick={() => setScreen("admin")}><Icon name="account" />Admin Control</button>}
        <button className={active === "account" ? "active" : ""} onClick={() => setScreen("account")}><Icon name="account" />Account</button>
      </nav>

      <div className="sidebar-spacer" />
      <button className="sidebar-help" type="button"><Icon name="help" /> Help & Support <span>›</span></button>
      <button className="btn dark full" onClick={onLogout}>Logout</button>
    </aside>
  );
}

function App() {
  const [health, setHealth] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreenState] = useState("landing");
  const [loginRole, setLoginRole] = useState("admin");
  const [toast, setToast] = useState(null);

  function notify(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4600);
  }

  function setScreen(nextScreen, options = {}) {
    if (!nextScreen || typeof nextScreen !== "string") return;
    setScreenState(nextScreen);
    if (typeof window !== "undefined") {
      const state = { medireportScreen: nextScreen };
      if (options.replace) {
        window.history.replaceState(state, "", window.location.href);
      } else {
        window.history.pushState(state, "", window.location.href);
      }
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.history.state?.medireportScreen) {
      window.history.replaceState({ medireportScreen: screen }, "", window.location.href);
    }
    const handlePopState = (event) => {
      const next = event.state?.medireportScreen;
      if (next) {
        setScreenState(next);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function loadHealth() {
    try {
      const res = await fetch(`${API_BASE()}/health?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      setHealth({ ...data, api_base_url: API_BASE() });
    } catch {
      setHealth(null);
    } finally {
      if (typeof setBooting === "function") setBooting(false);
    }
  }

  async function restoreSession() {
    const token = getStoredToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    try {
      const user = await apiRequest("/api/auth/me");
      setAuthUser(user);
      setScreen("dashboard", { replace: true });
    } catch {
      setStoredToken("");
      setAuthUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    restoreSession();
  }, []);

  function logout() {
    setStoredToken("");
    setAuthUser(null);
    setScreen("landing", { replace: true });
  }

  if (authLoading) {
    return <main className="splash"><div className="brand-card"><Logo /><p>Checking secure session...</p></div></main>;
  }

  return (
    <main className="app-shell">
      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}

      {screen === "landing" && (
        <Landing
          health={health}
          onLogin={(role) => {
            setLoginRole(role);
            setScreen("login");
          }}
          onDoctorRegister={() => setScreen("doctor-register")}
          onRecheck={loadHealth}
        />
      )}

      {screen === "login" && (
        <LoginScreen
          role={loginRole}
          onBack={() => setScreen("landing")}
          onLoggedIn={(user, token) => {
            setStoredToken(token);
            setAuthUser(user);
            setScreen("dashboard", { replace: true });
            notify(`Signed in as ${user.full_name}.`);
          }}
        />
      )}

      {screen === "doctor-register" && (
        <DoctorRegistrationScreen
          onBack={() => setScreen("landing")}
          notify={notify}
        />
      )}

      {authUser && screen !== "landing" && screen !== "login" && screen !== "doctor-register" && (
        <Workspace
          user={authUser}
          screen={screen}
          setScreen={setScreen}
          onLogout={logout}
          notify={notify}
        />
      )}
    </main>
  );
}

function Landing({ health, onLogin, onDoctorRegister, onRecheck }) {
  const apiReady = health?.status === "healthy" || health?.status === "ok";

  return (
    <section className="landing simple-login-page" aria-label="Nuvia Health landing page">
      <div className="simple-login-bg simple-login-bg-left" aria-hidden="true"></div>
      <div className="simple-login-bg simple-login-bg-right" aria-hidden="true"></div>
      <div className="simple-login-arc simple-login-arc-one" aria-hidden="true"></div>
      <div className="simple-login-arc simple-login-arc-two" aria-hidden="true"></div>

      <div className="simple-login-shell">
        <header className="simple-login-topbar">
          <Logo />
          <button
            className={`simple-login-status ${apiReady ? "online" : "offline"}`}
            type="button"
            onClick={onRecheck}
            title="Recheck backend status"
          >
            <span className="simple-login-status-dot" aria-hidden="true"></span>
            {apiReady ? "Online" : "Offline"}
          </button>
        </header>

        <div className="simple-login-hero">
          <p className="eyebrow simple-login-eyebrow">Secure medical report system</p>
          <h1>Medical report management, refined.</h1>
          <p className="lead simple-login-lead">
            Create cases, merge laboratory reports, preserve source images,
            and build editable final medical reports under admin control.
          </p>
        </div>

        <div className="simple-login-actions" aria-label="Login options">
          <button className="simple-login-card simple-login-card-admin" onClick={() => onLogin("admin")} type="button">
            <span className="simple-login-card-icon dark" aria-hidden="true"><Icon name="adminShield" size={28} /></span>
            <strong>Admin Login</strong>
            <small>Control doctors, users and system access</small>
            <span className="simple-login-arrow" aria-hidden="true">→</span>
          </button>

          <button className="simple-login-card simple-login-card-doctor" onClick={() => onLogin("doctor")} type="button">
            <span className="simple-login-card-icon gold" aria-hidden="true"><Icon name="stethoscope" size={28} /></span>
            <strong>Doctor Login</strong>
            <small>Manage cases and build medical reports</small>
            <span className="simple-login-arrow" aria-hidden="true">→</span>
          </button>

          <button className="simple-login-card simple-login-card-register" onClick={onDoctorRegister} type="button">
            <span className="simple-login-card-icon light" aria-hidden="true"><Icon name="userPlus" size={28} /></span>
            <strong>Register as Doctor</strong>
            <small>Create a doctor account for admin approval</small>
            <span className="simple-login-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function LoginScreen({ role, onBack, onLoggedIn }) {
  const [email, setEmail] = useState(role === "admin" ? "admin@example.com" : "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const body = new URLSearchParams();
      body.append("username", email.trim().toLowerCase());
      body.append("password", password);

      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (role !== "patient" && data.user.role !== role) {
        throw new Error(`This account is registered as ${data.user.role}, not ${role}.`);
      }

      onLoggedIn(data.user, data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-card">
        <Logo />
        <p className="eyebrow">{role} portal</p>
        <h1>Secure login</h1>
        <p className="muted">Use your approved account credentials.</p>

        <form className="form-grid" onSubmit={submit}>
          <Field label="Email address">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </Field>
          <Field label="Password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </Field>
          {error ? <div className="error-box">{error}</div> : null}
          <div className="row-actions">
            <button type="button" className="btn outline" onClick={onBack}>Back</button>
            <button className="btn gold" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function DoctorRegistrationScreen({ onBack, notify }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    licence_number: "",
    specialty: "",
    workplace: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      try {
        await apiRequest("/api/doctor-registrations", {
          method: "POST",
          body: JSON.stringify(form),
        });
      } catch (legacyErr) {
        await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({ ...form, role: "doctor" }),
        });
      }
      notify("Doctor registration submitted. Admin approval is required.");
      onBack();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-card wide">
        <Logo />
        <p className="eyebrow">Doctor registration</p>
        <h1>Request doctor portal access</h1>
        <form className="form-grid compact" onSubmit={submit}>
          <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Password"><input type="password" value={form.password} minLength={8} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
          <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Licence / GMC number"><input value={form.licence_number} onChange={(e) => setForm({ ...form, licence_number: e.target.value })} /></Field>
          <Field label="Specialty"><input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></Field>
          <Field label="Workplace"><input value={form.workplace} onChange={(e) => setForm({ ...form, workplace: e.target.value })} /></Field>
          <Field label="Message"><textarea rows="4" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <div className="row-actions span-two">
            <button type="button" className="btn outline" onClick={onBack}>Back</button>
            <button className="btn gold" disabled={busy}>{busy ? "Submitting..." : "Submit Registration"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}



function UploadPanel({ token, patient, report, setReport, refreshPatient }) {
  const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const upload = async () => {
    if (!patient || files.length === 0) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData(); [...files].forEach(f => fd.append("files", f)); if (report?.id) fd.append("report_id", report.id); fd.append("use_vision", "false");
      const data = await api(`/api/reports/patients/${patient.id}/upload-pdfs`, { method:"POST", body: fd }, token);
      setReport(data.report); refreshPatient(patient.id); setFiles([]);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const removeSource = async (sourceId) => {
    if (!report?.id || !window.confirm("Remove this uploaded PDF and rebuild the report from the remaining files?")) return;
    setBusy(true); setError("");
    try {
      const data = await api(`/api/reports/${report.id}/source-files/${sourceId}`, { method:"DELETE" }, token);
      setReport(data.report); if (patient?.id) refreshPatient(patient.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const exportTablesCsv = async () => {
    if (!report?.id) return;
    setError("");
    try {
      const res = await fetch(`${API}/api/reports/${report.id}/tables.csv`, { headers: authHeaders(token) });
      if (!res.ok) throw new Error("Could not export extracted tables");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `report_${report.id}_tables.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  };
  return <div className="left-flow">
    <div className="step"><b>1</b><div><h3>Upload Source Reports</h3><p>Files are stored separately under this patient and this output report.</p></div></div>
    <label className="drop"><input type="file" multiple accept="application/pdf" onChange={e=>setFiles(e.target.files)} /><Icon name="upload"/><b>Drag & drop files here</b><span>{files.length ? `${files.length} file(s) selected` : 'Supports PDF'}</span></label>
    {error && <div className="error">{error}</div>}
    <button className="full" disabled={busy || !files.length} onClick={upload}>{busy ? "Processing..." : "Add to Upload Manager"}</button>
    <div className="small-list"><h4>Source files</h4>{(report?.source_files||[]).map(s => <div className="mini source-mini" key={s.id}><Icon name="file"/><span>{s.original_filename}<small>{s.page_count} pages • {Math.round((s.file_size||0)/1024)} KB{s.table_count ? ` • ${s.table_count} table(s)` : ''}{s.extraction_type ? ` • ${s.extraction_type}` : ''}</small></span><button className="mini-remove" disabled={busy} onClick={()=>removeSource(s.id)} title="Remove uploaded PDF"><Icon name="trash"/></button></div>)}</div>
    {report?.id && <button className="ghost full" onClick={exportTablesCsv} disabled={!report?.table_count}>Export Tables CSV</button>}
    <div className="step"><b>2</b><div><h3>AI Structuring</h3><p>Enrich image metadata and rebuild sections.</p></div></div>
  </div>
}

function legacyNormaliseGender(value) {
  const g = String(value || "").trim().toLowerCase();
  if (["f", "female", "woman", "women"].includes(g)) return "female";
  if (["m", "male", "man", "men"].includes(g)) return "male";
  return "neutral";
}

function HumanPlaceholder({ gender }) {
  const g = legacyNormaliseGender(gender);
  const selectedIcon = g === "female" ? femaleGenderIcon : maleGenderIcon;
  const label = g === "female" ? "Female patient figure" : "Male patient figure";

  return (
    <div
      className={`human-placeholder abstract ${g}`}
      aria-label={label}
      data-placeholder="gender-figure-from-patient-database"
    >
      <img
        src={selectedIcon}
        alt={label}
        className="gender-figure-svg"
        draggable="false"
      />
    </div>
  );
}


function ExamIcon({ type }) {
  const t = String(type || "").toLowerCase();
  let shape = "lab";
  if (t.includes("carotid") || t.includes("doppler")) shape = "vessel";
  else if (t.includes("thyroid")) shape = "thyroid";
  else if (t.includes("abdom") || t.includes("liver")) shape = "abdomen";
  else if (t.includes("kub") || t.includes("kidney") || t.includes("renal")) shape = "kidney";
  else if (t.includes("testes") || t.includes("testis") || t.includes("scrot")) shape = "testes";
  else if (t.includes("haemat") || t.includes("hemat")) shape = "blood";
  else if (t.includes("bio") || t.includes("lab") || t.includes("endo")) shape = "lab";
  return <span className="exam-icon" aria-hidden="true"><svg viewBox="0 0 64 64">
    {shape === "vessel" && <><path d="M10 42 C22 30 36 32 54 18"/><path d="M14 46 C27 37 39 39 56 27"/><path d="M28 34 C31 42 36 48 44 52"/></>}
    {shape === "thyroid" && <><path d="M24 17 C13 20 12 43 27 47 C31 37 31 27 24 17Z"/><path d="M40 17 C51 20 52 43 37 47 C33 37 33 27 40 17Z"/><path d="M32 24 L32 44"/></>}
    {shape === "abdomen" && <><path d="M16 38 C22 12 56 16 52 36 C49 53 26 52 16 38Z"/><path d="M23 38 C30 34 38 35 45 41"/></>}
    {shape === "kidney" && <><path d="M23 16 C9 20 11 48 25 47 C38 46 35 19 23 16Z"/><path d="M41 16 C55 20 53 48 39 47 C26 46 29 19 41 16Z"/><path d="M30 32 L34 32"/></>}
    {shape === "testes" && <><path d="M24 20 C13 27 13 50 27 52 C38 49 35 25 24 20Z"/><path d="M40 20 C51 27 51 50 37 52 C26 49 29 25 40 20Z"/><path d="M32 14 C32 23 32 27 32 36"/></>}
    {shape === "blood" && <><path d="M32 9 C22 22 18 29 18 39 C18 50 25 56 32 56 C39 56 46 50 46 39 C46 29 42 22 32 9Z"/><path d="M26 39 C29 43 34 45 39 41"/></>}
    {shape === "lab" && <><path d="M25 10 L39 10"/><path d="M29 10 L29 30 L17 51 C15 55 18 58 23 58 L41 58 C46 58 49 55 47 51 L35 30 L35 10"/><path d="M24 43 L40 43"/></>}
  </svg></span>
}

function getExamMeta(title, subtitle = "") {
  const raw = String(title || "").trim();
  const t = raw.toLowerCase();
  const customSubtitle = String(subtitle || "").trim();
  if (t.includes("echo") || t.includes("cardiac ultrasound")) return { title: "Echocardiography", subtitle: customSubtitle || "Cardiac ultrasound" };
  if (t.includes("lv function") || t.includes("ejection")) return { title: "LV Function", subtitle: customSubtitle || "Ejection fraction and wall motion" };
  if (t.includes("valve")) return { title: "Valves", subtitle: customSubtitle || "Mitral, aortic and tricuspid valves" };
  if (t.includes("doppler measurement") || t.includes("flow and pressure")) return { title: "Doppler Measurements", subtitle: customSubtitle || "Flow and pressure measurements" };
  if (t.includes("cardiac image")) return { title: "Cardiac Images", subtitle: customSubtitle || "Source echo images" };
  if (t.includes("carotid") || t.includes("doppler")) return { title: "Carotid Doppler Scan", subtitle: customSubtitle || "Doppler ultrasound" };
  if (t.includes("thyroid")) return { title: "Thyroid Scan", subtitle: customSubtitle || "Ultrasound" };
  if (t.includes("abdom")) return { title: "Abdominal Scan", subtitle: customSubtitle || "Ultrasound" };
  if (t.includes("kub") || t.includes("kidney")) return { title: "KUB Scan", subtitle: customSubtitle || "Kidney, ureter and bladder" };
  if (t.includes("testes") || t.includes("testis")) return { title: "Testes Scan", subtitle: customSubtitle || "Testicular ultrasound" };
  if (t.includes("haemat") || t.includes("hemat")) return { title: "Haematology", subtitle: customSubtitle || "Laboratory results" };
  if (t.includes("bio")) return { title: "Biochemistry", subtitle: customSubtitle || "Laboratory results" };
  if (t.includes("endo")) return { title: "Endocrinology", subtitle: customSubtitle || "Laboratory results" };
  if (t.includes("lab") || t.includes("blood")) return { title: "Laboratory Results", subtitle: customSubtitle || "Pathology" };
  return { title: raw || "Examination", subtitle: customSubtitle || "Clinical section" };
}

function buildExamList(sections, tables, detectedExams = []) {
  const map = new Map();
  const pushMeta = (item) => {
    const meta = getExamMeta(item?.title || item?.section_title, item?.subtitle);
    const key = meta.title.toLowerCase();
    if (!map.has(key)) map.set(key, meta);
  };
  (detectedExams || []).forEach(pushMeta);
  [...(sections || []), ...(tables || []).map(t => ({ title: t.section_title }))].forEach(pushMeta);
  return Array.from(map.values()).filter(e => !["conclusion", "recommendation", "limitations", "source report details", "echocardiography summary"].includes(e.title.toLowerCase()));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === 0) return "0";
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function editableCoverValue(obj, key, ...fallbacks) {
  if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
    const value = obj[key];
    return value === undefined || value === null ? "" : String(value);
  }
  return firstNonEmpty(...fallbacks);
}

function formatReadableDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}

function buildCoverDetails({ patient, report, editable, user }) {
  const p = editable?.patient || {};
  const reportId = firstNonEmpty(p.case_report_id, report?.case_report_id, report?.reference, report?.id ? `MRP-${String(report.id).padStart(4, "0")}` : "");
  const patientReference = firstNonEmpty(p.patient_reference, p.reference, patient?.patient_reference, patient?.reference, patient?.hospital_no, patient?.id ? `PAT-${String(patient.id).padStart(4, "0")}` : "");
  const dobOrAge = firstNonEmpty(
    p.date_of_birth,
    p.age ? `${p.age} years` : "",
    patient?.date_of_birth,
    patient?.dob,
    patient?.birth_date,
    patient?.age ? `${patient.age} years` : ""
  );
  return {
    full_name: editableCoverValue(p, "full_name", patient?.full_name, patient?.name, patient?.patient_name),
    reference: editableCoverValue(p, "patient_reference", p.reference, patientReference),
    date_of_birth: formatReadableDate(editableCoverValue(p, "date_of_birth", dobOrAge)),
    gender: editableCoverValue(p, "gender", patient?.gender, patient?.sex),
    report_date: formatReadableDate(editableCoverValue(p, "report_date", report?.report_date, report?.created_at, report?.updated_at)),
    case_report_id: reportId,
    clinical_indication: editableCoverValue(p, "clinical_indication", patient?.clinical_indication, patient?.notes, report?.clinical_indication),
    doctor: editableCoverValue(p, "doctor", report?.doctor_name, user?.full_name, user?.email)
  };
}

function ReportCoverPage({ patient, report, editable, setEditable, user }) {
  const p = editable?.patient || {};
  const update = (k, v) => setEditable({ ...editable, patient: { ...p, [k]: v } });
  const details = buildCoverDetails({ patient, report, editable, user });
  const isFemale = legacyNormaliseGender(details.gender) === "female";
  const healthTitle = isFemale ? "WOMEN’S HEALTH" : "MEN’S HEALTH";

  return <section className="cover-page nuvia-cover-page">
    <div className="cover-border nuvia-cover-border">
      <div className="nuvia-bg-arc nuvia-bg-arc-left" aria-hidden="true" />
      <div className="nuvia-bg-arc nuvia-bg-arc-right" aria-hidden="true" />
      <div className="nuvia-honeycomb top" aria-hidden="true" />
      <div className="nuvia-honeycomb bottom" aria-hidden="true" />

      <header className="nuvia-cover-header">
        <img className="nuvia-cover-logo" src={clinicLogo} alt="Nuvia Health London LTD logo" />
        <div className="nuvia-logo-divider"><span /></div>
        <h1>{healthTitle}</h1>
        <h2>ULTRASOUND REPORT</h2>
        <p><span />COMPREHENSIVE HEALTH ASSESSMENT<span /></p>
      </header>

      <section className="nuvia-patient-panel">
        <div className="nuvia-figure-side">
          <HumanPlaceholder gender={details.gender || "Male"} />
          <div className="nuvia-patient-name-card" dir="ltr" lang="en">
            <Icon name="patient" size={28} />
            <small>Patient Details</small>
            <input value={details.full_name} placeholder="Patient name" onChange={e=>update("full_name", e.target.value)} />
          </div>
          <select className="nuvia-gender-select no-print" value={details.gender || ""} onChange={e=>update("gender", e.target.value)} aria-label="Patient gender">
            <option value="">Gender</option><option value="Male">Male</option><option value="Female">Female</option>
          </select>
        </div>

        <div className="nuvia-details-side" dir="ltr" lang="en">
          <label><Icon name="calendar"/><span>Date of Birth</span><input value={details.date_of_birth} onChange={e=>update("date_of_birth", e.target.value)} placeholder="DOB or age" /></label>
          <label><Icon name="id"/><span>Reference / ID</span><input value={details.reference} placeholder="Patient reference" onChange={e=>update("patient_reference", e.target.value)} /></label>
          <label><Icon name="calendar"/><span>Report Date</span><input value={details.report_date} onChange={e=>update("report_date", e.target.value)} placeholder="Report date" /></label>
          <label><Icon name="clinical"/><span>Clinical Indication</span><input value={details.clinical_indication} placeholder="Clinical indication" onChange={e=>update("clinical_indication", e.target.value)} /></label>
        </div>
      </section>


      <footer className="nuvia-cover-footer"><div className="nuvia-shield">✚</div><p>PRECISION. CARE. CONFIDENCE.</p></footer>
    </div>
  </section>
}

function ReportExaminationsPage({ editable, report }) {
  const exams = buildExamList(
    editable?.sections || [],
    report?.extracted_tables || editable?.extracted_tables || [],
    editable?.examinations || []
  );

  if (!exams.length) return null;

  return (
    <section className="cover-page nuvia-cover-page nuvia-exams-page">
      <div className="cover-border nuvia-cover-border">
        <div className="nuvia-bg-arc nuvia-bg-arc-left" aria-hidden="true" />
        <div className="nuvia-bg-arc nuvia-bg-arc-right" aria-hidden="true" />
        <div className="nuvia-honeycomb top" aria-hidden="true" />
        <div className="nuvia-honeycomb bottom" aria-hidden="true" />

        <header className="nuvia-exams-page-header">
          <img className="nuvia-cover-logo" src={clinicLogo} alt="Nuvia Health London LTD logo" />
          <div className="nuvia-logo-divider"><span /></div>
          <h1>EXAMINATIONS INCLUDED IN THIS REPORT</h1>
          <p>Detected tests, clinical sections and investigation groups</p>
        </header>

        <section className="nuvia-cover-exams nuvia-exams-full-list">
          <div className="exam-list" data-placeholder="examinations-from-sections-and-tables">
            {exams.map((exam, idx) => (
              <div className="exam-chip" key={`${exam.title}-${idx}`}>
                <ExamIcon type={exam.title} />
                <div><b>{exam.title}</b><span>{exam.subtitle}</span></div>
              </div>
            ))}
          </div>
        </section>

        <footer className="nuvia-cover-footer"><div className="nuvia-shield">✚</div><p>PRECISION. CARE. CONFIDENCE.</p></footer>
      </div>
    </section>
  );
}


function PatientProfileCard({ patient, editable, setEditable }) {
  const p = editable.patient || {};
  const update = (k, v) => setEditable({ ...editable, patient: { ...p, [k]: v } });
  return <section className="patient-profile-card legacy-profile-card">
    <div className="patient-image-box"><Icon name="user"/><b>Patient Image</b></div>
    <div className="patient-grid">
      <label><span>Patient Name</span><input value={p.full_name || patient?.full_name || ""} onChange={e=>update("full_name", e.target.value)} /></label>
      <label><span>Date of Birth</span><input value={p.date_of_birth || patient?.date_of_birth || ""} onChange={e=>update("date_of_birth", e.target.value)} placeholder="Extracted from PDF when available" /></label>
      <label><span>Reference / ID</span><input value={p.reference || patient?.reference || ""} onChange={e=>update("reference", e.target.value)} /></label>
      <label><span>Report Date</span><input value={p.report_date || ""} onChange={e=>update("report_date", e.target.value)} placeholder="Enter report date..." /></label>
      <label className="wide"><span>Clinical Indication</span><input value={p.clinical_indication || patient?.notes || ""} onChange={e=>update("clinical_indication", e.target.value)} /></label>
    </div>
  </section>
}


function imagePlacementConfidence(img, suggestedTitle = "") {
  const suggested = String(suggestedTitle || img?.suggested_section || "").trim().toLowerCase();
  if (!suggested || ["source report details", "unknown", "unknown report"].includes(suggested)) return "low";
  const keywords = Array.isArray(img?.clinical_keywords) ? img.clinical_keywords : [];
  const keywordText = keywords.map(k => String(k || "").toLowerCase()).join(" ");
  if (keywordText.includes("fallback_page_range")) return "low";
  if (keywordText.includes("vision_confidence_high") || keywordText.includes("vision_body_label")) return "high";
  const clue = [img?.detected_heading, img?.suggested_section, img?.ocr_text, img?.page_text, img?.caption, keywordText].map(v => String(v || "").toLowerCase()).join(" ");
  const sectionKeywords = {
    "carotid doppler scan": ["carotid", "cca", "ica", "eca", "cimt", "carotid bulb"],
    "thyroid scan": ["thyroid", "isthmus", "submandibular", "parotid"],
    "abdominal scan": ["abdomen", "abdominal", "liver", "gallbladder", "spleen", "pancreas", "cbd"],
    "kub scan": ["kub", "kidney", "renal", "bladder", "prostate"],
    "testes scan": ["testes", "testis", "epididymis", "varicocele", "hydrocele", "scrotal"]
  };
  const keys = sectionKeywords[suggested];
  return keys && keys.some(k => clue.includes(k)) ? "high" : "low";
}

function makeImageGallerySection(reportType, images) {
  const isEcho = reportType === "echocardiography";
  return {
    id: isEcho ? "cardiac_images" : "additional_source_images",
    title: isEcho ? "Cardiac Images" : "Additional Source Images",
    type: "image_gallery",
    content: isEcho
      ? "Source echocardiography images from the uploaded PDF. These images were kept together because automatic section placement is not reliable for unclear echocardiography frames."
      : "Source images from the uploaded PDF that could not be confidently matched to a specific clinical section.",
    images: images || []
  };
}

function normaliseLowConfidenceImages(editable, reportType) {
  // Automatic image placement is restored. Do not move images out of sections
  // on load/save/enhance. Doctors can now correct placement manually with
  // drag-and-drop, so frontend safety cleanup should not undo backend placement.
  return editable;
}


function imageIdentity(img) {
  return String(img?.id || img?.url || img?.path || img?.image_path || img?.filename || img?.caption || "");
}

function isImageGallerySection(section) {
  const title = String(section?.title || "").trim().toLowerCase();
  return section?.type === "image_gallery" || ["cardiac images", "source images", "additional source images", "unassigned clinical images"].includes(title);
}

function getImageDragPayload(e) {
  try {
    const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setImageDragPayload(e, image, sourceSectionId) {
  const payload = { imageKey: imageIdentity(image), sourceSectionId: sourceSectionId || null };
  e.dataTransfer.setData("application/json", JSON.stringify(payload));
  e.dataTransfer.setData("text/plain", JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

function ensureImageGallerySection(sections, reportType) {
  const existingIndex = sections.findIndex(isImageGallerySection);
  if (existingIndex >= 0) return { sections, galleryIndex: existingIndex };
  const gallery = makeImageGallerySection(reportType || "unknown_report", []);
  return { sections: [...sections, gallery], galleryIndex: sections.length };
}

function moveImageInEditable(editable, imageKey, targetSectionId, targetIndex = null) {
  if (!editable || !Array.isArray(editable.sections) || !imageKey) return editable;
  let movedImage = null;
  let sections = editable.sections.map((section) => {
    const filtered = [];
    for (const img of (section.images || [])) {
      if (imageIdentity(img) === imageKey && !movedImage) movedImage = img;
      else filtered.push(img);
    }
    return { ...section, images: filtered };
  });
  if (!movedImage) return editable;

  let targetIndexInSections = sections.findIndex((section) => String(section.id || section.title) === String(targetSectionId));
  if (targetSectionId === "__image_bank__" || targetIndexInSections < 0) {
    const ensured = ensureImageGallerySection(sections, editable.report_type || editable.template);
    sections = ensured.sections;
    targetIndexInSections = ensured.galleryIndex;
  }

  sections = sections.map((section, idx) => {
    if (idx !== targetIndexInSections) return section;
    const images = [...(section.images || [])];
    if (Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex <= images.length) images.splice(targetIndex, 0, movedImage);
    else images.push(movedImage);
    return { ...section, images };
  });

  return { ...editable, sections };
}


function ImageViewerModal({ images = [], initialIndex = 0, onClose }) {
  const safeImages = (images || []).filter((img) => img?.url);
  const [index, setIndex] = useState(Math.min(Math.max(Number(initialIndex) || 0, 0), Math.max(safeImages.length - 1, 0)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [dragging, setDragging] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const current = safeImages[index] || safeImages[0];

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setBrightness(100);
    setContrast(100);
  };

  const goTo = (nextIndex) => {
    if (!safeImages.length) return;
    const normalized = (nextIndex + safeImages.length) % safeImages.length;
    setIndex(normalized);
    resetView();
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
      if (event.key === "+" || event.key === "=") setZoom((z) => Math.min(6, Number((z + 0.25).toFixed(2))));
      if (event.key === "-" || event.key === "_") setZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))));
      if (event.key === "0") resetView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, safeImages.length]);

  useEffect(() => {
    document.body.classList.add("image-viewer-open");
    return () => document.body.classList.remove("image-viewer-open");
  }, []);

  if (!current) return null;

  const startDrag = (event) => {
    event.preventDefault();
    setDragging(true);
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const moveDrag = (event) => {
    if (!dragging) return;
    const dx = event.clientX - pointerRef.current.x;
    const dy = event.clientY - pointerRef.current.y;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const stopDrag = () => setDragging(false);

  const wheelZoom = (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 0.16 : -0.16;
    setZoom((z) => Math.min(6, Math.max(0.4, Number((z + direction).toFixed(2)))));
  };

  return (
    <div className="clinical-image-viewer no-print" role="dialog" aria-modal="true" aria-label="Clinical image viewer">
      <div className="clinical-viewer-topbar">
        <div>
          <strong>{current.caption || current.filename || `Image ${index + 1}`}</strong>
          <span>{index + 1} of {safeImages.length} • Scroll to zoom • Drag to pan • Esc to close</span>
        </div>
        <button type="button" className="viewer-close" onClick={onClose}>Close ×</button>
      </div>

      <div className="clinical-viewer-layout">
        {safeImages.length > 1 && (
          <aside className="clinical-viewer-strip">
            {safeImages.map((img, i) => (
              <button
                type="button"
                key={imageIdentity(img) || img.url || i}
                className={`viewer-strip-thumb ${i === index ? "active" : ""}`}
                onClick={() => goTo(i)}
                title={img.caption || `Image ${i + 1}`}
              >
                <img src={img.url} alt={img.caption || `Image ${i + 1}`} />
                <span>{i + 1}</span>
              </button>
            ))}
          </aside>
        )}

        <main
          className={`clinical-viewer-stage ${dragging ? "dragging" : ""}`}
          onWheel={wheelZoom}
          onMouseDown={startDrag}
          onMouseMove={moveDrag}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onDoubleClick={() => setZoom((z) => z < 1.8 ? 2.4 : 1)}
        >
          <img
            src={current.url}
            alt={current.caption || "Clinical source image"}
            draggable="false"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
              filter: `brightness(${brightness}%) contrast(${contrast}%)`,
            }}
          />
        </main>

        <aside className="clinical-viewer-tools">
          <button type="button" onClick={() => goTo(index - 1)} disabled={safeImages.length < 2}>Previous</button>
          <button type="button" onClick={() => goTo(index + 1)} disabled={safeImages.length < 2}>Next</button>
          <div className="viewer-tool-row"><span>Zoom</span><b>{Math.round(zoom * 100)}%</b></div>
          <div className="viewer-tool-buttons">
            <button type="button" onClick={() => setZoom((z) => Math.max(.4, Number((z - .25).toFixed(2))))}>−</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(6, Number((z + .25).toFixed(2))))}>+</button>
          </div>
          <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)}>Rotate 90°</button>
          <button type="button" onClick={resetView}>Reset view</button>
          <label>Brightness <input type="range" min="50" max="160" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label>
          <label>Contrast <input type="range" min="50" max="180" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
          <a href={current.url} target="_blank" rel="noreferrer">Open original image</a>
        </aside>
      </div>
    </div>
  );
}

function ImageBankPanel({ images, onImageDragStart, onDropBack, onPreview }) {
  return <div className="image-bank-panel no-print" onDragOver={(e)=>{e.preventDefault(); e.dataTransfer.dropEffect='move';}} onDrop={(e)=>{e.preventDefault(); const payload = getImageDragPayload(e); if (payload?.imageKey) onDropBack(payload.imageKey);}}>
    <div className="image-bank-head"><h3>Image Bank</h3><p>Drag images into any report section. Drop images back here to unassign them.</p></div>
    {images?.length ? <div className="image-bank-grid">{images.map((img, idx) => <figure className="image-bank-thumb" key={imageIdentity(img) || idx} draggable onDragStart={(e)=>onImageDragStart(e, img, "__image_bank__")} title="Drag this image into a section">
      <button type="button" className="image-preview-trigger" draggable="false" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); onPreview?.(images, idx);}}>View</button>
      <img src={img.url} alt={img.caption || img.filename || `Source image ${idx + 1}`} onClick={(e)=>{e.preventDefault(); onPreview?.(images, idx);}} />
      <figcaption>{img.caption || img.filename || `Image ${idx + 1}`}</figcaption>
    </figure>)}</div> : <div className="image-bank-empty">No unassigned images. Drag images here from a section to move them back.</div>}
  </div>
}

function SectionBlock({ section, onChange, onImageDrop, onImageDragStart, onMoveImageToBank, onPreview }) {
  const update = patch => onChange({ ...section, ...patch });
  const images = section.images || [];
  const imagePairs = [];
  const sectionDropId = section.id || section.title;
  for (let i = 0; i < images.length; i += 2) imagePairs.push(images.slice(i, i + 2));

  const handleDrop = (e) => {
    e.preventDefault();
    const payload = getImageDragPayload(e);
    if (payload?.imageKey && typeof onImageDrop === "function") onImageDrop(payload.imageKey, sectionDropId);
  };

  return <section className={`live-section-block ${images.length ? "image-section" : "text-section"}`} onDragOver={(e)=>{e.preventDefault(); e.dataTransfer.dropEffect='move';}} onDrop={handleDrop}>
    <h3 dir="ltr" lang="en"><input className="section-title-input" value={section.title || ""} onChange={e=>update({title:e.target.value})} /></h3>
    {section.rows?.length ? <div className="live-table-wrap"><table><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Status</th></tr></thead><tbody>{section.rows.map((r,i)=> r.note ? <tr key={i}><td colSpan="5" className="note-row">{r.note}</td></tr> : <tr key={i} className={r.status === 'Review' ? 'review' : ''}><td>{r.test}</td><td><b>{r.result}</b></td><td>{r.unit}</td><td>{r.reference_range}</td><td>{r.status}</td></tr>)}</tbody></table></div> : <AutoResizeTextarea value={section.content || ""} placeholder={`Click here to write ${section.title || "this section"}...`} onChange={(value)=>update({content:value})} />}
    <div className="section-image-drop-hint no-print"><Icon name="image"/> Drop source images here</div>
    {!!imagePairs.length && <div className="related-source-images">{imagePairs.map((pair,rowIndex) => <div className="source-image-row" key={`row-${rowIndex}`}>{pair.map((img,idx) => <figure className="inline-related-image draggable-report-image" draggable onDragStart={(e)=>onImageDragStart?.(e, img, sectionDropId)} key={img.id || img.url || `${rowIndex}-${idx}`}>
              <button type="button" className="image-preview-trigger" draggable="false" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); onPreview?.(images, rowIndex*2+idx);}}>View full screen</button>
              <img src={img.url} alt={img.caption || 'source image'} onClick={(e)=>{e.preventDefault(); onPreview?.(images, rowIndex*2+idx);}} />
              <figcaption>{img.caption || `Source image ${rowIndex*2+idx+1}`}<button type="button" className="image-bank-return no-print" onClick={(e)=>{e.preventDefault(); onMoveImageToBank?.(imageIdentity(img));}}>Move to bank</button></figcaption>
            </figure>)}</div>)}</div>}
  </section>
}



function MeasurementsBlock({ measurements }) {
  const rows = measurements || [];
  if (!rows.length) return null;
  return <section className="live-section-block measurement-section">
    <h3>Echocardiography Measurements</h3>
    <div className="live-table-wrap"><table><thead><tr><th>Category</th><th>Measurement</th><th>Value</th><th>Unit</th><th>Note</th></tr></thead><tbody>
      {rows.map((m, i) => <tr key={m.id || `${m.name}-${i}`}><td>{m.category}</td><td>{m.name}</td><td><b>{m.value}</b></td><td>{m.unit}</td><td>{m.note || m.reference_range || ""}</td></tr>)}
    </tbody></table></div>
  </section>
}

function ExtractedTablesPreview({ tables }) {
  const all = tables || [];
  if (!all.length) return null;
  return <section className="live-section-block extracted-table-preview">
    <h3>Extracted Table Data</h3>
    <p className="muted">Structured table rows saved in the database and linked to the original uploaded PDF.</p>
    {all.map(t => <div className="table-preview-card" key={t.id}>
      <h4>{t.section_title} <small>Source #{t.source_file_id} • Page {t.page_number}</small></h4>
      <div className="live-table-wrap"><table><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference Range</th><th>Flag</th></tr></thead><tbody>
        {(t.rows || []).slice(0, 12).map(r => r.row_type === 'note' ? <tr key={r.id}><td colSpan="5" className="note-row">{r.notes || r.raw_text}</td></tr> : <tr key={r.id} className={r.is_abnormal ? 'review' : ''}><td>{r.test_name}</td><td><b>{r.result_value}</b></td><td>{r.unit}</td><td>{r.reference_range}</td><td>{r.flag || ''}</td></tr>)}
      </tbody></table></div>
      {(t.rows || []).length > 12 && <small className="muted">Showing first 12 rows. Full rows are saved in the database and available in CSV export.</small>}
    </div>)}
  </section>
}

function OriginalReportBuilder({ token, patients, selectedPatientId, setSelectedPatientId, refresh, user }) {
  const [patient, setPatient] = useState(null); const [report, setReport] = useState(null); const [editable, setEditable] = useState(null); const [busy, setBusy] = useState(false); const [msg,setMsg]=useState(""); const [imageViewer, setImageViewer] = useState(null);
  const selectedPatient = patients.find(p => p.id === Number(selectedPatientId)) || null;
  const loadPatient = async id => { if (!id) return; const p = await api(`/api/patients/${id}`, {}, token); setPatient(p); if (!report && p.reports?.[0]) loadReport(p.reports[0].id); };
  const loadReport = async id => { const data = await api(`/api/reports/${id}`, {}, token); const safeEditable = normaliseLowConfidenceImages(data.editable_report, data.report_type); setReport(data); setEditable(safeEditable); };
  useEffect(()=>{ if (selectedPatientId) loadPatient(selectedPatientId); }, [selectedPatientId]);
  const refreshPatient = async id => { const p = await api(`/api/patients/${id}`, {}, token); setPatient(p); refresh(); };
  const save = async (status="draft") => { if (!report) return; setBusy(true); try { const data = await api(`/api/reports/${report.id}/save-${status}`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({editable_report: editable, doctor_opinion: editable?.doctor_opinion || "", status})}, token); const safeEditable = normaliseLowConfidenceImages(data.report.editable_report, data.report.report_type); setReport(data.report); setEditable(safeEditable); setMsg("Saved"); } finally { setBusy(false); }};
  const enhance = async () => { if (!report) return; setBusy(true); try { const data = await api(`/api/reports/${report.id}/ai-enhance?use_vision=true`, {method:"POST"}, token); const safeEditable = normaliseLowConfidenceImages(data.report.editable_report, data.report.report_type); setReport(data.report); setEditable(safeEditable); setMsg("AI metadata enhanced"); } finally { setBusy(false); }};
  const sections = editable?.sections || [];
  const imageBankSection = sections.find(isImageGallerySection);
  const imageBankImages = imageBankSection?.images || [];
  const handleImageDragStart = (e, img, sourceSectionId) => setImageDragPayload(e, img, sourceSectionId);
  const moveImageToSection = (imageKey, targetSectionId) => setEditable(prev => moveImageInEditable(prev, imageKey, targetSectionId));
  const moveImageToBank = (imageKey) => setEditable(prev => moveImageInEditable(prev, imageKey, "__image_bank__"));
  const openImageViewer = (images, index = 0) => { const list = (images || []).filter((img) => img?.url); if (list.length) setImageViewer({ images: list, index }); };

  return <><header className="page-head"><div><p className="crumb">Dashboard › Report Builder</p><h1>Editable Report Builder <Icon name="spark"/></h1><p>Create, structure and refine AI-powered medical reports with separated patient/report storage.</p></div><div className="head-actions"><button onClick={()=>save('draft')} disabled={!report || busy}><Icon name="save"/> Save Draft</button><button className="gold" onClick={enhance} disabled={!report || busy}><Icon name="spark"/> Generate AI Draft</button><button className="light" onClick={()=>window.print()}><Icon name="print"/> Print</button></div></header>
    <div className="builder-layout"><aside className="builder-left report-builder-toolbox"><div className="toolbox-header"><span className="toolbox-kicker">Doctor Toolbox</span><strong>Report controls</strong><small>Image bank, uploads and sections stay available while you scroll.</small></div><div className="case-select"><h3>Patient Case</h3><select value={selectedPatientId || ""} onChange={e=>{setSelectedPatientId(e.target.value); setReport(null); setEditable(null);}}><option value="">Select patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>{patient?.reports?.length ? <select value={report?.id || ""} onChange={e=>loadReport(e.target.value)}><option value="">Select report</option>{patient.reports.map(r=><option key={r.id} value={r.id}>Report #{r.id} • {r.image_count} images</option>)}</select> : <p>No reports yet. Upload PDFs to create one.</p>}</div><UploadPanel token={token} patient={patient || selectedPatient} report={report} setReport={(r)=>{const safeEditable = normaliseLowConfidenceImages(r.editable_report, r.report_type); setReport(r); setEditable(safeEditable)}} refreshPatient={refreshPatient}/>{editable && <ImageBankPanel images={imageBankImages} onImageDragStart={handleImageDragStart} onDropBack={moveImageToBank} onPreview={openImageViewer}/>}<div className="section-index"><h3>Report Sections</h3>{sections.map(s=><span key={s.id}>{s.title} {s.images?.length ? `(${s.images.length} images)` : ''}</span>)}</div></aside>
    <main className="editor-panel"><div className="live-title"><Icon name="spark"/><strong>Live Report Editor</strong><span className="green-dot"/><small>All changes are editable and ready for print.</small></div><div className="toolbar"><b>Paragraph</b><button>B</button><button>I</button><button>U</button><button>↶</button><button>↷</button></div>{editable ? <article className="report-paper"><ReportCoverPage patient={patient} report={report} editable={editable} setEditable={setEditable} user={user}/><ReportExaminationsPage editable={editable} report={report}/>{(editable.source_warnings || report?.source_warnings || []).length ? <section className="source-warning-block"><h3>Source Patient Check</h3>{(editable.source_warnings || report?.source_warnings || []).map((w,i)=><p key={i}>{w}</p>)}</section> : null}<h2>Doctor Opinion <span className="pill">Required</span></h2><AutoResizeTextarea id="doctor-opinion" value={editable.doctor_opinion || ""} placeholder="Click here to add doctor opinion..." onChange={(value)=>setEditable({...editable, doctor_opinion:value})} />{sections.map((s,idx)=><SectionBlock key={s.id || idx} section={s} onImageDrop={moveImageToSection} onImageDragStart={handleImageDragStart} onMoveImageToBank={moveImageToBank} onPreview={openImageViewer} onChange={(next)=>{ const updated=[...sections]; updated[idx]=next; setEditable({...editable, sections:updated}); }}/>) }<MeasurementsBlock measurements={editable?.measurements || report?.measurements || []}/><ExtractedTablesPreview tables={report?.extracted_tables || editable?.extracted_tables || []}/><h2>Limitations</h2><p>{editable.limitations}</p></article> : <div className="empty-state">Select a patient and upload PDFs to create a report.</div>}</main></div>{imageViewer && <ImageViewerModal images={imageViewer.images} initialIndex={imageViewer.index} onClose={()=>setImageViewer(null)}/>} {msg && <div className="toast">{msg}</div>}</>
}

function LegacyReportBuilderScreen({ screen, user, notify, setScreen }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(() => {
    if (typeof screen === "string" && screen.startsWith("report-builder:")) {
      const parts = screen.split(":");
      return parts[1] || "";
    }
    return "";
  });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api("/api/patients", {}, getStoredToken());
      const patientsList = Array.isArray(list) ? list : (Array.isArray(list?.patients) ? list.patients : []);
      setPatients(patientsList);
    } catch (err) {
      notify?.(err.message || "Could not load patients", "error");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (typeof screen === "string" && screen.startsWith("report-builder:")) {
      const parts = screen.split(":");
      setSelectedPatientId(parts[1] || "");
    }
  }, [screen]);

  return (
    <div className="legacy-report-builder-scope">
      {loading && !patients.length ? <div className="empty-state">Loading patient cases...</div> : null}
      <OriginalReportBuilder
        token={getStoredToken()}
        patients={patients}
        selectedPatientId={selectedPatientId}
        setSelectedPatientId={setSelectedPatientId}
        refresh={refresh}
        user={user}
      />
    </div>
  );
}


function Workspace({ user, screen, setScreen, onLogout, notify }) {
  return (
    <section className="workspace">
      <DoctorSidebar user={user} screen={screen} setScreen={setScreen} onLogout={onLogout} />

      <section className="content-panel">
        {screen === "dashboard" && <DoctorDashboardPage user={user} notify={notify} setScreen={setScreen} />}
        {screen === "cases" && <CasesPage user={user} notify={notify} setScreen={setScreen} />}
        {screen === "new-case" && <CreateCasePage user={user} notify={notify} setScreen={setScreen} />}
        {(screen === "report-builder" || screen.startsWith("report-builder:")) && <LegacyReportBuilderScreen screen={screen} user={user} notify={notify} setScreen={setScreen} />}
        {screen === "uploads" && <UploadsPage user={user} notify={notify} setScreen={setScreen} />}
        {screen === "templates" && <TemplatesPage setScreen={setScreen} />}
        {screen === "admin" && user.role === "admin" && <AdminControl notify={notify} />}
        {screen === "account" && <AccountPage user={user} notify={notify} />}
      </section>
    </section>
  );
}

function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}


function DashboardStatCard({ icon, label, value, description, tone = "gold", onClick }) {
  return (
    <section className={`card dashboard-stat-card dashboard-stat-card-${tone}`} role={onClick ? "button" : undefined} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div className="dashboard-stat-top">
        <span>{label}</span>
        <div className="dashboard-stat-icon"><Icon name={icon} size={18} /></div>
      </div>
      <strong>{value}</strong>
      <p>{description}</p>
    </section>
  );
}

function DashboardPanelTitle({ icon, title, text, action }) {
  return (
    <div className="section-title dashboard-section-head dashboard-panel-title">
      <div className="dashboard-title-group">
        <span className="dashboard-title-icon"><Icon name={icon} size={18} /></span>
        <div>
          <h3>{title}</h3>
          {text ? <p className="muted small">{text}</p> : null}
        </div>
      </div>
      {action || null}
    </div>
  );
}


function DoctorDashboardPage({ user, notify, setScreen }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  function safeDate(value) {
    if (!value) return "Not recorded";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function getReference(patient) {
    return patient.patient_reference || patient.reference || patient.reference_id || patient.id_number || "No reference";
  }

  function getAgeGender(patient) {
    const age = patient.age || patient.patient_age || patient.age_years || "No age";
    const gender = patient.gender || patient.sex || "No gender";
    return `${age} · ${gender}`;
  }

  function getStatus(patient) {
    const raw = String(patient.report_status || patient.status || "").toLowerCase();
    if (raw.includes("complete") || raw.includes("final") || raw.includes("approved")) {
      return { key: "completed", label: "Completed", tone: "success" };
    }
    if (raw.includes("review") || raw.includes("draft")) {
      return { key: "review", label: "Needs review", tone: "warning" };
    }
    if (raw.includes("pending") || raw.includes("analysis")) {
      return { key: "pending", label: "Pending", tone: "danger" };
    }
    return { key: "no-report", label: "No report", tone: "neutral" };
  }

  async function loadPatients() {
    setLoading(true);
    try {
      const data = await apiRequest("/api/patients");
      const list = Array.isArray(data) ? data : (Array.isArray(data?.patients) ? data.patients : []);
      setPatients(list);
    } catch (err) {
      notify(err.message || "Could not load dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPatients(); }, []);

  const rows = patients.map((patient) => ({ patient, status: getStatus(patient) }));
  const filteredRows = rows.filter(({ patient, status }) => {
    const q = search.trim().toLowerCase();
    const text = `${patient.full_name || ""} ${getReference(patient)} ${patient.gender || ""} ${patient.sex || ""}`.toLowerCase();
    const matchesSearch = !q || text.includes(q);
    const matchesStatus = statusFilter === "all" || status.key === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sharedCount = patients.filter((p) => Array.isArray(p.shared_doctors) && p.shared_doctors.length).length;
  const pendingCount = rows.filter((r) => r.status.key === "pending" || r.status.key === "no-report").length;
  const reviewCount = rows.filter((r) => r.status.key === "review").length;
  const completedCount = rows.filter((r) => r.status.key === "completed").length;
  const recentRows = filteredRows.slice(0, 6);

  return (
    <>
      <PageHeader eyebrow={user.role === "admin" ? "Admin dashboard" : "Doctor dashboard"} title="Clinical workspace overview">
        <button className="btn gold" onClick={() => setScreen("new-case")}>Create New Case</button>
        <button className="btn outline" onClick={loadPatients}><Icon name="refresh" /> {loading ? "Loading..." : "Refresh"}</button>
      </PageHeader>

      <section className="card dashboard-hero-panel">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Clinical workspace</p>
          <h3>Welcome back, {user.full_name || "Doctor"}</h3>
          <p className="muted">Review patient cases, continue unfinished reports, and open the report builder quickly.</p>
          <div className="dashboard-mini-strip">
            <button className="mini-overview-card" onClick={() => setStatusFilter("pending")}><Icon name="clock" size={16} /><span><strong>{pendingCount}</strong><small>Pending</small></span></button>
            <button className="mini-overview-card" onClick={() => setStatusFilter("review")}><Icon name="alert" size={16} /><span><strong>{reviewCount}</strong><small>Need review</small></span></button>
            <button className="mini-overview-card" onClick={() => setStatusFilter("completed")}><Icon name="check" size={16} /><span><strong>{completedCount}</strong><small>Completed</small></span></button>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <button className="btn gold" onClick={() => setScreen("report-builder")}><Icon name="spark" /> Start Report Builder</button>
          <button className="btn outline" onClick={() => setScreen("uploads")}><Icon name="upload" /> View Uploads</button>
        </div>
      </section>

      <div className="doctor-home-grid enhanced-stats-grid">
        <DashboardStatCard icon="users" label="Total cases" value={patients.length} description="Patient cases assigned to this account." tone="gold" onClick={() => setScreen("cases")} />
        <DashboardStatCard icon="clock" label="Pending" value={pendingCount} description="Cases waiting for upload, analysis or report creation." tone="amber" onClick={() => setStatusFilter("pending")} />
        <DashboardStatCard icon="alert" label="Needs review" value={reviewCount} description="Draft reports that need final doctor review." tone="rose" onClick={() => setStatusFilter("review")} />
        <DashboardStatCard icon="check" label="Completed" value={completedCount} description="Reports marked as completed or approved." tone="green" onClick={() => setStatusFilter("completed")} />
      </div>

      <div className="dashboard-layout-grid">
        <section className="card dashboard-main-card clinical-case-panel">
          <DashboardPanelTitle
            icon="list"
            title="Recent patient cases"
            text="Search, filter and open a case directly."
            action={<button className="btn outline" onClick={() => setScreen("cases")}><Icon name="users" /> View All Cases</button>}
          />

          <div className="dashboard-filters">
            <label className="dashboard-search-input">
              <Icon name="search" size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient name or reference..." />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="no-report">No report</option>
              <option value="pending">Pending</option>
              <option value="review">Needs review</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="dashboard-case-table">
            {recentRows.map(({ patient, status }) => (
              <div className="dashboard-case-row" key={patient.id}>
                <button className="case-main-button" onClick={() => setScreen(`report-builder:${patient.id}:new`)}>
                  <span className="case-avatar">{String(patient.full_name || "P").trim().slice(0, 2).toUpperCase()}</span>
                  <span><strong>{patient.full_name || "Unnamed patient"}</strong><small>{getReference(patient)} · {getAgeGender(patient)}</small></span>
                </button>
                <div className="case-meta-cell wide"><small>Last activity</small><strong>{safeDate(patient.updated_at || patient.created_at)}</strong></div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <div className="case-row-actions">
                  <button className="btn ghost" onClick={() => setScreen(`report-builder:${patient.id}:new`)}><Icon name="report" size={16} /> Open</button>
                </div>
              </div>
            ))}
          </div>
          {!recentRows.length && <EmptyState title="No cases found" text="Create a patient case or change your search/filter." />}
        </section>

        <aside className="dashboard-side-stack">
          <section className="card action-required-card">
            <DashboardPanelTitle icon="alert" title="Action required" text="Items that should be checked next." />
            <div className="action-list">
              <button className="action-item warning" onClick={() => setStatusFilter("review")}><span className="action-value"><Icon name="alert" size={18} /></span><span><strong>Reports needing review</strong><small>Draft reports that should be checked.</small></span><em>Review</em></button>
              <button className="action-item danger" onClick={() => setStatusFilter("pending")}><span className="action-value"><Icon name="clock" size={18} /></span><span><strong>Cases waiting</strong><small>No completed report yet.</small></span><em>Show</em></button>
              <button className="action-item success" onClick={() => setScreen("report-builder")}><span className="action-value"><Icon name="spark" size={18} /></span><span><strong>Report builder</strong><small>Upload PDFs and edit the final report.</small></span><em>Open</em></button>
            </div>
          </section>

          <section className="card quick-actions-card">
            <DashboardPanelTitle icon="dashboard" title="Quick actions" text="Shortcuts for common tasks." />
            <div className="quick-action-grid">
              <button onClick={() => setScreen("new-case")}><Icon name="plus" /><span><strong>New case</strong><small>Create a patient record</small></span></button>
              <button onClick={() => setScreen("report-builder")}><Icon name="report" /><span><strong>Report builder</strong><small>Open the live editor</small></span></button>
              <button onClick={() => setScreen("uploads")}><Icon name="upload" /><span><strong>Uploads</strong><small>Review source files</small></span></button>
              <button onClick={() => setScreen("templates")}><Icon name="template" /><span><strong>Templates</strong><small>Browse saved layouts</small></span></button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function ReportBuilderHomePage({ notify, setScreen }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(true);

  useEffect(() => {
    let alive = true;
    apiRequest("/api/patients")
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
        if (list[0]?.id) setSelectedPatientId(String(list[0].id));
      })
      .catch(() => {
        if (alive) setPatients([]);
      })
      .finally(() => {
        if (alive) setLoadingPatients(false);
      });
    return () => { alive = false; };
  }, []);

  const selectedPatient = patients.find((p) => String(p.id) === String(selectedPatientId));

  return (
    <StandaloneReportBuilder
      userPatient={selectedPatient}
      patients={patients}
      selectedPatientId={selectedPatientId}
      loadingPatients={loadingPatients}
      onPatientChange={setSelectedPatientId}
      onOpenBackendBuilder={() => selectedPatientId ? setScreen(`report-builder:${selectedPatientId}:new`) : notify("Create or select a patient case first.", "error")}
      onCreateCase={() => setScreen("new-case")}
      notify={notify}
    />
  );
}

function StandaloneReportBuilder({ userPatient, patients, selectedPatientId, loadingPatients, onPatientChange, onOpenBackendBuilder, onCreateCase, notify }) {
  const initialReport = () => ({
    title: "Medical Report",
    subtitle: "AI-assisted clinical report generated from uploaded source reports",
    patient: {
      full_name: userPatient?.full_name || "",
      age: userPatient?.age || "",
      gender: userPatient?.gender || "",
      date_of_birth: userPatient?.date_of_birth || "",
      patient_reference: userPatient?.patient_reference || userPatient?.reference || "",
    },
    doctor_opinion: "",
    sections: [],
    limitations: "This report should be reviewed, edited and approved by a qualified clinician before final use.",
  });

  const [editable, setEditable] = useState(initialReport);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [mergedPdf, setMergedPdf] = useState(null);
  const [sourcePdfImages, setSourcePdfImages] = useState([]);
  const [sourceExtractedImages, setSourceExtractedImages] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  const [localAiBusy, setLocalAiBusy] = useState(false);
  const [draggingSectionIndex, setDraggingSectionIndex] = useState(null);
  const [media, setMedia] = useState([]);
  const localSourceInputRef = useRef(null);

  useEffect(() => {
    setEditable((prev) => ({
      ...prev,
      patient: {
        ...(prev.patient || {}),
        full_name: userPatient?.full_name || prev.patient?.full_name || "",
        age: userPatient?.age || prev.patient?.age || "",
        gender: userPatient?.gender || prev.patient?.gender || "",
        date_of_birth: userPatient?.date_of_birth || prev.patient?.date_of_birth || "",
        patient_reference: userPatient?.patient_reference || userPatient?.reference || prev.patient?.patient_reference || "",
      },
    }));
  }, [userPatient?.id]);

  function updatePatientField(key, value) {
    setEditable((prev) => ({ ...prev, patient: { ...(prev.patient || {}), [key]: value } }));
  }

  function updateSection(index, key, value) {
    setEditable((prev) => {
      const sections = [...(prev.sections || [])];
      sections[index] = { ...sections[index], [key]: value };
      return { ...prev, sections };
    });
  }

  function addSection() {
    setEditable((prev) => ({
      ...prev,
      sections: [...(prev.sections || []), { id: `section-${Date.now()}`, title: "New Section", type: "text", content: "" }],
    }));
  }

  function removeSection(index) {
    setEditable((prev) => ({ ...prev, sections: (prev.sections || []).filter((_, i) => i !== index) }));
  }

  function moveSection(index, direction) {
    setEditable((prev) => {
      const sections = [...(prev.sections || [])];
      const target = index + direction;
      if (target < 0 || target >= sections.length) return prev;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...prev, sections };
    });
  }



  function moveSectionToIndex(fromIndex, toIndex) {
    setEditable((prev) => {
      const sections = [...(prev.sections || [])];
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= sections.length || toIndex >= sections.length) return prev;
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { ...prev, sections };
    });
  }

  function handleSectionDragStart(index, event) {
    setDraggingSectionIndex(index);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleSectionDrop(index, event) {
    event.preventDefault();
    const storedIndex = event?.dataTransfer?.getData("text/plain");
    const fromIndex = Number.isFinite(draggingSectionIndex) ? draggingSectionIndex : Number(storedIndex);
    if (!Number.isFinite(fromIndex)) return;
    moveSectionToIndex(fromIndex, index);
    setDraggingSectionIndex(null);
  }
  function setLocalSelectedReportFiles(fileList) {
    const nextFiles = Array.from(fileList || []);
    if (!nextFiles.length) return;
    setSelectedFiles((prev) => {
      const existingKeys = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const merged = [...prev];
      nextFiles.forEach((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          merged.push(file);
        }
      });
      return merged;
    });
  }

  function openLocalSourcePicker(e) {
    e.preventDefault();
    e.stopPropagation();
    localSourceInputRef.current?.click();
  }

  function handleLocalDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setLocalSelectedReportFiles(e.dataTransfer?.files);
  }

  function handleLocalUpload(e) {
    e.preventDefault();
    const filesToAdd = Array.from(selectedFiles || []);
    if (!filesToAdd.length) {
      notify("Choose one or more report files first.", "error");
      return;
    }
    const newFiles = filesToAdd.map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
      original_filename: file.name,
      file_size: file.size,
      type: file.type || "document",
      uploaded_at: new Date().toISOString(),
      file,
    }));
    setSourceFiles((prev) => [...prev, ...newFiles]);
    setSelectedFiles([]);
    if (localSourceInputRef.current) localSourceInputRef.current.value = "";
    notify("Files added to the upload manager. Select a patient and use Backend Builder when you want server-side AI extraction.");
  }

  function handleMediaUpload(e) {
    const files = Array.from(e.target.files || []);
    const previews = files.map((file) => ({
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setMedia((prev) => [...previews, ...prev].slice(0, 8));
  }



  function cleanExtractedPdfText(text) {
    return String(text || "")
      .replace(/\u0000/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function pickFirstMatch(text, patterns, groupIndex = 1) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[groupIndex]) return cleanExtractedPdfText(match[groupIndex]);
    }
    return "";
  }

  function titleCasePatientName(value) {
    const cleaned = cleanExtractedPdfText(value)
      .replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, "")
      .replace(/[_\-]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!cleaned) return "";
    return cleaned.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function inferPatientNameFromFiles(pdfSources) {
    for (const source of pdfSources || []) {
      const name = source.original_filename || "";
      const fromResultsName = name.match(/results[_\s-]+(.+?)(?:[_\s-]+\d|\.pdf$)/i);
      if (fromResultsName?.[1]) return titleCasePatientName(fromResultsName[1]);
      const beforePdf = name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");
      const likelyName = beforePdf.match(/\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,4})\b/);
      if (likelyName?.[1]) return titleCasePatientName(likelyName[1]);
    }
    return "";
  }

  function extractPatientDetailsFromText(text, pdfSources) {
    const compact = cleanExtractedPdfText(text);
    const singleLine = compact.replace(/\n/g, " ");
    const rawName = pickFirstMatch(singleLine, [
      /(?:patient\s*name|name\s*of\s*patient|patient)\s*[:\-]?\s*((?:mr|mrs|ms|miss|dr)?\.?\s*[A-Z][A-Z .'-]{4,80}?)(?=\s{2,}|\s*(?:age|sex|gender|dob|date\s*of\s*birth|patient\s*(?:id|no|number)|ref(?:erence)?|sample|lab)|$)/i,
      /(?:surname|family\s*name)\s*[:\-]?\s*([A-Z][A-Z .'-]{2,50})\s+(?:forename|given\s*name)\s*[:\-]?\s*([A-Z][A-Z .'-]{2,50})/i,
    ], 1);
    const name = titleCasePatientName(rawName) || inferPatientNameFromFiles(pdfSources);

    const age = pickFirstMatch(singleLine, [
      /(?:age)\s*[:\-]?\s*(\d{1,3})(?:\s*(?:years|yrs|y|yo|سال))?/i,
      /(?:سن)\s*[:\-]?\s*(\d{1,3})/i,
    ]);
    const genderRaw = pickFirstMatch(singleLine, [
      /(?:sex|gender)\s*[:\-]?\s*(male|female|m|f)\b/i,
      /(?:جنسیت)\s*[:\-]?\s*(مرد|زن)/i,
    ]);
    const gender = genderRaw
      ? ({ m: "Male", male: "Male", f: "Female", female: "Female", "مرد": "Male", "زن": "Female" }[genderRaw.toLowerCase?.() || genderRaw] || genderRaw)
      : "";
    const dob = pickFirstMatch(singleLine, [
      /(?:dob|d\.o\.b\.?|date\s*of\s*birth|birth\s*date)\s*[:\-]?\s*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:19|20)?\d{2})/i,
      /(?:تاریخ\s*تولد)\s*[:\-]?\s*([0-9\/\-.]{6,12})/i,
    ]);
    const reference = pickFirstMatch(singleLine, [
      /(?:patient\s*(?:id|no|number)|reference\s*(?:id|no|number)?|ref(?:erence)?\s*(?:id|no)?|lab\s*(?:no|number)|sample\s*(?:id|no|number)|nhs\s*no)\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\/-]{2,40})/i,
      /(?:شناسه|کد\s*بیمار|شماره\s*پرونده)\s*[:\-#]?\s*([A-Z0-9\/-]{2,40})/i,
    ]);

    return { full_name: name, age, gender, date_of_birth: dob, patient_reference: reference };
  }

  async function extractTextFromPdfSources(pdfSources) {
    const pdfjsLib = await import(/* @vite-ignore */ "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs";
    const extractedReports = [];

    for (const source of pdfSources) {
      const bytes = await source.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
      const pageTexts = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        let previousY = null;
        const lines = [];
        let currentLine = [];

        textContent.items.forEach((item) => {
          const y = Math.round(item.transform?.[5] || 0);
          const value = String(item.str || "").trim();
          if (!value) return;
          if (previousY !== null && Math.abs(y - previousY) > 4) {
            if (currentLine.length) lines.push(currentLine.join(" "));
            currentLine = [];
          }
          currentLine.push(value);
          previousY = y;
        });
        if (currentLine.length) lines.push(currentLine.join(" "));
        pageTexts.push(`Page ${pageNumber} of ${pdf.numPages}\n${cleanExtractedPdfText(lines.join("\n"))}`);
      }

      extractedReports.push({
        filename: source.original_filename || "Source report.pdf",
        pages: pdf.numPages,
        text: cleanExtractedPdfText(pageTexts.join("\n\n")),
      });
    }

    const combinedText = cleanExtractedPdfText(extractedReports.map((report, index) => (
      `SOURCE REPORT ${index + 1}: ${report.filename}\n${report.text}`
    )).join("\n\n------------------------------\n\n"));

    return {
      reports: extractedReports,
      combinedText,
      patient: extractPatientDetailsFromText(combinedText, pdfSources),
    };
  }

  function mergePatientDetails(existingPatient = {}, extractedPatient = {}) {
    const cleanedExtracted = {
      ...extractedPatient,
      gender: normaliseGender(extractedPatient.gender || ""),
    };
    return {
      ...existingPatient,
      full_name: cleanedExtracted.full_name || existingPatient.full_name || "",
      age: cleanedExtracted.age || existingPatient.age || "",
      gender: cleanedExtracted.gender || normaliseGender(existingPatient.gender || ""),
      date_of_birth: cleanedExtracted.date_of_birth || existingPatient.date_of_birth || "",
      patient_reference: cleanedExtracted.patient_reference || existingPatient.patient_reference || "",
    };
  }

  function upsertExtractedSourceSection(sections = [], extractedText = "") {
    if (!extractedText) return sections;
    const structured = parseStructuredSourceReport(extractedText);
    const removeIds = new Set(["source-extracted-text", "source-lab-results", "source-detail-notes"]);
    const nextSections = (sections || []).filter((section) => !removeIds.has(section.id));

    if (structured.tables.length) {
      nextSections.splice(Math.min(2, nextSections.length), 0, {
        id: "source-lab-results",
        title: "Structured Medical Report Tables",
        type: "tables",
        content: "",
        tables: structured.tables,
      });
    }

    if (structured.notes.length) {
      nextSections.splice(Math.min(structured.tables.length ? 3 : 2, nextSections.length), 0, {
        id: "source-detail-notes",
        title: "Source Report Details",
        type: "source_notes",
        content: structured.notes.map((note) => `${note.section ? note.section + ": " : ""}${note.text}`).join("\n"),
        notes: structured.notes,
      });
    }

    return nextSections;
  }

  function extractDarkImagePanelsFromCanvas(canvas, pageNumber, totalPages, sourceName = "Source report") {
    const maxW = 240;
    const scale = Math.min(1, maxW / canvas.width);
    const sw = Math.max(1, Math.round(canvas.width * scale));
    const sh = Math.max(1, Math.round(canvas.height * scale));
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext("2d");
    sctx.drawImage(canvas, 0, 0, sw, sh);
    const img = sctx.getImageData(0, 0, sw, sh).data;
    const visited = new Uint8Array(sw * sh);
    const isDark = (x, y) => {
      const idx = (y * sw + x) * 4;
      const r = img[idx], g = img[idx + 1], b = img[idx + 2];
      return (r + g + b) / 3 < 92;
    };
    const boxes = [];
    const qx = [], qy = [];
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const p = y * sw + x;
        if (visited[p] || !isDark(x, y)) continue;
        visited[p] = 1;
        qx.length = 0; qy.length = 0;
        qx.push(x); qy.push(y);
        let minX = x, maxX = x, minY = y, maxY = y, count = 0;
        for (let qi = 0; qi < qx.length; qi += 1) {
          const cx = qx[qi], cy = qy[qi];
          count += 1;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          const neighbours = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
          for (const [nx, ny] of neighbours) {
            if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
            const np = ny * sw + nx;
            if (!visited[np] && isDark(nx, ny)) {
              visited[np] = 1;
              qx.push(nx); qy.push(ny);
            }
          }
        }
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const area = bw * bh;
        const density = count / Math.max(1, area);
        if (bw > sw * 0.08 && bh > sh * 0.05 && area > sw * sh * 0.003 && density > 0.12) {
          boxes.push({ minX, minY, maxX, maxY });
        }
      }
    }
    const expanded = boxes.map((b) => {
      const pad = 10;
      return {
        x: Math.max(0, Math.round((b.minX - pad) / scale)),
        y: Math.max(0, Math.round((b.minY - pad) / scale)),
        w: Math.min(canvas.width, Math.round((b.maxX - b.minX + 1 + pad * 2) / scale)),
        h: Math.min(canvas.height, Math.round((b.maxY - b.minY + 1 + pad * 2) / scale)),
      };
    }).filter((b) => b.w > 90 && b.h > 70 && b.w < canvas.width * 0.95 && b.h < canvas.height * 0.95);
    const merged = [];
    const overlaps = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
    for (const box of expanded.sort((a,b) => (a.y - b.y) || (a.x - b.x))) {
      const existing = merged.find((m) => overlaps(m, box));
      if (existing) {
        const x1 = Math.min(existing.x, box.x), y1 = Math.min(existing.y, box.y);
        const x2 = Math.max(existing.x + existing.w, box.x + box.w), y2 = Math.max(existing.y + existing.h, box.y + box.h);
        existing.x = x1; existing.y = y1; existing.w = x2 - x1; existing.h = y2 - y1;
      } else merged.push({ ...box });
    }
    return merged.slice(0, 18).map((box, index) => {
      const crop = document.createElement("canvas");
      crop.width = box.w;
      crop.height = box.h;
      crop.getContext("2d").drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      return {
        id: `${sourceName}-panel-${pageNumber}-${index + 1}`,
        pageNumber,
        panelNumber: index + 1,
        totalPages,
        name: sourceName,
        filename: `Source image page ${pageNumber}.${index + 1}`,
        url: crop.toDataURL("image/jpeg", 0.92),
      };
    });
  }

  async function renderPdfBlobToPageImages(blob, sourceName = "Merged source PDF") {
    try {
      const pdfjsLib = await import(/* @vite-ignore */ "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs";
      const bytes = await blob.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
      const pages = [];
      const panels = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        pages.push({
          id: `${sourceName}-${pageNumber}`,
          pageNumber,
          totalPages: pdf.numPages,
          name: sourceName,
          url: canvas.toDataURL("image/jpeg", 0.92),
        });
        panels.push(...extractDarkImagePanelsFromCanvas(canvas, pageNumber, pdf.numPages, sourceName));
      }

      const finalPanels = panels.length ? panels : pages.map((page, index) => ({
        id: `${sourceName}-page-image-${index + 1}`,
        pageNumber: page.pageNumber,
        panelNumber: index + 1,
        totalPages: page.totalPages,
        name: sourceName,
        filename: `Source image ${index + 1}`,
        url: page.url,
      }));
      setSourcePdfImages(pages);
      setSourceExtractedImages(finalPanels);
      return { pages, panels: finalPanels };
    } catch (err) {
      setSourcePdfImages([]);
      setSourceExtractedImages([]);
      notify(`The PDFs were merged, but page previews could not be rendered: ${err.message || "PDF preview failed."}`, "error");
      return [];
    }
  }

  async function mergeLocalPdfSources() {
    const pdfSources = (sourceFiles || []).filter((source) => {
      const name = (source.original_filename || "").toLowerCase();
      return source.file && (source.type === "application/pdf" || name.endsWith(".pdf"));
    });

    if (!pdfSources.length) {
      notify("Add at least one PDF file to the upload manager first.", "error");
      return null;
    }

    if (pdfSources.length === 1) {
      const onlyPdf = pdfSources[0];
      const blob = onlyPdf.file;
      const url = URL.createObjectURL(blob);
      if (mergedPdf?.url) URL.revokeObjectURL(mergedPdf.url);
      const singleOutput = {
        name: onlyPdf.original_filename || "Source_Report.pdf",
        url,
        size: blob.size,
        created_at: new Date().toISOString(),
        count: 1,
      };
      setMergedPdf(singleOutput);
      const renderedSingle = await renderPdfBlobToPageImages(blob, singleOutput.name);
      setSourcePdfImages(renderedSingle.pages || []);
      setSourceExtractedImages(renderedSingle.panels || []);
      notify("One PDF is attached. It is now displayed in the Live Report Editor.");
      return singleOutput;
    }

    try {
      const pdfLib = await import(/* @vite-ignore */ "https://esm.sh/pdf-lib@1.17.1");
      const { PDFDocument } = pdfLib;
      const mergedDocument = await PDFDocument.create();

      for (const source of pdfSources) {
        const bytes = await source.file.arrayBuffer();
        const sourceDocument = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await mergedDocument.copyPages(sourceDocument, sourceDocument.getPageIndices());
        copiedPages.forEach((page) => mergedDocument.addPage(page));
      }

      const mergedBytes = await mergedDocument.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (mergedPdf?.url) URL.revokeObjectURL(mergedPdf.url);
      const output = {
        name: `Merged_Source_Reports_${new Date().toISOString().slice(0, 10)}.pdf`,
        url,
        size: blob.size,
        created_at: new Date().toISOString(),
        count: pdfSources.length,
      };
      setMergedPdf(output);
      const renderedMerged = await renderPdfBlobToPageImages(blob, output.name);
      setSourcePdfImages(renderedMerged.pages || []);
      setSourceExtractedImages(renderedMerged.panels || []);
      notify(`${pdfSources.length} PDF files merged successfully. The merged PDF is now displayed in the Live Report Editor.`);
      return output;
    } catch (err) {
      notify(`PDF merge failed: ${err.message || "The browser could not merge these PDF files."}`, "error");
      return null;
    }
  }

  function saveLocalDraft() {
    const serialisableSources = sourceFiles.map(({ file, ...source }) => source);
    localStorage.setItem("medireport_report_builder_draft", JSON.stringify({ editable, sourceFiles: serialisableSources, mergedPdf: mergedPdf ? { name: mergedPdf.name, size: mergedPdf.size, created_at: mergedPdf.created_at, count: mergedPdf.count } : null, saved_at: new Date().toISOString() }));
    notify("Draft saved locally. For database saving, choose a patient case and open the backend builder.");
  }

  async function generateLocalAiDraft() {
    if (localAiBusy) return;
    setLocalAiBusy(true);
    try {
      const pdfSources = (sourceFiles || []).filter((source) => {
        const name = (source.original_filename || "").toLowerCase();
        return source.file && (source.type === "application/pdf" || name.endsWith(".pdf"));
      });
      const mergedOutput = await mergeLocalPdfSources();
      if (!mergedOutput) return;

      let extracted = { combinedText: "", patient: {}, reports: [] };
      try {
        extracted = await extractTextFromPdfSources(pdfSources);
      } catch (err) {
        notify(`The PDFs were merged, but selectable text could not be extracted: ${err.message || "text extraction failed."}`, "error");
      }

      setEditable((prev) => ({
        ...prev,
        title: prev.title || "Medical Report",
        subtitle: prev.subtitle || "Clinical report prepared from uploaded source reports",
        patient: mergePatientDetails(prev.patient || {}, extracted.patient || {}),
        // No client-side AI opinion/summary is generated here. Backend AI remains the source of AI content.
        doctor_opinion: prev.doctor_opinion || "",
        sections: extracted.combinedText ? upsertExtractedSourceSection(prev.sections || [], extracted.combinedText) : (prev.sections || []),
      }));
      notify("Merged PDF created. Selectable source text was structured into tables where possible. Backend AI can be used for clinical generation.");
    } finally {
      setLocalAiBusy(false);
    }
  }

  async function downloadLocalReport() {
    // Use the browser's native print/save-as-PDF pipeline.
    // This exports the exact same layout that appears in Print and avoids blank PDFs from client-side canvas libraries.
    notify("Opening the PDF export window. Choose 'Save as PDF' in the print dialog.");
    setTimeout(() => window.print(), 120);
  }

  function printLocalReport() {
    window.print();
  }

  const uploadCountLabel = sourceFiles.length ? "Manage" : "Empty";

  return (
    <>
      <header className="builder-topbar no-print">
        <div>
          <div className="breadcrumb">Dashboard <span>›</span> Report Builder</div>
          <h1>Editable Report Builder <Icon name="spark" size={22} /></h1>
          <p>Create, structure and refine AI-powered medical reports with ease.</p>
        </div>
        <div className="builder-actions">
          <button className="builder-btn" onClick={saveLocalDraft}><Icon name="save" />Save Draft</button>
          <button className="builder-btn gold" onClick={generateLocalAiDraft} disabled={localAiBusy}><Icon name="spark" />{localAiBusy ? "Merging..." : "Analyze PDFs"}</button>
          <button className="builder-btn" onClick={downloadLocalReport}><Icon name="download" />Download</button>
          <button className="builder-btn" onClick={printLocalReport}>Print</button>
          <button className="builder-menu" onClick={onOpenBackendBuilder} title="Open backend-connected report builder"><Icon name="menu" /></button>
        </div>
      </header>

      <div className="reference-builder-grid">
        <aside className="builder-left report-builder-toolbox no-print">
          <div className="toolbox-header"><span className="toolbox-kicker">Doctor Toolbox</span><strong>Report controls</strong><small>Upload, arrange and manage report content while you scroll.</small></div>
          <section className="builder-step-card patient-selector-card">
            <div className="step-head split">
              <div className="step-head-main">
                <span className="step-number">0</span>
                <div>
                  <h3>Patient Case</h3>
                  <p>Select a saved patient case for backend AI extraction and database saving.</p>
                </div>
              </div>
            </div>
            <div className="patient-selector-row">
              <select value={selectedPatientId} onChange={(e) => onPatientChange(e.target.value)} disabled={loadingPatients || !patients.length}>
                <option value="">{loadingPatients ? "Loading patients..." : patients.length ? "Select patient" : "No patient cases yet"}</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name || `Patient ${p.id}`}</option>)}
              </select>
              <button className="btn outline" onClick={onCreateCase}>New Case</button>
              <button className="btn gold" onClick={onOpenBackendBuilder} disabled={!selectedPatientId}>Backend Builder</button>
            </div>
          </section>

          <section className="builder-step-card">
            <div className="step-head">
              <span className="step-number">1</span>
              <div>
                <h3>Upload Source Reports</h3>
                <p>Upload one or more source files to let AI extract and organise key findings.</p>
              </div>
            </div>
            <form className="reference-upload" onSubmit={handleLocalUpload}>
              <label className="drop-target" onDragOver={(e) => e.preventDefault()} onDrop={handleLocalDrop}>
                <input ref={localSourceInputRef} type="file" accept="application/pdf,.pdf,.doc,.docx,image/png,image/jpeg" multiple onChange={(e) => setLocalSelectedReportFiles(e.target.files)} />
                <span className="upload-cloud"><Icon name="upload" size={28} /></span>
                <strong>Drag & drop files here</strong>
                <span className="or-text">or</span>
                <button type="button" className="choose-file-btn" onClick={openLocalSourcePicker}>Choose Files</button>
                <small>{selectedFiles.length ? `${selectedFiles.length} file(s) selected` : "Supports PDF, DOCX, JPG, PNG up to backend limits"}</small>
              </label>
              <button className="btn gold full">Add to Upload Manager</button>
            </form>

            <div className="recent-upload-head">
              <strong>Recent uploads</strong>
              <span>{uploadCountLabel}</span>
            </div>
            <div className="recent-upload-list">
              {mergedPdf ? (
                <div className="recent-upload-row merged-output-row">
                  <Icon name="file" />
                  <div>
                    <strong>{mergedPdf.name}</strong>
                    <span>Merged output · {mergedPdf.count || 1} PDF file(s) · {Math.max(1, Math.round((mergedPdf.size || 0) / 1024))} KB</span>
                  </div>
                  <a className="mini-download-link" href={mergedPdf.url} download={mergedPdf.name}>Download</a>
                </div>
              ) : null}

              {sourceFiles.length ? sourceFiles.map((source) => (
                <div className="recent-upload-row" key={source.id}>
                  <Icon name="file" />
                  <div>
                    <strong>{source.original_filename}</strong>
                    <span>{Math.max(1, Math.round((source.file_size || 0) / 1024))} KB · Uploaded just now</span>
                  </div>
                  <button type="button" onClick={() => {
                    setSourceFiles((prev) => prev.filter((f) => f.id !== source.id));
                    setMergedPdf(null);
                    setSourcePdfImages([]);
                    setSourceExtractedImages([]);
                  }}>Remove</button>
                </div>
              )) : (
                <div className="recent-upload-empty">Uploaded reports will appear here so the doctor can view and manage them.</div>
              )}
            </div>
          </section>

          <section className="builder-step-card compact-step">
            <div className="step-head split">
              <div className="step-head-main">
                <span className="step-number">2</span>
                <div>
                  <h3>AI Structuring</h3>
                  <p>Merge PDFs, extract selectable text, and structure detected results into tables.</p>
                </div>
              </div>
              <button className="mini-ai-btn" onClick={generateLocalAiDraft} disabled={localAiBusy}><Icon name="spark" />{localAiBusy ? "Merging..." : "Analyze PDFs"}</button>
            </div>
          </section>

          <section className="builder-step-card">
            <div className="step-head">
              <span className="step-number">3</span>
              <div>
                <h3>Report Sections</h3>
                <p>Review and edit each section of your report.</p>
              </div>
            </div>
            <div className="section-reorder-list">
              <button className="section-pill active" onClick={() => document.getElementById("doctor-opinion-local")?.focus()}><Icon name="grip" size={16} /> Doctor Opinion <span>Required</span></button>
              {(editable.sections || []).map((section, index) => (
                <div
                  className={`section-pill ${draggingSectionIndex === index ? "dragging" : ""}`}
                  key={section.id || index}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleSectionDrop(index, e)}
                >
                  <span
                    className="section-drag-handle"
                    draggable
                    onDragStart={(e) => handleSectionDragStart(index, e)}
                    onDragEnd={() => setDraggingSectionIndex(null)}
                    title="Drag to reorder"
                  >
                    <Icon name="grip" size={16} />
                  </span>
                  {section.type === "tables" || section.type === "source_notes" ? <strong>{section.title || "Source Report Section"}</strong> : <input value={section.title || "Untitled Section"} onChange={(e) => updateSection(index, "title", e.target.value)} />}
                  {section.type === "tables" || section.type === "source_notes" ? null : <button type="button" onClick={() => removeSection(index)} aria-label="Remove section">×</button>}
                </div>
              ))}
              <button className="add-section-btn" onClick={addSection}><Icon name="plus" size={16} />Add Section</button>
            </div>
          </section>
        </aside>

        <section className="live-editor-card" id="printable-report">
          <div className="live-editor-head no-print">
            <div className="live-title"><Icon name="spark" size={18} /><strong>Live Report Editor</strong><span className="green-dot" /> <small>All changes are editable and ready for print.</small></div>
            <button className="tips-btn">Tips</button>
          </div>
          <ReportEditorToolbar />

          <article className="report-paper">
            <ReportCoverPage patient={userPatient || editable.patient || {}} report={editable} editable={editable} setEditable={setEditable} user={null} />
            <ReportExaminationsPage editable={editable} report={editable}/>

            <EditableReportBlock
              id="doctor-opinion-local"
              required
              title="Doctor Opinion"
              value={editable.doctor_opinion || ""}
              placeholder="Click here to add doctor opinion..."
              onChange={(value) => setEditable({ ...editable, doctor_opinion: value })}
            />

            {(editable.sections || []).map((section, index) => {
              if (section.type === "tables") return <LiveStructuredTablesSection key={section.id || index} section={section} />;
              if (section.type === "source_notes") return <LiveSourceNotesSection key={section.id || index} section={section} />;
              return (
                <EditableReportBlock
                  key={section.id || index}
                  title={section.title || `Section ${index + 1}`}
                  value={section.content || ""}
                  placeholder={`Click here to write ${section.title || "this section"}...`}
                  dragHandleProps={{
                    onDragStart: (e) => handleSectionDragStart(index, e),
                    onDragEnd: () => setDraggingSectionIndex(null),
                  }}
                  onDropSection={(e) => handleSectionDrop(index, e)}
                  onChange={(value) => updateSection(index, "content", value)}
                />
              );
            })}

            {mergedPdf ? (
              <section className="merged-source-preview">
                <div className="merged-source-title">
                  <div>
                    <h3>Merged Source PDF</h3>
                    <p>{mergedPdf.count || 1} PDF file{(mergedPdf.count || 1) > 1 ? "s" : ""} combined in upload order.</p>
                  </div>
                  <a className="mini-download-link no-print" href={mergedPdf.url} download={mergedPdf.name}>Download merged PDF</a>
                </div>
                <iframe className="merged-pdf-frame no-print" src={mergedPdf.url} title="Merged source PDF preview" />
                <div className="merged-page-gallery">
                  {sourcePdfImages.length ? sourcePdfImages.map((page) => (
                    <figure className="merged-page-card zoomable-media-card" key={page.id} onClick={() => setImagePreview({ url: page.url, title: `Source page ${page.pageNumber}` })}>
                      <button type="button" className="image-zoom-btn" aria-label="Open larger page">View larger</button>
                      <img src={page.url} alt={`Merged PDF page ${page.pageNumber}`} />
                      <figcaption>Original source preview</figcaption>
                    </figure>
                  )) : (
                    <div className="merged-page-empty">Click Analyze PDFs to merge and render the uploaded PDF pages here.</div>
                  )}
                </div>
              </section>
            ) : null}

            {sourceExtractedImages.length ? (
              <section className="attached-media-block source-image-panels-block">
                <h3>Extracted Source Images <span>(Separated from PDFs)</span></h3>
                <div className="source-panel-grid">
                  {sourceExtractedImages.map((img) => (
                    <figure key={img.id} className="zoomable-media-card" onClick={() => setImagePreview({ url: img.url, title: img.filename || `Page ${img.pageNumber} image ${img.panelNumber}` })}>
                      <button type="button" className="image-zoom-btn" aria-label="Open larger image">View larger</button>
                      <img src={img.url} alt={img.filename || "Source image"} />
                      <figcaption>Page {img.pageNumber} image {img.panelNumber}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="attached-media-block">
              <h3>Attached Media <span>(Images)</span></h3>
              <div className="attached-media-grid">
                <label className="add-image-card no-print"><input type="file" accept="image/*" multiple onChange={handleMediaUpload} /><Icon name="plus" />Add Images</label>
                {media.length ? media.slice(0, 4).map((img) => <button type="button" className="attached-media-thumb" key={img.id} onClick={() => setImagePreview({ url: img.url, title: img.name })}><img src={img.url} alt={img.name} /></button>) : [0,1,2,3].map((i) => <div className="image-placeholder" key={i}><Icon name="image" size={34} /></div>)}
              </div>
            </section>

            <EditableReportBlock
              title="Limitations"
              value={editable.limitations || ""}
              placeholder="Add limitations or footer note..."
              onChange={(value) => setEditable({ ...editable, limitations: value })}
            />
          </article>

          {imagePreview ? (
            <div className="image-lightbox no-print" role="dialog" aria-modal="true" onClick={() => setImagePreview(null)}>
              <div className="image-lightbox-panel" onClick={(e) => e.stopPropagation()}>
                <div className="image-lightbox-head">
                  <strong>{imagePreview.title || "Source image"}</strong>
                  <button type="button" onClick={() => setImagePreview(null)}>×</button>
                </div>
                <img src={imagePreview.url} alt={imagePreview.title || "Source image"} />
              </div>
            </div>
          ) : null}

          <div className="editor-statusbar no-print">
            <span>Words: {(JSON.stringify(editable).match(/\b\w+\b/g) || []).length}</span>
            <span>Characters: {JSON.stringify(editable).length}</span>
            <span>100% ▾</span>
          </div>
        </section>
      </div>
    </>
  );
}

function UploadsPage({ notify, setScreen }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadPatients() {
    setLoading(true);
    try {
      const data = await apiRequest("/api/patients");
      const list = Array.isArray(data) ? data : [];
      setPatients(list);
      if (!selectedPatientId && list[0]?.id) setSelectedPatientId(String(list[0].id));
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadReports(patientId) {
    if (!patientId) { setReports([]); return; }
    try {
      const data = await apiRequest(`/api/reports/patients/${patientId}`);
      setReports(Array.isArray(data) ? data : data.reports || []);
    } catch (err) {
      notify(err.message, "error");
      setReports([]);
    }
  }

  useEffect(() => { loadPatients(); }, []);
  useEffect(() => { loadReports(selectedPatientId); }, [selectedPatientId]);

  const selectedPatient = patients.find((patient) => String(patient.id) === String(selectedPatientId));
  const allSources = reports.flatMap((report) => {
    const sources = Array.isArray(report.source_files) && report.source_files.length
      ? report.source_files
      : [{ id: report.id, original_filename: report.original_filename, filename: report.filename, page_count: report.page_count, status: report.status }];
    return sources.map((source, index) => ({
      ...source,
      sourceIndex: index,
      reportId: report.id,
      reportStatus: report.status || source.status || "draft",
      reportTitle: report.title || report.report_title || "Medical report",
      pageCount: source.page_count || report.page_count || 0,
      createdAt: source.created_at || report.created_at || report.updated_at,
      originalName: source.original_filename || source.filename || report.original_filename || "Uploaded report",
    }));
  });

  const normaliseStatus = (status) => String(status || "draft").toLowerCase().replace(/_/g, " ");
  const filteredSources = allSources.filter((source) => {
    const text = `${source.originalName} ${source.reportTitle} ${normaliseStatus(source.reportStatus)}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || normaliseStatus(source.reportStatus).includes(statusFilter);
    return matchesSearch && matchesStatus;
  });
  const totalPages = allSources.reduce((sum, source) => sum + Number(source.pageCount || 0), 0);
  const readyCount = allSources.filter((source) => ["ready", "completed", "final"].some((word) => normaliseStatus(source.reportStatus).includes(word))).length;
  const draftCount = Math.max(0, allSources.length - readyCount);

  function patientInitials(name) {
    return String(name || "P")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "P";
  }

  function formatDate(value) {
    if (!value) return "Not recorded";
    try { return new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return "Not recorded"; }
  }

  return (
    <>
      <PageHeader eyebrow="Source uploads" title="Manage uploaded reports">
        <button className="btn gold" disabled={!selectedPatientId} onClick={() => setScreen(`report-builder:${selectedPatientId}:new`)}><Icon name="upload" /> Upload New Report</button>
        <button className="btn outline" onClick={loadPatients}><Icon name="refresh" /> {loading ? "Loading..." : "Refresh"}</button>
      </PageHeader>

      <section className="card uploads-hero-card">
        <div className="uploads-hero-copy">
          <span className="uploads-hero-icon"><Icon name="upload" size={22} /></span>
          <div>
            <p className="eyebrow">Source report manager</p>
            <h3>Upload, review and open patient source PDFs</h3>
            <p className="muted">Choose a patient case, check uploaded source files, then continue the report inside the live builder.</p>
          </div>
        </div>
        <button className="btn gold" disabled={!selectedPatientId} onClick={() => setScreen(`report-builder:${selectedPatientId}:new`)}><Icon name="spark" /> Continue in Report Builder</button>
      </section>

      <div className="uploads-stat-grid">
        <section className="card uploads-stat-card"><span><Icon name="file" /> Source files</span><strong>{allSources.length}</strong><p>Total uploaded source documents for the selected patient.</p></section>
        <section className="card uploads-stat-card"><span><Icon name="report" /> Reports</span><strong>{reports.length}</strong><p>Report records linked to this patient case.</p></section>
        <section className="card uploads-stat-card"><span><Icon name="list" /> Pages</span><strong>{totalPages}</strong><p>Known PDF pages across uploaded sources.</p></section>
        <section className="card uploads-stat-card"><span><Icon name="clock" /> Draft items</span><strong>{draftCount}</strong><p>Uploads still attached to draft or unfinished reports.</p></section>
      </div>

      <div className="uploads-layout-grid">
        <section className="card uploads-control-card">
          <div className="uploads-panel-head">
            <div>
              <h3>Patient case</h3>
              <p className="muted small">Select the patient whose uploaded reports you want to manage.</p>
            </div>
            <span className="soft-count">{patients.length}</span>
          </div>

          <Field label="Selected patient">
            <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
              <option value="">Choose patient</option>
              {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.patient_reference || patient.reference || "No reference"}</option>)}
            </select>
          </Field>

          {selectedPatient ? (
            <div className="upload-patient-card">
              <div className="case-avatar upload-patient-avatar">{patientInitials(selectedPatient.full_name)}</div>
              <div>
                <strong>{selectedPatient.full_name || "Unnamed patient"}</strong>
                <span>{selectedPatient.patient_reference || selectedPatient.reference || "No reference"}</span>
                <span>{selectedPatient.gender || "No gender"} · {selectedPatient.age || "No age"}</span>
              </div>
            </div>
          ) : (
            <div className="upload-patient-card muted-card"><Icon name="users" /><span>Select a patient to see source uploads.</span></div>
          )}

          <div className="uploads-quick-actions">
            <button onClick={() => setScreen("cases")}><Icon name="users" /><span>Patient cases</span></button>
            <button disabled={!selectedPatientId} onClick={() => setScreen(`report-builder:${selectedPatientId}:new`)}><Icon name="upload" /><span>Upload source PDF</span></button>
            <button disabled={!selectedPatientId} onClick={() => loadReports(selectedPatientId)}><Icon name="refresh" /><span>Reload uploads</span></button>
          </div>
        </section>

        <section className="card uploads-main-card">
          <div className="uploads-panel-head upload-list-head">
            <div>
              <h3>Uploaded source reports</h3>
              <p className="muted small">Open any source-linked report or filter the list by filename and status.</p>
            </div>
            <span className="soft-count">{filteredSources.length}</span>
          </div>

          <div className="uploads-toolbar">
            <label className="dashboard-search-input uploads-search-input">
              <Icon name="search" size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search uploaded report name or status..." />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="completed">Completed</option>
              <option value="final">Final</option>
            </select>
          </div>

          <div className="source-list upload-page-list polished-upload-list">
            {filteredSources.map((source) => (
              <div className="source-row upload-source-row" key={`${source.reportId}-${source.id || source.sourceIndex}`}>
                <div className="upload-source-icon"><Icon name="file" /></div>
                <div className="upload-source-main">
                  <strong>{source.originalName}</strong>
                  <span>{source.pageCount} pages · {source.reportTitle}</span>
                  <small>Uploaded: {formatDate(source.createdAt)}</small>
                </div>
                <div className="upload-source-meta">
                  <span className={`status-pill ${normaliseStatus(source.reportStatus).includes("completed") || normaliseStatus(source.reportStatus).includes("final") ? "ready" : "draft"}`}>{normaliseStatus(source.reportStatus)}</span>
                  <button className="btn outline" onClick={() => setScreen(`report-builder:${selectedPatientId}:${source.reportId}`)}><Icon name="report" size={16} /> Open</button>
                </div>
              </div>
            ))}
          </div>

          {!filteredSources.length && (
            <div className="uploads-empty-panel">
              <div className="empty-icon"><Icon name="upload" /></div>
              <h3>{reports.length ? "No matching uploads" : "No uploads found"}</h3>
              <p>{reports.length ? "Change the search or status filter to show more source reports." : "Choose a patient and upload PDFs through the report builder."}</p>
              <button className="btn gold" disabled={!selectedPatientId} onClick={() => setScreen(`report-builder:${selectedPatientId}:new`)}><Icon name="plus" /> Upload New Report</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function TemplatesPage({ setScreen }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [activeTemplate, setActiveTemplate] = useState("medical");
  const [query, setQuery] = useState("");

  const templates = [
    {
      id: "medical",
      title: "Medical Report",
      label: "General",
      icon: "report",
      accent: "gold",
      text: "Editable clinical report with patient details, doctor opinion, extracted source text, tables, attached media and final approval.",
      sections: ["Patient card", "Doctor opinion", "Structured findings", "Attached media", "Limitations"],
      bestFor: "General source PDFs and mixed clinical reports",
    },
    {
      id: "laboratory",
      title: "Laboratory Summary",
      label: "Blood tests",
      icon: "chart",
      accent: "green",
      text: "Structured template for blood tests, abnormal flags, reference ranges, table-based results and clinical interpretation.",
      sections: ["Haematology", "Biochemistry", "Endocrinology", "Abnormal flags", "Reference ranges"],
      bestFor: "Blood reports and lab result PDFs",
    },
    {
      id: "imaging",
      title: "Imaging Report",
      label: "Scans",
      icon: "image",
      accent: "blue",
      text: "Template for ultrasound, scan summaries, extracted images, clinical overview, source media and doctor conclusion.",
      sections: ["Clinical overview", "Scan findings", "Extracted images", "Impression", "Recommendations"],
      bestFor: "Ultrasound, Doppler and imaging reports",
    },
    {
      id: "followup",
      title: "Follow-up Review",
      label: "Review",
      icon: "clock",
      accent: "amber",
      text: "A lighter template for follow-up notes, review findings, progress comparison and next-step recommendations.",
      sections: ["Reason for review", "Current findings", "Progress notes", "Plan", "Follow-up date"],
      bestFor: "Short follow-up consultations and repeat checks",
    },
  ];

  const selectedTemplate = templates.find((template) => template.id === activeTemplate) || templates[0];
  const filteredTemplates = templates.filter((template) => {
    const haystack = `${template.title} ${template.text} ${template.bestFor} ${template.sections.join(" ")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const selectedPatient = patients.find((patient) => String(patient.id) === String(selectedPatientId));

  useEffect(() => {
    let mounted = true;
    apiRequest("/patients")
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : data.items || [];
        setPatients(list);
        if (list.length) setSelectedPatientId(String(list[0].id));
      })
      .catch(() => setPatients([]));
    return () => { mounted = false; };
  }, []);

  function openTemplate(templateId = activeTemplate) {
    const target = selectedPatientId ? `report-builder:${selectedPatientId}:new` : "report-builder";
    try {
      sessionStorage.setItem("medireport_selected_template", templateId);
    } catch {}
    setScreen(target);
  }

  return (
    <>
      <PageHeader eyebrow="Templates" title="Report templates">
        <button className="btn outline" onClick={() => setScreen("report-builder")}><Icon name="report" /> Report Builder</button>
        <button className="btn gold" onClick={() => openTemplate()}><Icon name="spark" /> Use Selected Template</button>
      </PageHeader>

      <section className="card templates-hero-card">
        <div className="templates-hero-icon"><Icon name="template" size={28} /></div>
        <div>
          <p className="eyebrow">Template library</p>
          <h3>Choose a report structure before opening the live editor.</h3>
          <p className="muted">Pick a template, select a patient case, then continue in the report builder. This keeps the workflow clean without changing the extraction logic.</p>
        </div>
        <div className="templates-hero-actions">
          <label>
            <span>Patient case</span>
            <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
              <option value="">No patient selected</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.patient_name || patient.full_name || patient.name || "Unnamed patient"} · {patient.patient_reference || patient.reference || "No reference"}</option>
              ))}
            </select>
          </label>
          <button className="btn gold" onClick={() => openTemplate()}><Icon name="plus" /> Start from template</button>
        </div>
      </section>

      <div className="templates-dashboard-grid">
        <section className="card templates-library-panel">
          <div className="template-panel-head">
            <div>
              <h3>Available templates</h3>
              <p className="muted small">Search and select a clinical layout.</p>
            </div>
            <span className="template-count-pill">{filteredTemplates.length} templates</span>
          </div>
          <label className="templates-search-box">
            <Icon name="search" size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates, sections or report type..." />
          </label>
          <div className="templates-card-grid">
            {filteredTemplates.map((template) => (
              <button
                type="button"
                key={template.id}
                className={`template-choice-card ${activeTemplate === template.id ? "active" : ""} template-${template.accent}`}
                onClick={() => setActiveTemplate(template.id)}
              >
                <span className="template-choice-icon"><Icon name={template.icon} size={22} /></span>
                <span className="template-choice-main">
                  <small>{template.label}</small>
                  <strong>{template.title}</strong>
                  <em>{template.bestFor}</em>
                </span>
                <span className="template-choice-check"><Icon name={activeTemplate === template.id ? "check" : "plus"} size={16} /></span>
              </button>
            ))}
          </div>
        </section>

        <aside className="templates-preview-stack">
          <section className="card template-preview-card">
            <div className="template-preview-top">
              <div className={`template-preview-logo template-${selectedTemplate.accent}`}><Icon name={selectedTemplate.icon} size={24} /></div>
              <div>
                <p className="eyebrow">Selected template</p>
                <h3>{selectedTemplate.title}</h3>
                <p className="muted">{selectedTemplate.text}</p>
              </div>
            </div>
            <div className="template-preview-mini-report">
              <div className="mini-report-header">
                <span>MEDIREPORT PRO</span>
                <strong>{selectedTemplate.title}</strong>
              </div>
              <div className="mini-report-patient">
                <div><small>Patient</small><strong>{selectedPatient?.patient_name || selectedPatient?.full_name || selectedPatient?.name || "Choose patient"}</strong></div>
                <div><small>Reference</small><strong>{selectedPatient?.patient_reference || selectedPatient?.reference || "Not specified"}</strong></div>
              </div>
              <div className="mini-report-lines">
                {selectedTemplate.sections.slice(0, 4).map((section) => <span key={section}>{section}</span>)}
              </div>
            </div>
            <button className="btn gold full" onClick={() => openTemplate(selectedTemplate.id)}><Icon name="spark" /> Use this template</button>
          </section>

          <section className="card template-sections-card">
            <div className="template-panel-head compact">
              <h3>Included sections</h3>
              <Icon name="list" />
            </div>
            <div className="template-section-list">
              {selectedTemplate.sections.map((section, index) => (
                <div key={section}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{section}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card template-workflow-card">
            <h3>Workflow</h3>
            <div className="template-workflow-steps">
              <div><Icon name="users" /><span>Select patient case</span></div>
              <div><Icon name="template" /><span>Choose template</span></div>
              <div><Icon name="upload" /><span>Upload source PDF</span></div>
              <div><Icon name="report" /><span>Edit final report</span></div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function CasesPage({ user, notify, setScreen }) {
  const [patients, setPatients] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shareDoctorId, setShareDoctorId] = useState("");

  function safeDate(value) {
    if (!value) return "Not recorded";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function getPatientReference(patient) {
    return patient.patient_reference || patient.reference || patient.reference_id || "No reference";
  }

  function getPatientGender(patient) {
    return patient.gender || patient.sex || "No gender";
  }

  function getPatientAge(patient) {
    return patient.age || patient.patient_age || patient.age_years || "No age";
  }

  function getPatientInitials(patient) {
    return String(patient.full_name || "PT").trim().slice(0, 2).toUpperCase();
  }

  function getReportStatus(report) {
    const raw = String(report?.status || report?.report_status || "").toLowerCase();
    if (raw.includes("final") || raw.includes("complete") || raw.includes("approved")) return { label: "Completed", tone: "success" };
    if (raw.includes("draft") || raw.includes("review")) return { label: "Needs review", tone: "warning" };
    return { label: report?.status || "Draft", tone: "neutral" };
  }

  async function loadPatients() {
    setLoading(true);
    try {
      const data = await apiRequest("/api/patients");
      const list = Array.isArray(data) ? data : (Array.isArray(data?.patients) ? data.patients : []);
      setPatients(list);
      if (selectedPatient) {
        const fresh = list.find((p) => p.id === selectedPatient.id);
        setSelectedPatient(fresh || null);
      }
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    if (user.role !== "admin" && user.role !== "doctor") return;
    try {
      const endpoint = user.role === "admin" ? "/api/users" : "/api/users/doctors";
      const data = await apiRequest(endpoint);
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      try {
        const data = await apiRequest("/auth/doctors");
        setUsers(Array.isArray(data) ? data : []);
      } catch {
        setUsers([]);
      }
    }
  }

  useEffect(() => {
    loadPatients();
    loadUsers();
  }, []);

  async function openPatient(patient) {
    setSelectedPatient(patient);
    setShareDoctorId("");
    try {
      const data = await apiRequest(`/api/reports/patients/${patient.id}`);
      setReports(Array.isArray(data) ? data : data.reports || []);
    } catch (err) {
      try {
        const fresh = await apiRequest(`/patients/${patient.id}`);
        setSelectedPatient(fresh);
        setReports(fresh.reports || []);
      } catch (innerErr) {
        notify(innerErr.message || err.message, "error");
        setReports([]);
      }
    }
  }

  async function sharePatient() {
    if (!selectedPatient || !shareDoctorId) return;
    try {
      const data = await apiRequest(`/api/patients/${selectedPatient.id}/share`, {
        method: "POST",
        body: JSON.stringify({ doctor_id: Number(shareDoctorId) }),
      });
      notify(data.message || "Patient shared.");
      setSelectedPatient(data.patient);
      loadPatients();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const filteredPatients = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    const text = `${p.full_name || ""} ${getPatientReference(p)} ${getPatientGender(p)} ${getPatientAge(p)}`.toLowerCase();
    const matchesSearch = !q || text.includes(q);
    const gender = String(getPatientGender(p)).toLowerCase();
    const matchesGender = genderFilter === "all" || gender.includes(genderFilter);
    return matchesSearch && matchesGender;
  });

  const doctors = users.filter((u) => u.role === "doctor" && u.id !== selectedPatient?.assigned_doctor_id);
  const sharedCount = patients.filter((p) => Array.isArray(p.shared_doctors) && p.shared_doctors.length).length;
  const noReferenceCount = patients.filter((p) => !getPatientReference(p) || getPatientReference(p) === "No reference").length;
  const recentCount = filteredPatients.length;

  return (
    <>
      <PageHeader eyebrow="Patient case management" title="Saved patient cases">
        <button className="btn gold" onClick={() => setScreen("new-case")}><Icon name="plus" /> Create New Case</button>
        <button className="btn outline" onClick={loadPatients}><Icon name="refresh" /> {loading ? "Loading..." : "Refresh"}</button>
      </PageHeader>

      <section className="patient-cases-hero card">
        <div className="patient-cases-hero-copy">
          <span className="patient-cases-hero-icon"><Icon name="users" /></span>
          <div>
            <p className="eyebrow">Clinical case directory</p>
            <h3>Manage patient cases, reports and sharing from one place.</h3>
            <p className="muted">Search saved cases, open the report builder, review uploaded reports, and share access with another doctor.</p>
          </div>
        </div>
        <div className="patient-cases-hero-actions">
          <button className="btn gold" onClick={() => setScreen("new-case")}><Icon name="plus" /> New case</button>
          <button className="btn outline" onClick={() => selectedPatient ? setScreen(`report-builder:${selectedPatient.id}:new`) : setScreen("report-builder")}><Icon name="report" /> Report builder</button>
        </div>
      </section>

      <div className="patient-case-stats">
        <section className="case-stat-card"><span><Icon name="users" size={17} /> Total cases</span><strong>{patients.length}</strong><p>All patient cases available to this account.</p></section>
        <section className="case-stat-card"><span><Icon name="check" size={17} /> Shared</span><strong>{sharedCount}</strong><p>Cases already shared with other doctors.</p></section>
        <section className="case-stat-card"><span><Icon name="file" size={17} /> Reports</span><strong>{reports.length}</strong><p>Reports for the selected patient case.</p></section>
        <section className="case-stat-card"><span><Icon name="alert" size={17} /> Missing ref</span><strong>{noReferenceCount}</strong><p>Cases without a reference number.</p></section>
      </div>

      <div className="cases-grid polished-cases-grid">
        <section className="card case-directory-panel">
          <div className="case-directory-head">
            <div>
              <h3>Cases</h3>
              <p className="muted small">{recentCount} matching case{recentCount === 1 ? "" : "s"}</p>
            </div>
            <StatusPill>{filteredPatients.length}</StatusPill>
          </div>

          <div className="case-directory-tools">
            <label className="case-search-box">
              <Icon name="search" size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by patient name or reference..." />
            </label>
            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
              <option value="all">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="case-list polished-case-list">
            {filteredPatients.map((p) => (
              <button key={p.id} className={`case-card polished-case-card ${selectedPatient?.id === p.id ? "selected" : ""}`} onClick={() => openPatient(p)}>
                <span className="case-card-avatar">{getPatientInitials(p)}</span>
                <span className="case-card-main">
                  <strong>{p.full_name || "Unnamed patient"}</strong>
                  <small>{getPatientReference(p)} · {getPatientGender(p)} · {getPatientAge(p)}</small>
                  <em>{p.shared_doctors?.length ? `Shared with ${p.shared_doctors.length} doctor(s)` : "Not shared"}</em>
                </span>
                <span className="case-card-chevron">›</span>
              </button>
            ))}
          </div>
          {!filteredPatients.length && <EmptyState title="No cases found" text="Create a patient case or change your search/filter." />}
        </section>

        <section className="card case-detail polished-case-detail">
          {selectedPatient ? (
            <>
              <div className="patient-profile-banner">
                <div className="patient-large-avatar">{getPatientInitials(selectedPatient)}</div>
                <div className="patient-profile-main">
                  <p className="eyebrow">Selected case</p>
                  <h3>{selectedPatient.full_name || "Unnamed patient"}</h3>
                  <p className="muted">{getPatientReference(selectedPatient)} · {getPatientGender(selectedPatient)} · {getPatientAge(selectedPatient)}</p>
                </div>
                <div className="patient-profile-actions">
                  <StatusPill tone="success">{reports.length} report(s)</StatusPill>
                  <button className="btn gold" onClick={() => setScreen(`report-builder:${selectedPatient.id}:new`)}><Icon name="report" /> Create / Merge Report</button>
                </div>
              </div>

              <div className="patient-info-grid">
                <div><span>Reference</span><strong>{getPatientReference(selectedPatient)}</strong></div>
                <div><span>Gender</span><strong>{getPatientGender(selectedPatient)}</strong></div>
                <div><span>Age</span><strong>{getPatientAge(selectedPatient)}</strong></div>
                <div><span>Created</span><strong>{safeDate(selectedPatient.created_at)}</strong></div>
              </div>

              {(user.role === "admin" || user.role === "doctor") && (
                <div className="share-box polished-share-box">
                  <div className="share-box-head">
                    <span className="dashboard-title-icon"><Icon name="users" size={18} /></span>
                    <div>
                      <h4>Share this case with another doctor</h4>
                      <p className="muted small">Give another doctor access to this patient case.</p>
                    </div>
                  </div>
                  <div className="inline-form">
                    <select value={shareDoctorId} onChange={(e) => setShareDoctorId(e.target.value)}>
                      <option value="">Choose doctor</option>
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} · {d.email}</option>)}
                    </select>
                    <button className="btn outline" onClick={sharePatient}><Icon name="users" /> Share Case</button>
                  </div>
                  {selectedPatient.shared_doctors?.length ? (
                    <div className="shared-list">
                      {selectedPatient.shared_doctors.map((d) => <StatusPill key={d.id}>{d.full_name}</StatusPill>)}
                    </div>
                  ) : <p className="muted small">This case has not been shared with another doctor.</p>}
                </div>
              )}

              <div className="report-list-head polished-report-head">
                <div>
                  <h4>Reports for this case</h4>
                  <p className="muted small">Open an existing report or create a new merged report.</p>
                </div>
                {(user.role === "admin" || user.role === "doctor") && (
                  <button className="btn gold" onClick={() => setScreen(`report-builder:${selectedPatient.id}:new`)}><Icon name="spark" /> Create / Merge Report</button>
                )}
              </div>

              <div className="report-tiles polished-report-tiles">
                {reports.map((r) => {
                  const status = getReportStatus(r);
                  return (
                    <button key={r.id} className="report-tile polished-report-tile" onClick={() => setScreen(`report-builder:${selectedPatient.id}:${r.id}`)}>
                      <span className="report-tile-icon"><Icon name="file" /></span>
                      <span>
                        <strong>{r.original_filename || r.title || "Medical report"}</strong>
                        <small>{r.page_count || "Unknown"} pages · {safeDate(r.created_at || r.updated_at)}</small>
                        <em>{r.doctor_opinion ? "Doctor opinion added" : "No doctor opinion yet"}</em>
                      </span>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </button>
                  );
                })}
              </div>

              {!reports.length && <EmptyState title="No reports yet" text="Open the report builder to upload one or more PDF reports and create an editable final report." />}
            </>
          ) : (
            <div className="case-empty-panel">
              <span className="case-empty-icon"><Icon name="users" /></span>
              <h3>Select a case</h3>
              <p className="muted">Choose a patient case to view reports, share access, or create a final report.</p>
              <div className="row-actions">
                <button className="btn gold" onClick={() => setScreen("new-case")}><Icon name="plus" /> Create New Case</button>
                <button className="btn outline" onClick={() => setScreen("report-builder")}><Icon name="report" /> Open Builder</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {screenStartsWithReportBuilder(setScreen) ? null : null}
    </>
  );
}

function screenStartsWithReportBuilder() {
  return false;
}

function CreateCasePage({ user, notify, setScreen }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    full_name: "",
    age: "",
    gender: "",
    date_of_birth: "",
    patient_reference: "",
    notes: "",
    assigned_doctor_id: "",
    user_id: "",
  });

  useEffect(() => {
    if (user.role === "admin") {
      apiRequest("/api/users").then(setUsers).catch(() => setUsers([]));
    }
  }, [user.role]);

  async function submit(e) {
    e.preventDefault();
    try {
      const body = {
        full_name: form.full_name,
        age: form.age ? String(form.age) : "",
        gender: form.gender || "",
        reference: form.patient_reference || "",
        patient_reference: form.patient_reference || "",
        date_of_birth: form.date_of_birth || "",
        notes: form.notes || "",
        assigned_doctor_id: form.assigned_doctor_id ? Number(form.assigned_doctor_id) : null,
        user_id: form.user_id ? Number(form.user_id) : null,
      };
      await apiRequest("/api/patients", { method: "POST", body: JSON.stringify(body) });
      notify("Patient case created.");
      setScreen("cases");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const doctors = users.filter((u) => u.role === "doctor");
  const patientUsers = users.filter((u) => u.role === "patient");
  const completedFields = [form.full_name, form.age, form.gender, form.date_of_birth, form.patient_reference, form.notes].filter(Boolean).length;
  const completionPercent = Math.round((completedFields / 6) * 100);
  const patientInitials = (form.full_name || "New Patient")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <PageHeader
        eyebrow="Create case"
        title="New patient case"
        actions={(
          <>
            <button type="button" className="btn outline" onClick={() => setScreen("cases")}><Icon name="users" /> Back to cases</button>
            <button type="submit" form="create-patient-case-form" className="btn gold"><Icon name="plus" /> Create Case</button>
          </>
        )}
      />

      <section className="card create-case-hero">
        <div className="create-case-hero-icon"><Icon name="users" size={24} /></div>
        <div>
          <p className="eyebrow">Clinical case setup</p>
          <h3>Create a clean patient record before uploading source reports.</h3>
          <p className="muted">Add the patient identity, reference details and clinical notes. The case will then be available inside Patient Cases and Report Builder.</p>
        </div>
        <div className="create-case-progress" aria-label="case completion">
          <span>{completionPercent}%</span>
          <small>Case details filled</small>
          <div><i style={{ width: `${completionPercent}%` }} /></div>
        </div>
      </section>

      <div className="create-case-layout">
        <section className="card create-case-form-card">
          <div className="create-form-section-head">
            <span className="dashboard-title-icon"><Icon name="file" size={18} /></span>
            <div>
              <h3>Patient information</h3>
              <p className="muted small">Required identity fields and optional clinical context.</p>
            </div>
          </div>

          <form id="create-patient-case-form" className="create-case-form" onSubmit={submit}>
            <div className="create-form-grid">
              <Field label="Patient full name" hint="Use the same spelling as the source report when possible.">
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Mr Rasmus Friis" required />
              </Field>
              <Field label="Patient reference / ID" hint="Lab number, hospital number or internal reference.">
                <input value={form.patient_reference} onChange={(e) => setForm({ ...form, patient_reference: e.target.value })} placeholder="e.g. LPU30950" />
              </Field>
              <Field label="Age">
                <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="e.g. 51" />
              </Field>
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">Select gender</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Date of birth">
                <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
              </Field>
              <Field label="Clinical/admin notes" hint="These notes stay with the case and can guide report preparation.">
                <textarea rows="5" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Clinical indication, admin notes, patient context, or any important handling notes..." />
              </Field>
            </div>

            {user.role === "admin" && (
              <div className="create-admin-section">
                <div className="create-form-section-head compact">
                  <span className="dashboard-title-icon"><Icon name="account" size={16} /></span>
                  <div>
                    <h3>Admin assignment</h3>
                    <p className="muted small">Optional ownership and portal login connection.</p>
                  </div>
                </div>
                <div className="create-form-grid two">
                  <Field label="Assign doctor">
                    <select value={form.assigned_doctor_id} onChange={(e) => setForm({ ...form, assigned_doctor_id: e.target.value })}>
                      <option value="">Choose doctor</option>
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </Field>
                  <Field label="Link patient login">
                    <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                      <option value="">No patient login</option>
                      {patientUsers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            <div className="create-case-actions">
              <button type="button" className="btn outline" onClick={() => setScreen("cases")}>Cancel</button>
              <button className="btn gold"><Icon name="plus" /> Create Case</button>
            </div>
          </form>
        </section>

        <aside className="create-case-side-panel">
          <section className="card patient-preview-card">
            <p className="eyebrow">Live case preview</p>
            <div className="preview-patient-top">
              <div className="preview-avatar">{patientInitials || "NP"}</div>
              <div>
                <h3>{form.full_name || "New patient"}</h3>
                <p>{form.patient_reference || "No reference yet"}</p>
              </div>
            </div>
            <div className="preview-detail-list">
              <span><small>Age</small><strong>{form.age || "Not set"}</strong></span>
              <span><small>Gender</small><strong>{form.gender || "Not set"}</strong></span>
              <span><small>Date of birth</small><strong>{form.date_of_birth || "Not set"}</strong></span>
              <span><small>Notes</small><strong>{form.notes ? "Added" : "Empty"}</strong></span>
            </div>
          </section>

          <section className="card create-next-steps-card">
            <h3>After creating the case</h3>
            <div className="next-step-row"><span><Icon name="check" size={15} /></span><p>Open the report builder for this patient.</p></div>
            <div className="next-step-row"><span><Icon name="upload" size={15} /></span><p>Upload one or more source PDFs.</p></div>
            <div className="next-step-row"><span><Icon name="report" size={15} /></span><p>Generate, edit and print the final report.</p></div>
          </section>
        </aside>
      </div>
    </>
  );
}

function ReportBuilderPage({ patientId, reportId, user, notify, setScreen }) {
  const [patient, setPatient] = useState(null);
  const [report, setReport] = useState(null);
  const [editable, setEditable] = useState(null);
  const [files, setFiles] = useState([]);
  const [sourceFiles, setSourceFiles] = useState([]);
  const backendSourceInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  function normaliseReportResponse(data) {
    return data?.report || data;
  }

  async function load() {
    try {
      const p = await apiRequest(`/api/patients/${patientId}`);
      setPatient(p);
      if (reportId !== "new") {
        const r = normaliseReportResponse(await apiRequest(`/api/reports/${reportId}`));
        setReport(r);
        setSourceFiles(Array.isArray(r.source_files) ? r.source_files : []);
        setEditable(safeReport(r.editable_report || r.structured_report || r, p));
      } else {
        setSourceFiles([]);
        setEditable(safeReport(null, p));
      }
    } catch (err) {
      notify(err.message, "error");
      setScreen("cases");
    }
  }

  useEffect(() => {
    load();
  }, [patientId, reportId]);

  function setBackendSelectedReportFiles(fileList) {
    setFiles(Array.from(fileList || []));
  }

  function openBackendSourcePicker(e) {
    e.preventDefault();
    e.stopPropagation();
    backendSourceInputRef.current?.click();
  }

  function handleBackendDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setBackendSelectedReportFiles(e.dataTransfer?.files);
  }

  async function uploadAndMerge(e) {
    e.preventDefault();
    if (!files.length) {
      notify("Choose one or more PDF files first.", "error");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("files", file));
      if (report?.id) form.append("report_id", String(report.id));

      let data;
      try {
        form.append("use_ocr", "false");
        data = await apiRequest(`/api/reports/patients/${patientId}/upload-pdfs`, {
          method: "POST",
          body: form,
        });
      } catch (legacyErr) {
        const modernForm = new FormData();
        modernForm.append("patient_id", String(patientId));
        if (report?.id) modernForm.append("report_id", String(report.id));
        Array.from(files).forEach((file) => modernForm.append("files", file));
        data = await apiRequest("/reports/upload-multiple", {
          method: "POST",
          body: modernForm,
        });
      }

      const mergedReport = normaliseReportResponse(data);
      const reportIdFromResponse = mergedReport?.id || data?.report_id;

      let fresh = mergedReport;
      if (reportIdFromResponse) {
        fresh = normaliseReportResponse(await apiRequest(`/api/reports/${reportIdFromResponse}`));
      }

      setReport(fresh);
      setSourceFiles(Array.isArray(fresh.source_files) ? fresh.source_files : []);
      setEditable(safeReport(fresh.editable_report || fresh.structured_report || fresh, patient));
      setFiles([]);
      if (backendSourceInputRef.current) backendSourceInputRef.current.value = "";
      notify(report?.id ? "New PDF file(s) added. The merged report has been rebuilt with the previous PDFs kept." : "PDF reports merged. Exact selectable text and preserved medical images are now in the editable report.");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function updatePatientField(key, value) {
    setEditable((prev) => ({ ...prev, patient: { ...(prev.patient || {}), [key]: value } }));
  }

  function updateSection(index, key, value) {
    setEditable((prev) => {
      const sections = [...(prev.sections || [])];
      sections[index] = { ...sections[index], [key]: value };
      return { ...prev, sections };
    });
  }

  function addSection() {
    setEditable((prev) => ({
      ...prev,
      sections: [...(prev.sections || []), { id: `section_${Date.now()}`, title: "New Section", type: "text", content: "", images: [] }],
    }));
  }

  function removeSection(index) {
    setEditable((prev) => ({
      ...prev,
      sections: (prev.sections || []).filter((_, i) => i !== index),
    }));
  }

  function moveSection(index, direction) {
    setEditable((prev) => {
      const sections = [...(prev.sections || [])];
      const target = index + direction;
      if (target < 0 || target >= sections.length) return prev;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...prev, sections };
    });
  }



  function moveSectionToIndex(fromIndex, toIndex) {
    setEditable((prev) => {
      const sections = [...(prev.sections || [])];
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= sections.length || toIndex >= sections.length) return prev;
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { ...prev, sections };
    });
  }

  function handleSectionDragStart(index, event) {
    setDraggingSectionIndex(index);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleSectionDrop(index, event) {
    event.preventDefault();
    const storedIndex = event?.dataTransfer?.getData("text/plain");
    const fromIndex = Number.isFinite(draggingSectionIndex) ? draggingSectionIndex : Number(storedIndex);
    if (!Number.isFinite(fromIndex)) return;
    moveSectionToIndex(fromIndex, index);
    setDraggingSectionIndex(null);
  }
  async function printReport() {
    if (report?.id) {
      try {
        await saveDraft(report.status || "draft");
      } catch {
        // The browser print view can still be used if saving fails.
      }
    }
    window.print();
  }

  async function saveDraft(status = "draft") {
    if (!report?.id) {
      notify("Upload at least one PDF first, then save the report.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        editable_report: editable,
        doctor_opinion: editable.doctor_opinion || "",
        status,
      };

      let data;
      try {
        data = await apiRequest(`/api/reports/${report.id}/editable`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } catch (legacyErr) {
        data = await apiRequest(`/reports/${report.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }

      const saved = normaliseReportResponse(data);
      setReport(saved);
      setSourceFiles(Array.isArray(saved.source_files) ? saved.source_files : sourceFiles);
      setEditable(safeReport(saved.editable_report || saved.structured_report || saved, patient));
      notify(status === "final" ? "Final report saved." : "Draft saved.");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function generateAiDraft() {
    if (!report?.id) {
      notify("Upload and merge at least one PDF first, then use the AI brain.", "error");
      return;
    }
    setAiBusy(true);
    try {
      // Save the current manual state first, so AI keeps the latest doctor opinion and edits.
      await saveDraft(report.status || "draft");
      const data = await apiRequest(`/api/reports/${report.id}/ai-enhance`, {
        method: "POST",
        body: JSON.stringify({ mode: "organise_without_losing_source_text" }),
      });
      const aiReport = normaliseReportResponse(data);
      setReport(aiReport);
      setSourceFiles(Array.isArray(aiReport.source_files) ? aiReport.source_files : sourceFiles);
      setEditable(safeReport(aiReport.editable_report || aiReport.structured_report || aiReport, patient));
      notify("AI brain generated an organised editable draft while preserving the original extracted source text and images.");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setAiBusy(false);
    }
  }

  async function downloadWord() {
    if (!report?.id) {
      notify("Save or upload a report first.", "error");
      return;
    }
    try {
      await saveDraft(report.status || "draft");
      await downloadServerFile(`/api/reports/${report.id}/download-word`, `MediReport-${patient.full_name || "patient"}.docx`);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function downloadPdf() {
    if (!report?.id) {
      notify("Save or upload a report first.", "error");
      return;
    }
    try {
      await saveDraft(report.status || "draft");
      notify("Opening the designed report. Choose 'Save as PDF' in the print dialog.");
      setTimeout(() => window.print(), 120);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function removeSourceFile(sourceId) {
    if (!report?.id || !sourceId) return;
    const ok = window.confirm("Remove this PDF from the managed source list and rebuild the merged report?");
    if (!ok) return;
    setBusy(true);
    try {
      const data = await apiRequest(`/api/reports/${report.id}/source-files/${sourceId}`, { method: "DELETE" });
      const updated = normaliseReportResponse(data);
      setReport(updated);
      setSourceFiles(Array.isArray(updated.source_files) ? updated.source_files : []);
      setEditable(safeReport(updated.editable_report || updated.structured_report || updated, patient));
      notify("PDF removed. The merged report was rebuilt from the remaining files.");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!editable || !patient) {
    return <section className="card"><EmptyState title="Loading report builder" text="Preparing report workspace..." /></section>;
  }

  const previewHtml = reportToHtml(editable);
  const galleryImages = (editable.images || []).map((img) => ({ ...img, url: imageUrl(img) })).filter((img) => img.url);

  return (
    <>
      <header className="builder-topbar no-print">
        <div>
          <div className="breadcrumb">Dashboard <span>›</span> Report Builder</div>
          <h1>Editable Report Builder <Icon name="spark" size={22} /></h1>
          <p>Create, structure and refine AI-powered medical reports with ease.</p>
        </div>
        <div className="builder-actions">
          <button className="builder-btn" onClick={() => saveDraft("draft")} disabled={saving}><Icon name="save" />{saving ? "Saving..." : "Save Draft"}</button>
          <button className="builder-btn gold" onClick={generateAiDraft} disabled={aiBusy || !report?.id}><Icon name="spark" />{aiBusy ? "Generating..." : "Analyze PDFs"}</button>
          <button className="builder-btn" onClick={downloadPdf}><Icon name="download" />Download</button>
          <button className="builder-btn" onClick={printReport}>Print</button>
          <button className="builder-menu" onClick={() => setScreen("cases")} title="Back to cases"><Icon name="menu" /></button>
        </div>
      </header>

      <div className="reference-builder-grid">
        <aside className="builder-left report-builder-toolbox no-print">
          <div className="toolbox-header"><span className="toolbox-kicker">Doctor Toolbox</span><strong>Report controls</strong><small>Upload, arrange and manage report content while you scroll.</small></div>
          <section className="builder-step-card">
            <div className="step-head">
              <span className="step-number">1</span>
              <div>
                <h3>Upload Source Reports</h3>
                <p>Upload one or more source files to let AI extract and organise key findings.</p>
              </div>
            </div>
            <form className="reference-upload" onSubmit={uploadAndMerge}>
              <label className="drop-target" onDragOver={(e) => e.preventDefault()} onDrop={handleBackendDrop}>
                <input ref={backendSourceInputRef} type="file" accept="application/pdf,.pdf" multiple onChange={(e) => setBackendSelectedReportFiles(e.target.files)} />
                <span className="upload-cloud"><Icon name="upload" size={28} /></span>
                <strong>Drag & drop files here</strong>
                <button type="button" className="choose-file-btn" onClick={openBackendSourcePicker}>Choose Files</button>
                <small>{files.length ? `${files.length} PDF file(s) selected` : "Supports PDF files. JPG/PNG/DOCX require backend support."}</small>
              </label>
              <button className="btn gold full" disabled={busy}>{busy ? "Processing..." : (report?.id ? "Add Files" : "Upload Files")}</button>
            </form>

            <div className="recent-upload-head">
              <strong>Recent uploads</strong>
              <span>{sourceFiles.length ? "Manage" : "Empty"}</span>
            </div>
            <div className="recent-upload-list">
              {sourceFiles.length ? sourceFiles.map((source, index) => (
                <div className="recent-upload-row" key={source.id || `${source.original_filename}-${index}`}>
                  <Icon name="file" />
                  <div>
                    <strong>{source.original_filename || source.stored_filename || "Uploaded PDF"}</strong>
                    <span>{source.page_count || 0} pages · {source.file_size ? `${Math.round(source.file_size / 1024)} KB` : "saved"}</span>
                  </div>
                  <button type="button" onClick={() => removeSourceFile(source.id)} disabled={busy}>Remove</button>
                </div>
              )) : (
                <div className="recent-upload-empty">Uploaded reports will appear here for viewing and management.</div>
              )}
            </div>
          </section>

          <section className="builder-step-card compact-step">
            <div className="step-head split">
              <div className="step-head-main">
                <span className="step-number">2</span>
                <div>
                  <h3>AI Structuring</h3>
                  <p>Backend AI can structure the final clinical narrative after the source PDFs are saved.</p>
                </div>
              </div>
              <button className="mini-ai-btn" onClick={generateAiDraft} disabled={aiBusy || !report?.id}><Icon name="spark" />Analyze PDFs</button>
            </div>
          </section>

          <section className="builder-step-card">
            <div className="step-head">
              <span className="step-number">3</span>
              <div>
                <h3>Report Sections</h3>
                <p>Review, reorder and edit each section of your report.</p>
              </div>
            </div>
            <div className="section-reorder-list">
              <button className="section-pill active" onClick={() => document.getElementById("doctor-opinion")?.focus()}><Icon name="grip" size={16} /> Doctor Opinion <span>Required</span></button>
              {(editable.sections || []).map((section, index) => (
                <div
                  className={`section-pill ${draggingSectionIndex === index ? "dragging" : ""}`}
                  key={section.id || index}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleSectionDrop(index, e)}
                >
                  <span
                    className="section-drag-handle"
                    draggable
                    onDragStart={(e) => handleSectionDragStart(index, e)}
                    onDragEnd={() => setDraggingSectionIndex(null)}
                    title="Drag to reorder"
                  >
                    <Icon name="grip" size={16} />
                  </span>
                  {section.type === "tables" || section.type === "source_notes" ? <strong>{section.title || "Source Report Section"}</strong> : <input value={section.title || "Untitled Section"} onChange={(e) => updateSection(index, "title", e.target.value)} />}
                  {section.type === "tables" || section.type === "source_notes" ? null : <button type="button" onClick={() => removeSection(index)} aria-label="Remove section">×</button>}
                </div>
              ))}
              <button className="add-section-btn" onClick={addSection}><Icon name="plus" size={16} />Add Section</button>
            </div>
          </section>
        </aside>

        <section className="live-editor-card" id="printable-report">
          <div className="live-editor-head no-print">
            <div className="live-title"><Icon name="spark" size={18} /><strong>Live Report Editor</strong><span className="green-dot" /> <small>All changes are saved when you use Save Draft or Download.</small></div>
            <button className="tips-btn">Tips</button>
          </div>
          <ReportEditorToolbar />

          <article className="report-paper">
            <ReportCoverPage patient={patient || editable.patient || {}} report={report || editable} editable={editable} setEditable={setEditable} user={user} />
            <ReportExaminationsPage editable={editable} report={report || editable}/>

            <EditableReportBlock
              id="doctor-opinion"
              required
              title="Doctor Opinion"
              value={editable.doctor_opinion || ""}
              placeholder="Click here to add doctor opinion..."
              onChange={(value) => setEditable({ ...editable, doctor_opinion: value })}
            />

            {(editable.sections || []).filter((section) => !["source_text", "images"].includes(String(section.type || "").toLowerCase())).map((section, index) => (
              <EditableReportBlock
                key={section.id || index}
                title={section.title || `Section ${index + 1}`}
                value={section.content || ""}
                placeholder={`Click here to write ${section.title || "this section"}...`}
                dragHandleProps={{
                  onDragStart: (e) => handleSectionDragStart(index, e),
                  onDragEnd: () => setDraggingSectionIndex(null),
                }}
                onDropSection={(e) => handleSectionDrop(index, e)}
                onChange={(value) => updateSection(index, "content", value)}
              >
                {section.type === "tables" ? <div className="live-table-preview" dangerouslySetInnerHTML={{ __html: renderLabTablesHtml(section, (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#039;" }[c]))) }} /> : null}
              </EditableReportBlock>
            ))}
            <section className="attached-media-block">
              <h3>Attached Media <span>(Images)</span></h3>
              <div className="attached-media-grid">
                <button className="add-image-card no-print" type="button"><Icon name="plus" />Add Images</button>
                {galleryImages.length ? galleryImages.slice(0, 4).map((img, idx) => <img key={`${img.url}-${idx}`} src={img.url} alt={img.filename || `image ${idx + 1}`} />) : [0,1,2,3].map((i) => <div className="image-placeholder" key={i}><Icon name="image" size={34} /></div>)}
              </div>
            </section>

            <EditableReportBlock
              title="Limitations"
              value={editable.limitations || ""}
              placeholder="Add limitations or footer note..."
              onChange={(value) => setEditable({ ...editable, limitations: value })}
            />
          </article>

          <div className="editor-statusbar no-print">
            <span>Words: {(JSON.stringify(editable).match(/\b\w+\b/g) || []).length}</span>
            <span>Characters: {JSON.stringify(editable).length}</span>
            <span>100% ▾</span>
          </div>
        </section>
      </div>
    </>
  );
}


function getActiveReportTextarea() {
  const active = document.activeElement;
  if (!active || active.tagName !== "TEXTAREA") return null;
  if (!active.classList.contains("rich-report-textarea")) return null;
  return active;
}

function dispatchTextareaInput(textarea, nextValue, nextStart, nextEnd) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(textarea, nextValue);
  else textarea.value = nextValue;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  requestAnimationFrame(() => {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(nextStart, nextEnd ?? nextStart);
  });
}

function selectedTextareaRange(textarea) {
  return {
    start: textarea.selectionStart ?? 0,
    end: textarea.selectionEnd ?? textarea.selectionStart ?? 0,
    value: textarea.value || "",
  };
}

function expandToCurrentLine(value, start, end) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd, text: value.slice(lineStart, lineEnd) };
}

function applyReportEditorCommand(command) {
  const textarea = getActiveReportTextarea();
  if (!textarea) return;
  const { start, end, value } = selectedTextareaRange(textarea);
  const selected = value.slice(start, end);
  let next = value;
  let nextStart = start;
  let nextEnd = end;

  const replaceSelection = (text, cursorOffsetStart = text.length, cursorOffsetEnd = cursorOffsetStart) => {
    next = value.slice(0, start) + text + value.slice(end);
    nextStart = start + cursorOffsetStart;
    nextEnd = start + cursorOffsetEnd;
  };

  if (command === "bold") {
    const body = selected || "important text";
    replaceSelection(`**${body}**`, 2, 2 + body.length);
  } else if (command === "italic") {
    const body = selected || "clinical note";
    replaceSelection(`_${body}_`, 1, 1 + body.length);
  } else if (command === "underline") {
    const body = selected || "underlined text";
    replaceSelection(`<u>${body}</u>`, 3, 3 + body.length);
  } else if (command === "bullet") {
    const { lineStart, lineEnd, text } = expandToCurrentLine(value, start, end);
    const lines = (selected || text || "New point").split("\n").map((line) => line.trim() ? `• ${line.replace(/^[-•\d.)\s]+/, "")}` : "• ");
    const joined = lines.join("\n");
    if (selected) replaceSelection(joined, joined.length, joined.length);
    else {
      next = value.slice(0, lineStart) + joined + value.slice(lineEnd);
      nextStart = lineStart + joined.length;
      nextEnd = nextStart;
    }
  } else if (command === "number") {
    const { lineStart, lineEnd, text } = expandToCurrentLine(value, start, end);
    const lines = (selected || text || "New item").split("\n").map((line, i) => `${i + 1}. ${line.replace(/^[-•\d.)\s]+/, "")}`);
    const joined = lines.join("\n");
    if (selected) replaceSelection(joined, joined.length, joined.length);
    else {
      next = value.slice(0, lineStart) + joined + value.slice(lineEnd);
      nextStart = lineStart + joined.length;
      nextEnd = nextStart;
    }
  } else if (command === "heading") {
    const { lineStart, lineEnd, text } = expandToCurrentLine(value, start, end);
    const heading = (selected || text || "Section heading").replace(/^#+\s*/, "").trim().toUpperCase();
    const replacement = `## ${heading}`;
    if (selected) replaceSelection(replacement, replacement.length, replacement.length);
    else {
      next = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
      nextStart = lineStart + replacement.length;
      nextEnd = nextStart;
    }
  } else if (command === "normal") {
    const { lineStart, lineEnd, text } = expandToCurrentLine(value, start, end);
    const replacement = text.replace(/^#+\s*/, "");
    next = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    nextStart = lineStart + replacement.length;
    nextEnd = nextStart;
  } else if (command === "clear") {
    const body = selected
      .replace(/\*\*/g, "")
      .replace(/_/g, "")
      .replace(/<\/?u>/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/^\s*[•-]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "");
    replaceSelection(body, body.length, body.length);
  } else if (command === "template-normal") {
    replaceSelection("Findings:\n• \n\nImpression:\n• \n\nRecommendation:\n• ", 12, 12);
  } else if (command === "undo") {
    document.execCommand("undo");
    return;
  } else if (command === "redo") {
    document.execCommand("redo");
    return;
  }

  dispatchTextareaInput(textarea, next, nextStart, nextEnd);
}

function ReportEditorToolbar() {
  const run = (command) => (event) => {
    event.preventDefault();
    applyReportEditorCommand(command);
  };
  return (
    <div className="editor-toolbar report-writing-toolbar no-print" role="toolbar" aria-label="Report writing toolbar">
      <select
        aria-label="Text style"
        defaultValue="paragraph"
        onMouseDown={(event) => event.preventDefault()}
        onChange={(event) => {
          applyReportEditorCommand(event.target.value === "heading" ? "heading" : "normal");
          event.target.value = "paragraph";
        }}
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading">Heading</option>
        <option value="normal">Normal text</option>
      </select>
      <button type="button" title="Bold" onMouseDown={run("bold")}><strong>B</strong></button>
      <button type="button" title="Italic" onMouseDown={run("italic")}><em>I</em></button>
      <button type="button" title="Underline" onMouseDown={run("underline")}><u>U</u></button>
      <span className="toolbar-sep" />
      <button type="button" title="Bullet list" onMouseDown={run("bullet")}>• List</button>
      <button type="button" title="Numbered list" onMouseDown={run("number")}>1. List</button>
      <button type="button" title="Clinical note template" onMouseDown={run("template-normal")}>Template</button>
      <span className="toolbar-sep" />
      <button type="button" title="Clear formatting from selection" onMouseDown={run("clear")}>Clear</button>
      <button type="button" title="Undo" onMouseDown={run("undo")}>↶</button>
      <button type="button" title="Redo" onMouseDown={run("redo")}>↷</button>
    </div>
  );
}

function AutoResizeTextarea({ id, value, placeholder, onChange }) {
  const textareaRef = useRef(null);
  const [draft, setDraft] = useState(value || "");
  const focusedRef = useRef(false);
  const selectionRef = useRef({ start: 0, end: 0 });

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(92, textarea.scrollHeight)}px`;
  }

  useEffect(() => {
    if (!focusedRef.current && (value || "") !== draft) {
      setDraft(value || "");
    }
  }, [value]);

  useEffect(() => {
    resizeTextarea();
  }, [draft]);

  function rememberSelection(event) {
    const target = event.currentTarget;
    selectionRef.current = {
      start: target.selectionStart || 0,
      end: target.selectionEnd || target.selectionStart || 0,
    };
  }

  function handleInput(event) {
    const nextValue = event.currentTarget.value;
    rememberSelection(event);
    setDraft(nextValue);
    onChange?.(nextValue);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea || document.activeElement !== textarea) return;
      const { start, end } = selectionRef.current;
      textarea.setSelectionRange(start, end);
      resizeTextarea();
    });
  }

  return (
    <textarea
      ref={textareaRef}
      id={id}
      className="rich-report-textarea"
      value={draft}
      placeholder={placeholder}
      rows={1}
      dir="ltr"
      spellCheck="true"
      autoCapitalize="sentences"
      onFocus={(event) => { focusedRef.current = true; rememberSelection(event); }}
      onBlur={() => { focusedRef.current = false; }}
      onInput={handleInput}
      onSelect={rememberSelection}
      onClick={rememberSelection}
      onKeyUp={rememberSelection}
      onChange={() => {}}
    />
  );
}

function EditableReportBlock({ id, title, value, placeholder, onChange, required, children, dragHandleProps, onDropSection }) {
  return (
    <section
      className="live-section-block"
      onDragOver={onDropSection ? (event) => event.preventDefault() : undefined}
      onDrop={onDropSection}
    >
      <div className="section-drag-tools no-print">
        {dragHandleProps ? (
          <button
            type="button"
            className="mouse-drag-handle"
            draggable
            title="Drag to reorder"
            {...dragHandleProps}
          >
            ⋮⋮
          </button>
        ) : (
          <Icon name="grip" size={18} />
        )}
      </div>
      <h3>{title} {required ? <span>Required</span> : null}</h3>
      <AutoResizeTextarea id={id} value={value} placeholder={placeholder} onChange={onChange} />
      {children}
    </section>
  );
}

function AdminControl({ notify }) {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [doctorForm, setDoctorForm] = useState({ full_name: "", email: "", password: "" });
  const [patientForm, setPatientForm] = useState({ full_name: "", email: "", password: "" });

  async function load() {
    try {
      let allUsers = [];
      let pending = [];

      try {
        allUsers = await apiRequest("/api/users");
      } catch {
        const doctors = await apiRequest("/auth/doctors").catch(() => []);
        pending = await apiRequest("/auth/pending-doctors").catch(() => []);
        allUsers = [...doctors, ...pending].filter((u, index, arr) => arr.findIndex((x) => x.id === u.id) === index);
      }

      try {
        pending = await apiRequest("/api/doctor-registrations");
      } catch {
        pending = await apiRequest("/auth/pending-doctors").catch(() => []);
      }

      setUsers(Array.isArray(allUsers) ? allUsers : []);
      setRequests(Array.isArray(pending) ? pending : []);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e, role) {
    e.preventDefault();
    const form = role === "doctor" ? doctorForm : patientForm;
    try {
      try {
        await apiRequest("/api/users", {
          method: "POST",
          body: JSON.stringify({ ...form, role, is_active: true }),
        });
      } catch {
        if (role !== "doctor") {
          throw new Error("This backend version does not support creating patient login accounts from the admin panel yet.");
        }
        await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({ ...form, role: "doctor" }),
        });
      }

      notify(role === "doctor" ? "Doctor account created. Approve it if it appears as pending." : "Patient account created.");
      if (role === "doctor") setDoctorForm({ full_name: "", email: "", password: "" });
      else setPatientForm({ full_name: "", email: "", password: "" });
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function approve(id) {
    try {
      try {
        await apiRequest(`/api/doctor-registrations/${id}/approve`, { method: "POST" });
      } catch {
        await apiRequest(`/auth/approve-doctor/${id}`, { method: "POST" });
      }
      notify("Doctor approved and portal account created.");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function reject(id) {
    try {
      await apiRequest(`/api/doctor-registrations/${id}/reject`, { method: "POST" });
      notify("Doctor request rejected.");
      load();
    } catch (err) {
      notify("Reject is not supported by this backend version. You can leave the request unapproved.", "error");
    }
  }

  const pendingRequests = requests.filter((r) => r.status === "pending" || r.is_approved === false || r.is_approved === 0);

  return (
    <>
      <PageHeader eyebrow="Admin portal" title="Control centre" />
      <div className="panel-grid two">
        <section className="card">
          <h3>Pending doctor registrations</h3>
          <div className="request-list">
            {pendingRequests.map((r) => (
              <div className="request-card" key={r.id}>
                <strong>{r.full_name}</strong>
                <span>{r.email}</span>
                <small>{r.specialty || "No specialty"} · {r.licence_number || "No licence"}</small>
                <div className="row-actions">
                  <button className="btn gold" onClick={() => approve(r.id)}>Approve & Create Portal</button>
                  <button className="btn outline" onClick={() => reject(r.id)}>Reject</button>
                </div>
              </div>
            ))}
            {!pendingRequests.length && <p className="muted">No pending doctor requests.</p>}
          </div>
        </section>

        <section className="card">
          <h3>Create doctor manually</h3>
          <form className="form-grid" onSubmit={(e) => createUser(e, "doctor")}>
            <Field label="Full name"><input value={doctorForm.full_name} onChange={(e) => setDoctorForm({ ...doctorForm, full_name: e.target.value })} required /></Field>
            <Field label="Email"><input type="email" value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} required /></Field>
            <Field label="Password"><input type="password" value={doctorForm.password} onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} minLength={8} required /></Field>
            <button className="btn gold">Create Doctor</button>
          </form>
        </section>

        <section className="card">
          <h3>Create patient login</h3>
          <form className="form-grid" onSubmit={(e) => createUser(e, "patient")}>
            <Field label="Full name"><input value={patientForm.full_name} onChange={(e) => setPatientForm({ ...patientForm, full_name: e.target.value })} required /></Field>
            <Field label="Email"><input type="email" value={patientForm.email} onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })} required /></Field>
            <Field label="Password"><input type="password" value={patientForm.password} onChange={(e) => setPatientForm({ ...patientForm, password: e.target.value })} minLength={8} required /></Field>
            <button className="btn gold">Create Patient User</button>
          </form>
          <p className="muted small">Patient user creation depends on the backend route set. The main patient case system remains available from Create Case.</p>
        </section>

        <section className="card">
          <h3>Users</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>{users.map((u) => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.is_active === false ? "disabled" : u.is_approved === false ? "pending" : "active"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function AccountPage({ user, notify }) {
  const saved = getLocalProfile();
  const [profile, setProfile] = useState(() => ({
    full_name: saved.full_name || user.full_name || "",
    email: saved.email || user.email || "",
    phone: saved.phone || "",
    specialty: saved.specialty || "General physician",
    clinic: saved.clinic || "MediReport Pro Clinic",
    registration_no: saved.registration_no || "",
    signature_name: saved.signature_name || user.full_name || "",
    default_report_title: saved.default_report_title || "Medical Report",
    avatar: saved.avatar || "",
  }));
  const [current_password, setCurrent] = useState("");
  const [new_password, setNew] = useState("");
  const [confirm_password, setConfirm] = useState("");
  const fileRef = useRef(null);

  const initials = (profile.full_name || profile.email || "DR")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const passwordStrength = (() => {
    let score = 0;
    if (new_password.length >= 8) score += 1;
    if (/[A-Z]/.test(new_password)) score += 1;
    if (/[0-9]/.test(new_password)) score += 1;
    if (/[^A-Za-z0-9]/.test(new_password)) score += 1;
    if (!new_password) return { label: "Waiting", tone: "neutral", width: "8%" };
    if (score <= 1) return { label: "Weak", tone: "danger", width: "28%" };
    if (score <= 3) return { label: "Good", tone: "warning", width: "68%" };
    return { label: "Strong", tone: "success", width: "100%" };
  })();

  function updateProfileField(field, value) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file.", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Profile image should be smaller than 2MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((prev) => ({ ...prev, avatar: reader.result }));
      notify("Profile image added. Click Save Profile to keep it.");
    };
    reader.readAsDataURL(file);
  }

  function saveProfile(e) {
    e.preventDefault();
    const clean = {
      ...profile,
      full_name: profile.full_name.trim(),
      email: profile.email.trim(),
      phone: profile.phone.trim(),
      specialty: profile.specialty.trim(),
      clinic: profile.clinic.trim(),
      registration_no: profile.registration_no.trim(),
      signature_name: profile.signature_name.trim(),
      default_report_title: profile.default_report_title.trim(),
    };
    if (!clean.full_name) {
      notify("Name is required.", "error");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(clean.email)) {
      notify("Enter a valid email address.", "error");
      return;
    }
    setProfile(clean);
    saveLocalProfile(clean);
    notify("Profile details saved on this device.");
  }

  async function submit(e) {
    e.preventDefault();
    if (new_password !== confirm_password) {
      notify("New password and confirmation do not match.", "error");
      return;
    }
    try {
      const data = await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password, new_password }),
      });
      setStoredToken(data.access_token);
      setCurrent("");
      setNew("");
      setConfirm("");
      notify("Password changed.");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile settings"
        actions={<button className="btn outline" onClick={() => { setProfile({ full_name: user.full_name || "", email: user.email || "", phone: "", specialty: "General physician", clinic: "MediReport Pro Clinic", registration_no: "", signature_name: user.full_name || "", default_report_title: "Medical Report", avatar: "" }); saveLocalProfile({}); notify("Local profile customisation cleared."); }}><Icon name="refresh" size={17} /> Reset local profile</button>}
      />

      <section className="card account-edit-hero">
        <div className="account-edit-avatar-block">
          <button className="account-photo-button" type="button" onClick={() => fileRef.current?.click()}>
            {profile.avatar ? <img src={profile.avatar} alt="Doctor profile" /> : <span>{initials || "DR"}</span>}
            <em><Icon name="upload" size={16} /> Change photo</em>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
        </div>
        <div className="account-edit-hero-copy">
          <p className="eyebrow">Editable clinical profile</p>
          <h3>{profile.full_name || "Doctor profile"}</h3>
          <p className="muted">Update the name, email, profile image and professional details shown across the doctor workspace.</p>
          <div className="account-profile-tags">
            <span><Icon name="account" size={15} /> {profile.specialty || "Specialty not set"}</span>
            <span><Icon name="report" size={15} /> {profile.clinic || "Clinic not set"}</span>
            <span><Icon name="check" size={15} /> Active workspace</span>
          </div>
          <div className="account-hero-metrics">
            <div><Icon name="image" size={16} /><strong>{profile.avatar ? "Photo added" : "No photo"}</strong><small>Profile image</small></div>
            <div><Icon name="save" size={16} /><strong>{profile.signature_name || "Not set"}</strong><small>Signature name</small></div>
            <div><Icon name="report" size={16} /><strong>{profile.default_report_title || "Medical Report"}</strong><small>Default title</small></div>
          </div>
        </div>
      </section>

      <div className="account-edit-layout">
        <section className="card account-edit-card account-profile-editor-card">
          <div className="account-card-head">
            <span className="account-card-icon"><Icon name="account" size={19} /></span>
            <div>
              <h3>Edit profile</h3>
              <p className="muted small">These values are used visually in the frontend and sidebar.</p>
            </div>
          </div>

          <form className="account-edit-form" onSubmit={saveProfile}>
            <div className="account-edit-hint-row">
              <span><Icon name="account" size={16} /> Identity</span>
              <span><Icon name="report" size={16} /> Report signature</span>
              <span><Icon name="image" size={16} /> Photo</span>
            </div>
            <div className="form-grid two account-icon-form">
              <Field label="Full name"><input value={profile.full_name} onChange={(e) => updateProfileField("full_name", e.target.value)} placeholder="Doctor full name" required /></Field>
              <Field label="Email"><input type="email" value={profile.email} onChange={(e) => updateProfileField("email", e.target.value)} placeholder="doctor@example.com" required /></Field>
              <Field label="Phone number"><input value={profile.phone} onChange={(e) => updateProfileField("phone", e.target.value)} placeholder="Optional phone number" /></Field>
              <Field label="Specialty"><input value={profile.specialty} onChange={(e) => updateProfileField("specialty", e.target.value)} placeholder="e.g. Radiologist" /></Field>
              <Field label="Clinic / workspace"><input value={profile.clinic} onChange={(e) => updateProfileField("clinic", e.target.value)} placeholder="Clinic or workspace name" /></Field>
              <Field label="Registration number"><input value={profile.registration_no} onChange={(e) => updateProfileField("registration_no", e.target.value)} placeholder="GMC / licence number" /></Field>
              <Field label="Signature display name"><input value={profile.signature_name} onChange={(e) => updateProfileField("signature_name", e.target.value)} placeholder="Name for report signature" /></Field>
              <Field label="Default report title"><input value={profile.default_report_title} onChange={(e) => updateProfileField("default_report_title", e.target.value)} placeholder="Medical Report" /></Field>
            </div>
            <div className="account-form-actions">
              <button className="btn gold"><Icon name="save" size={17} /> Save Profile</button>
              <button className="btn outline" type="button" onClick={() => fileRef.current?.click()}><Icon name="image" size={17} /> Upload Photo</button>
              {profile.avatar ? <button className="btn ghost" type="button" onClick={() => updateProfileField("avatar", "")}>Remove photo</button> : null}
            </div>
          </form>
        </section>

        <div className="account-right-rail">
        <aside className="card account-preview-card account-glass-card">
          <div className="account-card-head">
            <span className="account-card-icon"><Icon name="dashboard" size={19} /></span>
            <div>
              <h3>Profile preview</h3>
              <p className="muted small">How the account appears in the doctor workspace.</p>
            </div>
          </div>
          <div className="account-live-preview">
            <div className="account-live-avatar">{profile.avatar ? <img src={profile.avatar} alt="Profile preview" /> : initials || "DR"}</div>
            <strong>{profile.full_name || "Doctor profile"}</strong>
            <span>{profile.email || "No email"}</span>
            <div className="account-live-meta">
              <p><b>Specialty</b>{profile.specialty || "Not specified"}</p>
              <p><b>Clinic</b>{profile.clinic || "Not specified"}</p>
              <p><b>Registration</b>{profile.registration_no || "Not specified"}</p>
              <p><b>Report title</b>{profile.default_report_title || "Medical Report"}</p>
            </div>
          </div>
        </aside>

        <section className="card account-security-card account-glass-card">
          <div className="account-card-head">
            <span className="account-card-icon"><Icon name="check" size={19} /></span>
            <div>
              <h3>Change password</h3>
              <p className="muted small">Use at least 8 characters with a mix of letters, numbers and symbols.</p>
            </div>
          </div>

          <form className="account-password-form" onSubmit={submit}>
            <Field label="Current password"><input type="password" value={current_password} onChange={(e) => setCurrent(e.target.value)} required /></Field>
            <Field label="New password"><input type="password" value={new_password} onChange={(e) => setNew(e.target.value)} minLength={8} required /></Field>
            <Field label="Confirm new password"><input type="password" value={confirm_password} onChange={(e) => setConfirm(e.target.value)} minLength={8} required /></Field>

            <div className={`password-strength ${passwordStrength.tone}`}>
              <div className="password-strength-top"><span>Password strength</span><strong>{passwordStrength.label}</strong></div>
              <div className="password-strength-track"><span style={{ width: passwordStrength.width }} /></div>
            </div>

            <button className="btn gold"><Icon name="save" size={17} /> Update Password</button>
          </form>
        </section>

        <section className="card account-practical-card account-glass-card">
          <div className="account-card-head">
            <span className="account-card-icon"><Icon name="list" size={19} /></span>
            <div>
              <h3>Workspace details</h3>
              <p className="muted small">Useful profile data for report handover and account setup.</p>
            </div>
          </div>
          <div className="account-workspace-list">
            <div><Icon name="check" size={16} /><span><strong>Role</strong><small>{user.role}</small></span></div>
            <div><Icon name="report" size={16} /><span><strong>Report workflow</strong><small>Live editor + print-ready export</small></span></div>
            <div><Icon name="upload" size={16} /><span><strong>Source reports</strong><small>PDF upload, extraction and report builder</small></span></div>
            <div><Icon name="alert" size={16} /><span><strong>Clinical review</strong><small>Final report must be reviewed before handover</small></span></div>
          </div>
        </section>
        </div>
      </div>
    </>
  );
}

export default App;
