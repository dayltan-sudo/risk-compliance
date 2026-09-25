// FR10 — Export & Reporting. Real, downloadable output assembled entirely
// from already-stored results (never a second path to a value the pipeline
// didn't produce) — this replaces the earlier "no file is actually produced"
// placeholder.
//
// PDF uses jsPDF + jspdf-autotable. Excel uses hand-written SpreadsheetML
// (the Excel 2003 XML format): a single dependency-free .xls file Excel,
// LibreOffice, Numbers, and Google Sheets all open natively as a real
// multi-sheet workbook, with no third-party package in the dependency tree
// for it. (The obvious npm choice, `xlsx`, carries an unpatched high-severity
// advisory with no fix available; a maintained alternative, `exceljs`, pulls
// in ~100 transitive packages including an unpatched moderate advisory of
// its own for what is, here, a handful of flat tables — not worth either
// trade for a prototype export.)

import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type {
  ApprovalDecision,
  Assessment,
  CriterionInput,
  Customer,
  ExtractedField,
  IntegrityCheckResult,
  Rating,
  Ratio,
  RiskCommentary,
} from "../types";
import { INTEGRITY_CHECK_LABELS } from "../data/config";
import { formatCurrency, formatDate } from "./format";

export interface ExportBundle {
  customer: Customer;
  assessment: Assessment;
  extractedFields: ExtractedField[];
  criterionInputs: CriterionInput[];
  integrityChecks: IntegrityCheckResult[];
  ratios: Ratio[];
  rating: Rating | undefined;
  commentary: RiskCommentary | undefined;
  decisions: ApprovalDecision[];
}

function baseFileName(b: ExportBundle): string {
  const safeName = b.customer.name.replace(/[^a-z0-9]+/gi, "_");
  return `${safeName}_${b.assessment.division.replace(/[^a-z0-9]+/gi, "_")}_v${b.assessment.version}`;
}

function extractionModelVersions(fields: ExtractedField[]): string {
  return Array.from(new Set(fields.map((f) => f.extractionModelVersion).filter((v): v is string => !!v))).join(", ") || "n/a";
}

// --- PDF ---------------------------------------------------------------

