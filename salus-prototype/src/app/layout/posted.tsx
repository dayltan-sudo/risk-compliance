import { useSyncExternalStore } from 'react';

import type { PostedRecord } from '../../data/overlay';

/**
 * Posted ingestion records, held for the browser session.
 *
 * The demo's claim is that a validated document changes the portfolio. The
 * server keeps the audit trail and the versions; this store is what lets the
 * screens recompute from the same engine the moment a post succeeds, without a
 * round trip that a serverless instance might not survive.
 *
 * Mirrored into `sessionStorage` so a refresh mid-demo does not silently undo a
 * post. It is a session copy, not a record of truth: closing the tab returns the
 * demo to the seed, which is the honest behaviour for a synthetic-data
 * prototype.
 */

const STORAGE_KEY = 'salus.posted.v1';

function readStorage(): PostedRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PostedRecord =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PostedRecord).documentId === 'string' &&
        typeof (entry as PostedRecord).version === 'number' &&
        typeof (entry as PostedRecord).fields === 'object',
    );
  } catch {
    return [];
  }
}

let records: PostedRecord[] = readStorage();
const listeners = new Set<() => void>();

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // A full or blocked session store must not break the demo.
  }
}

function emit(): void {
  persist();
  for (const listener of listeners) listener();
}

export function recordPosted(record: PostedRecord): void {
  // A re-post of the same document supersedes the earlier version rather than
  // stacking, so accepting a correction and posting again does not count twice.
  const next = records.filter((candidate) => candidate.documentId !== record.documentId);
  next.push(record);
  records = next;
  emit();
}

export function clearPosted(): void {
  if (records.length === 0) return;
  records = [];
  emit();
}

export function getPostedRecords(): readonly PostedRecord[] {
  return records;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePostedRecords(): readonly PostedRecord[] {
  return useSyncExternalStore(subscribe, getPostedRecords, getPostedRecords);
}
