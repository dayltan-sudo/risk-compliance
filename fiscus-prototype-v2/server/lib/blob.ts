import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Uses the private Blob store ("fiscus-documents", OIDC-authenticated via
// BLOB_STORE_ID + the ambient VERCEL_OIDC_TOKEN — no static
// BLOB_READ_WRITE_TOKEN needed). Private access means the returned URL is
// not fetchable on its own; retrieving the file later requires calling back
// into this SDK server-side, which is what the PRD's "encrypted at rest and
// access-controlled" NFR needs — unlike a public store, this URL alone
// grants no access.
export async function storeDocument(file: File, pathnamePrefix: string): Promise<string> {
  if (process.env.BLOB_STORE_ID) {
    const blob = await put(`${pathnamePrefix}/${file.name}`, file, { access: "private", addRandomSuffix: true });
    return blob.url;
  }

  // Local-dev fallback only — Vercel's serverless filesystem is read-only
  // outside /tmp, so this path never runs in production. Lets the rest of
  // the Field Review pipeline be exercised locally before a Blob token exists.
  const dir = path.join(process.cwd(), ".local-blob-store", pathnamePrefix);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, file.name);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return `local://${filePath}`;
}