export function exportAssessmentToPdf(b: ExportBundle): void {
  const doc = new jsPDF({ unit: "pt" });
  const margin = 40;
  let y = margin;

  doc.setFontSize(16);
  doc.text(`Credit Assessment — ${b.customer.name}`, margin, y);
  y += 20;
  doc.setFontSize(10);
  doc.text(
    `${b.assessment.division} · v${b.assessment.version} · ${b.assessment.state} · ${b.assessment.relationshipType}` +
      (b.assessment.periods.length ? ` · periods ${b.assessment.periods.join(", ")}` : ""),
    margin,
    y,
  );
  y += 14;
  // FR10.2 — extraction model version(s), scorecard version, export date, stamped on every export.
  doc.text(
    `Extraction model(s): ${extractionModelVersions(b.extractedFields)} · Scorecard: ${b.rating?.scorecardVersion ?? "n/a"} · Exported ${formatDate(new Date().toISOString())}`,
    margin,
    y,
  );
  y += 20;

  if (b.rating) {
    doc.setFontSize(13);
    doc.text(`Class ${b.rating.ratingClass} — Composite ${b.rating.compositeScore} / 300`, margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.text(b.rating.handlingRoute, margin, y);
    y += 16;
  } else {
    doc.setFontSize(10);
    doc.text("Composite / class: not yet computed.", margin, y);
    y += 16;
  }

  y = table(doc, y, margin, "Extracted Fields (FR2.2)", ["Field", "Period", "Value", "Currency", "Scale", "Status", "Confidence"], b.extractedFields
    .slice()
    .sort((a, c) => a.fieldName.localeCompare(c.fieldName) || a.period.localeCompare(c.period))
    .map((f) => [
      f.fieldName,
      f.period,
      typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : f.status === "Confirmed" && f.value === null ? "confirmed absent" : formatCurrency(f.value as number | null, f.currency ?? "SGD"),
      f.currency ?? "—",
      f.scaleApplied ?? "—",
      f.status,
      f.confidenceScore !== null ? `${f.confidenceScore}%` : "—",
    ]));

  y = table(doc, y, margin, "Integrity Checks (FR3.6/3.7)", ["Check", "Period", "Expected", "Actual", "Result", "Difference"], b.integrityChecks.map((c) => [
    INTEGRITY_CHECK_LABELS[c.checkName],
    c.period,
    c.expected !== null ? c.expected.toLocaleString() : "—",
    c.actual !== null ? c.actual.toLocaleString() : "—",
    c.passed ? "Pass" : "Fail",
    c.difference !== null ? c.difference.toLocaleString() : "—",
  ]));

  y = table(doc, y, margin, "Ratios (FR4)", ["Ratio", "Period", "Value", "Formula", "Not calculable"], b.ratios.map((r) => [
    r.label,
    r.period ?? "—",
    r.valueNumeric !== null ? String(r.valueNumeric) : "—",
    r.formulaDisplay,
    r.notCalculableReason ?? "—",
  ]));

  y = table(doc, y, margin, "Criterion Inputs & Driver Breakdown (FR5/FR6)", ["#", "Criterion", "Tier", "Weight", "Contribution", "Source"], (b.rating?.driverBreakdown ?? []).map((d) => [
    String(d.criterionNumber),
    d.label,
    String(d.tier),
    String(d.weight),
    String(d.contribution),
    d.sourceInput,
  ]));

  if (b.commentary && !b.commentary.noObservations) {
    y = table(doc, y, margin, "Risk Commentary (FR11, model-generated, advisory)", ["Category", "Statement"], b.commentary.observations.map((o) => [o.category, o.statement]));
  }

  table(doc, y, margin, "Approval Record (FR7)", ["Actor", "Action", "Comments", "When", "Policy version"], b.decisions.map((d) => [
    d.actor,
    d.action,
    d.comments || "—",
    formatDate(d.timestamp),
    d.policyVersion,
  ]));

  doc.save(`${baseFileName(b)}.pdf`);
}

function table(doc: jsPDF, y: number, margin: number, title: string, head: string[], body: string[][]): number {
  const withTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  doc.setFontSize(11);
  doc.text(title, margin, y);
  autoTable(doc, {
    startY: y + 6,
    margin: { left: margin, right: margin },
    head: [head],
    body: body.length ? body : [head.map(() => "—")],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [40, 60, 55] },
  });
  return (withTable.lastAutoTable?.finalY ?? y + 6) + 20;
}

// --- Excel (SpreadsheetML) ----------------------------------------------

