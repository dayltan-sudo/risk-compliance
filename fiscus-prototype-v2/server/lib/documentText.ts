import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

// Text-based extraction only for v1 (no OCR/vision) — a scanned-image-only
// PDF yields near-empty text here, which the caller treats as a genuine
// extraction miss (Statement Extraction.md §8), not a crash.
export async function extractDocumentText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = new ExcelJS.Workbook();
    // exceljs's own dependency (fast-csv) vendors an old @types/node whose
    // Buffer type is nominally distinct from ours despite being the same
    // class at runtime — `any` sidesteps the cross-version type identity
    // mismatch (TS2345) rather than a real incompatibility.
    await workbook.xlsx.load(buf as any);
    const parts: string[] = [];
    workbook.eachSheet((sheet) => {
      parts.push(`--- Sheet: ${sheet.name} ---`);
      sheet.eachRow((row) => {
        const cells = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)));
        parts.push(cells.join(", "));
      });
    });
    return parts.join("\n");
  }

  // .txt/.csv and anything else — treat as plain text.
  return buf.toString("utf-8");
}
