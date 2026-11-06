/**
 * Renewal documentation derivation.
 *
 * The register already answers "what expires next". This module answers the
 * question behind it: for each policy, has the renewal paperwork arrived?
 *
 * Two sources, both real:
 * - posted ingestion records (the browser session copy of what a reviewer
 *   posted, which carries `policy_no` in its field set);
 * - the validation queue (`/api/documents/queue`), whose items carry the
 *   policy number and whether the document has been posted.
 *
 * Nothing here invents a state. When the queue cannot be read the answer is
 * `unavailable`, never `nothing`: an unread queue is not a compliance gap.
 */

export type DocumentationState = 'received' | 'in review' | 'nothing' | 'unavailable';

/** A posted record from the document inbox overlay. */
export interface PostedRecordLike {
  fields: Readonly<Record<string, string | undefined>>;
}

/** The queue fields this derivation needs. Extra fields are ignored. */
export interface QueueDocumentLike {
  policyNo?: string | null;
  /** `queued` before a post, `posted` afterwards. */
  status?: string | null;
  /** Alternative provenance marker (`posted`, `accepted`, ...). */
  source?: string | null;
}

export interface DocumentationIndex {
  readonly postedPolicyNos: ReadonlySet<string>;
  readonly queueByPolicy: ReadonlyMap<string, readonly QueueDocumentLike[]>;
  /** False when no queue response was available at all. */
  readonly queueReadable: boolean;
  /**
   * False when the queue answered but none of its items carry a policy
   * number, so no row can be attributed. An empty queue is attributable.
   */
  readonly queueAttributable: boolean;
}

/** Case-insensitive, trimmed policy number used for every comparison. */
export function normalisePolicyNo(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isReceived(item: QueueDocumentLike): boolean {
  const status = (item.status ?? '').trim().toLowerCase();
  const source = (item.source ?? '').trim().toLowerCase();
  return status === 'posted' || status === 'accepted' || source === 'posted' || source === 'accepted';
}

/**
 * Build the lookup once per render. `queue === null` means the fetch failed;
 * an empty array means the queue answered and is genuinely empty.
 */
export function buildDocumentationIndex(
  posted: readonly PostedRecordLike[],
  queue: readonly QueueDocumentLike[] | null,
): DocumentationIndex {
  const postedPolicyNos = new Set<string>();
  for (const record of posted) {
    const key = normalisePolicyNo(record.fields['policy_no']);
    if (key !== '') postedPolicyNos.add(key);
  }

  const queueByPolicy = new Map<string, QueueDocumentLike[]>();
  let attributed = 0;

  if (queue !== null) {
    for (const item of queue) {
      const key = normalisePolicyNo(item.policyNo);
      if (key === '') continue;
      attributed += 1;
      const existing = queueByPolicy.get(key);
      if (existing === undefined) queueByPolicy.set(key, [item]);
      else existing.push(item);
    }
  }

  return {
    postedPolicyNos,
    queueByPolicy,
    queueReadable: queue !== null,
    queueAttributable: queue !== null && (queue.length === 0 || attributed > 0),
  };
}

/** State for one policy number. Pure: same index in, same state out. */
export function documentationState(
  policyNo: string,
  index: DocumentationIndex,
): DocumentationState {
  const key = normalisePolicyNo(policyNo);

  // A posted record is proof on its own, even if the queue is unreadable.
  if (key !== '' && index.postedPolicyNos.has(key)) return 'received';

  if (!index.queueReadable || !index.queueAttributable) return 'unavailable';

  const items = index.queueByPolicy.get(key);
  if (items === undefined || items.length === 0) return 'nothing';
  if (items.some(isReceived)) return 'received';
  return 'in review';
}

/** Attach the state to rows without coupling this module to the page's type. */
export function withDocumentation<T extends { policy: { policyNo: string } }>(
  rows: readonly T[],
  index: DocumentationIndex,
): Array<T & { documentation: DocumentationState }> {
  return rows.map((row) => ({
    ...row,
    documentation: documentationState(row.policy.policyNo, index),
  }));
}

export function countDocumentation(
  rows: readonly { documentation?: DocumentationState }[],
): Record<DocumentationState, number> {
  const counts: Record<DocumentationState, number> = {
    received: 0,
    'in review': 0,
    nothing: 0,
    unavailable: 0,
  };

  for (const row of rows) {
    const state = row.documentation ?? 'unavailable';
    counts[state] += 1;
  }

  return counts;
}

/** Display wording. The CSV uses the raw state values instead. */
export function documentationLabel(state: DocumentationState, expired = false): string {
  switch (state) {
    case 'received':
      return 'Received';
    case 'in review':
      return 'In review';
    case 'nothing':
      return expired ? 'Nothing received · overdue' : 'Nothing received';
    case 'unavailable':
      return 'Unavailable';
  }
}

/**
 * Severity uses the shell's existing risk tones: a missing document on a live
 * policy is critical, one already in the queue is a warning, and an unread
 * queue is neutral because it is unknown, not bad.
 */
export function documentationTone(
  state: DocumentationState,
): 'low' | 'medium' | 'critical' | 'neutral' {
  switch (state) {
    case 'received':
      return 'low';
    case 'in review':
      return 'medium';
    case 'nothing':
      return 'critical';
    case 'unavailable':
      return 'neutral';
  }
}