function xmlEscape(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cell(v: string | number | null): string {
  if (v === null) return `<Cell><Data ss:Type="String">—</Data></Cell>`;
  if (typeof v === "number") return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
  return `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
}

function row(cells: (string | number | null)[]): string {
  return `<Row>${cells.map(cell).join("")}</Row>`;
}

function sheet(name: string, head: string[], rows: (string | number | null)[][]): string {
  // Sheet names in this format are limited to 31 characters and can't contain \/?*[]:
  const safeName = xmlEscape(name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31));
  const headerRow = `<Row ss:StyleID="Header">${head.map((h) => cell(h)).join("")}</Row>`;
  return `<Worksheet ss:Name="${safeName}"><Table>${headerRow}${rows.map(row).join("")}</Table></Worksheet>`;
}

export function exportAssessmentToExcel(b: ExportBundle): void {
  const summarySheet = sheet(
    "Summary",
    ["Field", "Value"],
    [
      ["Customer", b.customer.name],
      ["Division", b.assessment.division],
      ["Assessment version", b.assessment.version],
      ["State", b.assessment.state],
      ["Relationship type", b.assessment.relationshipType],
      ["Periods", b.assessment.periods.join(", ")],
      ["Composite score", b.rating?.compositeScore ?? null],
      ["Rating class", b.rating?.ratingClass ?? "not yet computed"],
      ["Handling route", b.rating?.handlingRoute ?? "—"],
      ["Weight set", b.rating?.weightSet ?? "—"],
      // FR10.2
      ["Extraction model(s)", extractionModelVersions(b.extractedFields)],
      ["Scorecard version", b.rating?.scorecardVersion ?? "n/a"],
      ["Export date", formatDate(new Date().toISOString())],
    ],
  );

  const fieldsSheet = sheet(
    "Extracted Fields",
    ["Field", "Period", "Value", "Currency", "Scale", "Status", "Confidence %", "Source pointer"],
    b.extractedFields
      .slice()
      .sort((a, c) => a.fieldName.localeCompare(c.fieldName) || a.period.localeCompare(c.period))
      .map((f) => [
        f.fieldName,
        f.period,
        typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : f.value,
        f.currency,
        f.scaleApplied,
        f.status,
        f.confidenceScore,
        f.sourcePointer,
      ]),
  );

  const checksSheet = sheet(
    "Integrity Checks",
    ["Check", "Period", "Expected", "Actual", "Passed", "Tolerance", "Difference"],
    b.integrityChecks.map((c) => [INTEGRITY_CHECK_LABELS[c.checkName], c.period, c.expected, c.actual, c.passed ? "Pass" : "Fail", c.toleranceApplied, c.difference]),
  );

  const ratiosSheet = sheet(
    "Ratios",
    ["Ratio", "Period", "Value", "Formula", "Lineage field IDs", "Not calculable reason"],
    b.ratios.map((r) => [r.label, r.period ?? "—", r.valueNumeric, r.formulaDisplay, r.lineageFieldIds.join(", "), r.notCalculableReason]),
  );

  const criteriaSheet = sheet(
    "Criterion Inputs",
    ["Criterion #", "Status", "Value"],
    b.criterionInputs.map((c) => [c.criterionNumber, c.status, summarizeCriterionInputForExport(c)]),
  );

  const driverSheet = sheet(
    "Driver Breakdown",
    ["#", "Criterion", "Tier", "Weight", "Contribution", "Source input"],
    (b.rating?.driverBreakdown ?? []).map((d) => [d.criterionNumber, d.label, d.tier, d.weight, d.contribution, d.sourceInput]),
  );

  const commentarySheet = sheet(
    "Risk Commentary",
    ["Category", "Statement", "Cited figures"],
    b.commentary && !b.commentary.noObservations
      ? b.commentary.observations.map((o) => [o.category, o.statement, o.citedFigures.map((f) => `${f.entity} — ${f.field}: ${f.value}`).join("; ")])
      : [],
  );

  const approvalSheet = sheet(
    "Approval Record",
    ["Actor", "Action", "Comments", "When", "Policy version"],
    b.decisions.map((d) => [d.actor, d.action, d.comments, formatDate(d.timestamp), d.policyVersion]),
  );

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/></Style>
  </Styles>
  ${summarySheet}${fieldsSheet}${checksSheet}${ratiosSheet}${criteriaSheet}${driverSheet}${commentarySheet}${approvalSheet}
</Workbook>`;

  downloadFile(`${baseFileName(b)}.xls`, workbook, "application/vnd.ms-excel");
}

function summarizeCriterionInputForExport(c: CriterionInput): string {
  switch (c.criterionNumber) {
    case 5:
      return `Paid-up capital ${c.paidUpCapital ?? "—"} / Total exposure ${c.totalExposure ?? "—"} ${c.currency ?? ""}`.trim();
    case 7:
      return `Year registered in SG: ${c.yearRegisteredSg ?? "—"}`;
    case 8:
      return `${c.litigationRecord ?? "—"} (searched: ${c.evidenceSource ?? "—"}, ${c.evidencePeriodOrDate ?? "—"})`;
    case 9:
      return c.changeInDirectors === null ? "—" : c.changeInDirectors ? "Yes" : "No";
    case 11:
      return `${c.promptPaymentRecord ?? "—"} (checked: ${c.evidenceSource ?? "—"}, ${c.evidencePeriodOrDate ?? "—"})`;
  }
}

function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
