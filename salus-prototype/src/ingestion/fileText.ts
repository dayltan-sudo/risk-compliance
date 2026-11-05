import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Turns an uploaded file into the text the extraction contract works on.
 *
 * Uploads are real: a broker slip arrives as a PDF, a schedule as a Word file.
 * The pipeline downstream only ever sees text plus page boundaries, so PDF and
 * DOCX both have to reduce to `{ text, pages }` here and nowhere else.
 *
 * A PDF with no text layer (a scan) is reported as such rather than passed on as
 * empty text: "we could not read it" and "the document says nothing" are
 * different answers, and only one of them is honest about needing OCR.
 */

export type UploadKind = 'pdf' | 'docx' | 'txt';

export interface UploadText {
  kind: UploadKind;
  /** Per-page text. A DOCX has no page boundaries, so it is one page. */
  pages: string[];
  /** True when a PDF parsed but carried no text layer, i.e. it is probably a scan. */
  emptyTextLayer: boolean;
}

export class UploadError extends Error {
  readonly code: 'unsupported_type' | 'unreadable' | 'empty_text' | 'too_large';

  constructor(code: UploadError['code'], message: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

export function detectKind(name: string, bytes: Uint8Array): UploadKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A .zip container: DOCX is the only zip we accept.
    return /\.docx$/i.test(name) ? 'docx' : null;
  }
  if (/\.(txt|text|csv)$/i.test(name)) return 'txt';

  // Last resort: a text file with an extension we do not know but no NUL bytes.
  const sample = bytes.subarray(0, 1024);
  return sample.includes(0) ? null : 'txt';
}

function decodeText(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(bytes).replace(/^\uFEFF/, '');
}

export async function extractUploadText(name: string, bytes: Uint8Array): Promise<UploadText> {
  if (bytes.byteLength === 0) {
    throw new UploadError('unreadable', 'the uploaded file is empty');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      'too_large',
      `file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    );
  }

  const kind = detectKind(name, bytes);
  if (kind === null) {
    throw new UploadError(
      'unsupported_type',
      'unsupported file type; upload a PDF, a DOCX or a text file',
    );
  }

  if (kind === 'txt') {
    const text = decodeText(bytes);
    if (text.trim() === '') throw new UploadError('empty_text', 'the text file has no content');
    return { kind, pages: [text], emptyTextLayer: false };
  }

  if (kind === 'docx') {
    let text: string;
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new UploadError('unreadable', `could not read the Word document: ${reason}`);
    }
    if (text.trim() === '') throw new UploadError('empty_text', 'the Word document has no text');
    return { kind, pages: [text], emptyTextLayer: false };
  }

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const extracted = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(extracted.text) ? extracted.text : [String(extracted.text)];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UploadError('unreadable', `could not read the PDF: ${reason}`);
  }

  const joined = pages.join('\n').trim();
  if (joined === '') {
    return { kind, pages, emptyTextLayer: true };
  }
  return { kind, pages, emptyTextLayer: false };
}

/** Joins pages with a marker the rule extractor can use to track page numbers. */
export function pagesToText(pages: string[]): string {
  return pages.join('\n\u000c\n');
}
