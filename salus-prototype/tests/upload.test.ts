import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { detectKind, extractUploadText, MAX_UPLOAD_BYTES, UploadError } from '../src/ingestion/fileText';
import { extractByRules, normaliseDate } from '../src/ingestion/rules';

/**
 * Real files, real parsers. The fixtures in `fixtures/uploads` are a synthetic
 * broker renewal slip rendered as text, DOCX and PDF, so all three upload paths
 * are exercised against bytes a browser would actually send.
 */

const TEXT = 'fixtures/uploads/hai-phong-renewal-2026.txt';
const DOCX = 'fixtures/uploads/hai-phong-renewal-2026.docx';
const PDF = 'fixtures/uploads/hai-phong-renewal-2026.pdf';

function bytesOf(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('detectKind', () => {
  it('reads the PDF signature rather than trusting the extension', () => {
    expect(detectKind('anything.bin', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
  });

  it('treats a zip container as DOCX only when the name says so', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(detectKind('slip.docx', zip)).toBe('docx');
    expect(detectKind('archive.zip', zip)).toBeNull();
  });

  it('refuses a binary file with an unknown extension', () => {
    expect(detectKind('scan.raw', new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });
});

describe('extractUploadText', () => {
  it('reads a text upload', async () => {
    const out = await extractUploadText('slip.txt', bytesOf(TEXT));
    expect(out.kind).toBe('txt');
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0]).toContain('PRP-2026-0008');
  });

  it('reads a DOCX upload', async () => {
    const out = await extractUploadText('slip.docx', bytesOf(DOCX));
    expect(out.kind).toBe('docx');
    expect(out.pages[0]).toContain('PRP-2026-0008');
    expect(out.pages[0]).toContain('80,000,000');
  });

  it('reads a PDF upload with its page boundaries intact', async () => {
    const out = await extractUploadText('slip.pdf', bytesOf(PDF));
    expect(out.kind).toBe('pdf');
    expect(out.pages.length).toBeGreaterThanOrEqual(1);
    expect(out.pages.join('\n')).toContain('PRP-2026-0008');
    expect(out.emptyTextLayer).toBe(false);
  });

  it('rejects an empty file', async () => {
    await expect(extractUploadText('empty.txt', new Uint8Array())).rejects.toBeInstanceOf(UploadError);
  });

  it('rejects a file over the size limit', async () => {
    const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    huge.set([0x25, 0x50, 0x44, 0x46]);
    await expect(extractUploadText('big.pdf', huge)).rejects.toThrow(/limit is 8 MB/);
  });

  it('rejects an unsupported type', async () => {
    await expect(
      extractUploadText('scan.raw', new Uint8Array([0x00, 0x01, 0x02, 0x03])),
    ).rejects.toThrow(/unsupported file type/);
  });
});

describe('normaliseDate', () => {
  it('reads the formats slips use', () => {
    expect(normaliseDate('01/07/2026')).toBe('2026-07-01');
    expect(normaliseDate('2026-07-01')).toBe('2026-07-01');
    expect(normaliseDate('1 July 2026')).toBe('2026-07-01');
    expect(normaliseDate('July 1, 2026')).toBe('2026-07-01');
  });

  it('rejects an impossible date instead of rolling it over', () => {
    expect(normaliseDate('31/02/2026')).toBeNull();
    expect(normaliseDate('not a date')).toBeNull();
  });
});

describe('extractByRules', () => {
  const pages = [readFileSync(TEXT, 'utf8')];
  const extraction = extractByRules(pages);
  const byKey = new Map(extraction.fields.map((field) => [field.key, field]));

  it('classifies the document from its title block', () => {
    expect(extraction.documentType).toBe('renewal');
  });

  it('reads every labelled policy field off a clean slip', () => {
    expect(byKey.get('policy_no')?.value).toBe('PRP-2026-0008');
    expect(byKey.get('insured_entity')?.value).toBe('Infrastructure — Vietnam');
    expect(byKey.get('carrier')?.value).toBe('Sabre Indemnity');
    expect(byKey.get('site_name')?.value).toBe('Hai Phong Yard');
    expect(byKey.get('inception')?.value).toBe('2026-07-01');
    expect(byKey.get('expiry')?.value).toBe('2027-06-30');
    expect(byKey.get('sum_insured')?.value).toBe('SGD 80,000,000');
    expect(byKey.get('deductible')?.value).toBe('SGD 100,000');
    expect(byKey.get('currency')?.value).toBe('SGD');
  });

  it('does not confuse BI cover or premium tax with the base fields', () => {
    expect(byKey.get('bi_sum_insured')?.value).toBe('SGD 12,000,000');
    expect(byKey.get('premium_gross')?.value).toBe('SGD 214,500');
    expect(byKey.get('premium_tax')?.value).toBe('SGD 15,015');
  });

  it('gives every capture a page and a verbatim quote', () => {
    for (const field of extraction.fields) {
      expect(field.page).toBeGreaterThanOrEqual(1);
      expect(pages[0]).toContain(field.quote.slice(0, 30));
    }
  });

  it('queues a labelled value it cannot read rather than inventing one', () => {
    const weak = extractByRules(['RENEWAL SLIP\nSum Insured: to be advised\nPolicy No: PRP-1']);
    const sum = weak.fields.find((field) => field.key === 'sum_insured');
    expect(sum).toBeUndefined();
  });

  it('returns an empty field set for a document with no labels', () => {
    const blank = extractByRules(['A cover note with no labelled fields at all.']);
    expect(blank.fields).toEqual([]);
  });
});
