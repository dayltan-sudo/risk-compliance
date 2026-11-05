import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Plain-language glossary for the insurance vocabulary the app uses without
 * defining it.
 *
 * The entries are written for a reader who does not work in insurance: one
 * sentence each, no term defined in terms of itself. The panel is a drawer
 * mounted once by the shell so any screen can open it, and `GlossaryTerm`
 * lets a page link a word straight to its entry.
 */

export type GlossaryEntry = {
  /** Stable anchor id, also used to deep-link an entry. */
  id: string;
  term: string;
  body: string;
};

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: 'tiv',
    term: 'TIV',
    body: 'Total Insured Value: what it would cost to rebuild or replace everything we own at a site, which is the number the property cover is meant to match.',
  },
  {
    id: 'itv',
    term: 'ITV',
    body: 'Insurance-to-value: the property limit expressed as a share of TIV, so 90% means we are insured for nine tenths of what a rebuild would cost.',
  },
  {
    id: 'pml',
    term: 'PML',
    body: 'Probable Maximum Loss: the worst loss one event is likely to cause at a site, used to judge how much limit that site actually needs.',
  },
  {
    id: 'sum-insured',
    term: 'Sum insured',
    body: 'The ceiling on what a policy pays for physical damage to the insured property, before any business interruption cover is added.',
  },
  {
    id: 'occurrence-limit',
    term: 'Occurrence limit',
    body: 'The most a policy pays for one event, no matter how many sites or assets that event damages.',
  },
  {
    id: 'aggregate-limit',
    term: 'Aggregate limit',
    body: 'The most a policy pays across every event in the policy year, so several smaller losses share one pot of cover.',
  },
  {
    id: 'deductible',
    term: 'Deductible / excess',
    body: 'The first slice of each loss we pay ourselves before the insurer pays anything.',
  },
  {
    id: 'sub-limit',
    term: 'Sub-limit',
    body: 'A smaller cap inside a policy for one peril or asset, so a fire sub-limit can sit far below the total sum insured.',
  },
  {
    id: 'placement',
    term: 'Placement %',
    body: 'The share of a contract requirement that our placed insurance actually covers, so 100% means the contractual number is met.',
  },
  {
    id: 'exclusion',
    term: 'Exclusion override',
    body: 'Policy wording that removes a peril entirely, which fails a contract requirement even when the placed limit looks large enough.',
  },
  {
    id: 'status',
    term: 'Requirement status',
    body: 'Met clears the required limit, At-risk is within tolerance but below it, Gap is short of it, and Excluded means the wording removes the peril whatever the limit.',
  },
];

const ENTRY_BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/* --------------------------------------------------------------- context */

export type GlossaryValue = {
  open: (entryId?: string) => void;
  close: () => void;
  isOpen: boolean;
  /** Entry the drawer opens scrolled to, or null when opened at the top. */
  activeId: string | null;
};

const NOOP_GLOSSARY: GlossaryValue = {
  open: () => undefined,
  close: () => undefined,
  isOpen: false,
  activeId: null,
};

export const GlossaryContext = createContext<GlossaryValue>(NOOP_GLOSSARY);

/** Safe outside a provider: the term renders, it just does not open a drawer. */
export function useGlossary(): GlossaryValue {
  return useContext(GlossaryContext);
}

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const open = useCallback((entryId?: string) => {
    setActiveId(entryId === undefined ? null : entryId);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<GlossaryValue>(
    () => ({ open, close, isOpen, activeId }),
    [open, close, isOpen, activeId],
  );

  return (
    <GlossaryContext.Provider value={value}>
      {children}
      <GlossaryDrawer isOpen={isOpen} activeId={activeId} onClose={close} />
    </GlossaryContext.Provider>
  );
}

/* ------------------------------------------------------------------- UI */

export function GlossaryTerm({ id, children }: { id: string; children: ReactNode }) {
  const { open } = useGlossary();
  const entry = glossaryEntry(id);

  return (
    <button
      type="button"
      style={termStyle}
      title={entry === undefined ? 'Glossary' : `Glossary: ${entry.term}`}
      onClick={() => open(id)}
    >
      {children}
    </button>
  );
}

export function GlossaryDrawer({
  isOpen,
  activeId,
  onClose,
}: {
  isOpen: boolean;
  activeId: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || activeId === null) return;
    const target = document.getElementById(`glossary-${activeId}`);
    if (target !== null && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  }, [isOpen, activeId]);

  if (!isOpen) return null;

  return (
    <>
      <div style={backdropStyle} onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Glossary of insurance terms"
        style={drawerStyle}
      >
        <header style={drawerHeadStyle}>
          <div>
            <p style={drawerEyebrowStyle}>Plain language</p>
            <h2 style={drawerTitleStyle}>Glossary</h2>
          </div>
          <button type="button" className="sal-btn sal-btn--ghost sal-btn--sm" onClick={onClose}>
            Close
          </button>
        </header>

        <p style={drawerIntroStyle}>
          The words this app uses without explaining them, one sentence each, for readers who do not
          work in insurance.
        </p>

        <dl style={listStyle}>
          {GLOSSARY.map((entry) => {
            const active = entry.id === activeId;
            return (
              <div
                key={entry.id}
                id={`glossary-${entry.id}`}
                style={active ? { ...entryStyle, ...activeEntryStyle } : entryStyle}
              >
                <dt style={termHeadingStyle}>{entry.term}</dt>
                <dd style={definitionStyle}>{entry.body}</dd>
              </div>
            );
          })}
        </dl>

        <p style={drawerFootStyle}>
          Definitions only. The figures each term is applied to come from the engine and the
          portfolio currently in scope.
        </p>
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------- styles */

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 180,
  background: 'rgba(24, 19, 14, .28)',
};

const drawerStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 190,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-md)',
  width: 'min(420px, 100vw)',
  overflowY: 'auto',
  padding: 'var(--space-xl) var(--space-xxl) var(--space-xxxl)',
  background: 'var(--card)',
  borderLeft: 'var(--border-hairline)',
  boxShadow: 'var(--shadow)',
};

const drawerHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-md)',
};

const drawerEyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--dusk-dim)',
};

const drawerTitleStyle: CSSProperties = {
  fontSize: 'var(--text-xl)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink)',
};

const drawerIntroStyle: CSSProperties = {
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--muted)',
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-md)',
  margin: 0,
};

const entryStyle: CSSProperties = {
  paddingBottom: 'var(--space-md)',
  borderBottom: 'var(--border-hairline)',
};

const activeEntryStyle: CSSProperties = {
  paddingLeft: 'var(--space-sm)',
  boxShadow: 'inset 3px 0 0 var(--crimson)',
};

const termHeadingStyle: CSSProperties = {
  marginBottom: 'var(--space-xxs)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--ink)',
};

const definitionStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--muted)',
};

const drawerFootStyle: CSSProperties = {
  marginTop: 'auto',
  fontSize: 'var(--text-micro)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--dusk-dim)',
};

const termStyle: CSSProperties = {
  padding: 0,
  border: 0,
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
};
