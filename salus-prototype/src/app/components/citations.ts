/**
 * Citation helpers for the Salus Assistant.
 *
 * The server writes tool ref ids inline in the answer (`[REQ-06]`, `[SITE-08]`)
 * and returns the matching refs in `citations`. These helpers split the prose
 * from those markers, and send each citation type to the screen that owns its
 * records. Pure functions: no router, no DOM, no fetch.
 */

/** The citation shape the assistant API returns. */
export interface CitationLike {
  type: string;
  id: string;
  label: string;
}

export type TextSegment = {
  kind: 'text';
  text: string;
};

export type CitationSegment = {
  kind: 'citation';
  /** Ref id exactly as written in the answer, e.g. `REQ-06`. */
  id: string;
  /** The bracketed marker, e.g. `[REQ-06]`. */
  marker: string;
  /** Citation type inferred from the id prefix, e.g. `requirement`. */
  type: string;
};

export type AnswerSegment = TextSegment | CitationSegment;

/**
 * Tool-ref id prefixes. This is the closed set the assistant emits; a
 * bracketed token with any other prefix is left in the prose.
 */
const TYPE_BY_PREFIX: Record<string, string> = {
  REQ: 'requirement',
  POL: 'policy',
  COV: 'coverage',
  SITE: 'site',
  EXC: 'exclusion',
  KPI: 'kpi',
  ENT: 'entity',
  CAR: 'carrier',
  BRK: 'broker',
  PREM: 'premium',
  SCORE: 'score',
  DRIVER: 'driver',
};

/**
 * `[PREFIX-SUFFIX]` with at least one hyphen. Whether the token is a citation
 * or ordinary bracketed prose is decided by the prefix check below.
 */
const MARKER_PATTERN = /\[([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9._]+)+)\]/g;

const ROUTE_BY_TYPE: Record<string, string> = {
  requirement: '/contracts',
  exclusion: '/exclusions',
  policy: '/coverage',
  coverage: '/coverage',
  site: '/map',
  kpi: '/',
};

function citationType(id: string): string | undefined {
  const hyphen = id.indexOf('-');
  if (hyphen <= 0) return undefined;
  return TYPE_BY_PREFIX[id.slice(0, hyphen).toUpperCase()];
}

/** Split an answer into prose and citation segments, in order. */
export function parseAnswer(text: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARKER_PATTERN)) {
    const marker = match[0];
    const id = match[1];
    const index = match.index;
    if (id === undefined || index === undefined) continue;

    const type = citationType(id);
    if (type === undefined) continue;

    if (index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, index) });
    segments.push({ kind: 'citation', id, marker, type });
    cursor = index + marker.length;
  }

  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

/** The app route that owns a citation's records. */
export function citationHref(citation: Pick<CitationLike, 'type'>): string {
  return ROUTE_BY_TYPE[citation.type.trim().toLowerCase()] ?? '/';
}
