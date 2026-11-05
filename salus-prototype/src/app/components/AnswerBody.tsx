import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { citationHref, parseAnswer } from './citations';
import type { CitationLike } from './citations';

export interface AnswerBodyProps {
  text: string;
  citations: readonly CitationLike[];
}

const PROSE: CSSProperties = {
  margin: 0,
  color: 'var(--card)',
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-relaxed)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

const CHIP: CSSProperties = {
  margin: '0 1px',
  verticalAlign: '1px',
  textDecoration: 'none',
};

/**
 * Renders an assistant answer. Prose is kept verbatim (newlines included);
 * each `[TYPE-ID]` marker that resolves to one of the answer's citations
 * becomes a chip linking to the screen that owns the record. A marker that
 * does not resolve stays as text, so the UI never invents a source.
 */
export function AnswerBody({ text, citations }: AnswerBodyProps) {
  const citationById = new Map<string, CitationLike>();
  for (const citation of citations) citationById.set(citation.id.toLowerCase(), citation);

  return (
    <p style={PROSE}>
      {parseAnswer(text).map((segment, index) => {
        if (segment.kind === 'text') {
          return <Fragment key={index}>{segment.text}</Fragment>;
        }

        const citation = citationById.get(segment.id.toLowerCase());
        if (citation === undefined) {
          return <Fragment key={index}>{segment.marker}</Fragment>;
        }

        return (
          <Link
            key={index}
            to={citationHref(citation)}
            className="sal-tag sal-tone--accent"
            style={CHIP}
            title={citation.label}
          >
            {segment.id}
          </Link>
        );
      })}
    </p>
  );
}
