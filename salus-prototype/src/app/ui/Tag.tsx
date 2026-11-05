import type { ReactNode } from 'react';
import { cn, resolveTone } from './tokens';
import type { ToneRef } from './tokens';

/** Tone name, risk band or coverage status. */
export type TagTone = ToneRef;

export interface TagProps {
  /** A shell tone, a band (`Low`…`Critical`) or a status (`Met`…`Excluded`). */
  tone?: TagTone;
  /** Small leading dot in the marker colour. */
  dot?: boolean;
  children: ReactNode;
  /** Native tooltip, e.g. the full definition behind an abbreviation. */
  title?: string;
  className?: string;
}

export function Tag({ tone = 'neutral', dot = false, children, title, className }: TagProps) {
  const resolved = resolveTone(tone);

  return (
    <span
      className={cn('sal-tag', `sal-tone--${resolved.name}`, className)}
      title={title}
    >
      {dot ? <span className="sal-tag__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
