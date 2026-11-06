import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, RefObject } from 'react';

import { daysBetween, formatSgd } from '../../engine';
import type { ContractRequirement, Policy, Portfolio } from '../../engine';
import { buildExceptions } from '../components/exceptions';
import type { ExceptionKind, ExceptionRow } from '../components/exceptions';
import { formatDate, formatMoneyCompact } from '../components/format';
import { PageHeader } from '../components/PageHeader';
import { useFilteredPortfolio } from '../layout/filters';
import { Card, KpiTile, Tag } from '../ui';
import type { TagTone } from '../ui';
import './report.css';

/**
 * Board summary / renewal review pack.
 *
 * One printable page, assembled only from engine output the other screens
 * already show: the group roll-up, the shared exception queue and the policy
 * register. Nothing is recomputed here, so a figure that disagrees with
 * `/api/summary` (or the Overview tiles) is a bug in this page, not in the API.
 *
 * Print behaviour is the point of the screen, so the page count in the header
 * is measured from the same section blocks the print stylesheet treats as
 * indivisible. A server render has no layout, so it says "Not measured" rather
 * than inventing a number.
 */

const PROGRAMME_NAME = 'Group insurance programme';

/** A4 (210 × 297 mm) less the 14 mm margins the print stylesheet sets. */
const A4_CONTENT = { widthMm: 182, heightMm: 269 } as const;

const STATUS_OF: Record<ExceptionKind, { label: string; tone: TagTone }> = {
  'Requirement gap': { label: 'Gap', tone: 'critical' },
  'Excluded cover': { label: 'Excluded', tone: 'neutral' },
  Renewal: { label: 'Renewal', tone: 'medium' },
  'Under-insured': { label: 'Under-insured', tone: 'high' },
};

interface ReportException {
  id: string;
  siteName: string;
  requirement: string;
  detail: string;
  status: string;
  tone: TagTone;
  /** Contract clause behind the exception, when one exists. */
  clause: string | null;
  valueSgd: number;
}

interface ReportRenewal {
  id: string;
  policyNo: string;
  line: string;
  entityName: string;
  expiry: string;
  daysLeft: number;
}

/* ------------------------------------------------------------- page count */

function mmToPx(mm: number): number {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.width = `${mm}mm`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px;
}

/**
 * Estimate the printed page count from the real layout.
 *
 * Each `[data-report-section]` is measured at the print column width (A4 less
 * 14 mm margins) in a hidden host, then stacked against the printable page
 * height. `break-inside: avoid` means a section that does not fit starts a new
 * page, which is exactly the accumulation below. Returns null when there is no
 * layout to measure (server render, or no sections), never 0.
 */
export function estimatePrintPages(root: HTMLElement | null): number | null {
  if (root === null || typeof document === 'undefined') return null;

  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-report-section]'));
  if (sections.length === 0) return null;

  const host = document.createElement('div');
  host.style.cssText = [
    'position: fixed',
    'left: -10000px',
    'top: 0',
    `width: ${A4_CONTENT.widthMm}mm`,
    'visibility: hidden',
    'pointer-events: none',
  ].join(';');
  document.body.appendChild(host);

  try {
    const pageHeight = mmToPx(A4_CONTENT.heightMm);
    if (!Number.isFinite(pageHeight) || pageHeight <= 0) return null;

    let pages = 1;
    let used = 0;

    for (const section of sections) {
      const clone = section.cloneNode(true) as HTMLElement;
      // Cloned cards carry React-generated ids; keeping them would duplicate
      // ids in the document for the length of the measurement.
      for (const node of Array.from(clone.querySelectorAll<HTMLElement>('[id]'))) {
        node.removeAttribute('id');
      }
      host.appendChild(clone);
      const height = clone.getBoundingClientRect().height;
      host.removeChild(clone);
      if (!Number.isFinite(height) || height <= 0) continue;

      // Block-flow spacing lives on the next section's top margin, matching the
      // `> * + *` rule the print stylesheet uses.
      const gap = used === 0 ? 0 : Number.parseFloat(window.getComputedStyle(section).marginTop) || 0;
      const block = height + gap;

      if (block > pageHeight) {
        // Taller than a page: the browser has to split it, so account for the
        // extra pages and carry the remainder.
        if (used > 0) {
          pages += 1;
          used = 0;
        }
        pages += Math.ceil(block / pageHeight) - 1;
        used = block % pageHeight;
        continue;
      }

      if (used + block > pageHeight) {
        pages += 1;
        used = 0;
      }
      used += block;
    }

    return pages;
  } finally {
    host.remove();
  }
}

function usePrintPageCount(rootRef: RefObject<HTMLElement | null>): number | null {
  const [pages, setPages] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => setPages(estimatePrintPages(rootRef.current));
    measure();

    // Print re-lays out the document; measure again at the last moment, and
    // once the webfonts land, since a fallback font changes every height.
    window.addEventListener('beforeprint', measure);
    if (document.fonts !== undefined) {
      void document.fonts.ready.then(measure).catch(() => undefined);
    }

    let frame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('beforeprint', measure);
      window.removeEventListener('resize', onResize);
      window.cancelAnimationFrame(frame);
    };
  }, [rootRef]);

  return pages;
}

/* ---------------------------------------------------------------- shaping */

function toReportExceptions(
  rows: readonly ExceptionRow[],
  portfolio: Portfolio,
): ReportException[] {
  const requirementById = new Map<string, ContractRequirement>(
    portfolio.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const policyById = new Map<string, Policy>(portfolio.policies.map((policy) => [policy.id, policy]));

  return rows.map((row) => {
    const requirement = row.id.startsWith('requirement-')
      ? requirementById.get(row.id.slice('requirement-'.length))
      : undefined;
    const policy = row.id.startsWith('renewal-') ? policyById.get(row.id.slice('renewal-'.length)) : undefined;
    const status = STATUS_OF[row.kind];

    const subject =
      requirement !== undefined
        ? `${requirement.line} · ${requirement.peril}`
        : policy !== undefined
          ? `${policy.line} · renewal`
          : 'Property cover vs TIV';

    return {
      id: row.id,
      siteName: row.siteName,
      requirement: subject,
      detail: row.detail,
      status: status.label,
      tone: status.tone,
      clause: requirement?.clauseRef ?? null,
      valueSgd: row.valueSgd,
    };
  });
}

/** Largest value first; id breaks ties so two renders cannot reorder rows. */
export function selectTopExceptions(rows: readonly ReportException[], limit = 5): ReportException[] {
  return [...rows]
    .sort((a, b) => b.valueSgd - a.valueSgd || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function buildRenewals(
  portfolio: Portfolio,
  asOf: string,
): ReportRenewal[] {
  const entityNameById = new Map(portfolio.entities.map((entity) => [entity.id, entity.name]));

  return portfolio.policies
    .filter((policy) => policy.status === 'Active')
    .map((policy) => ({ policy, daysLeft: daysBetween(asOf, policy.expiry) }))
    .filter((entry) => entry.daysLeft > 0 && entry.daysLeft <= 90)
    .sort(
      (a, b) => a.daysLeft - b.daysLeft || a.policy.policyNo.localeCompare(b.policy.policyNo),
    )
    .map(({ policy, daysLeft }) => ({
      id: policy.id,
      policyNo: policy.policyNo,
      line: policy.line,
      entityName: entityNameById.get(policy.entityId) ?? policy.entityId,
      expiry: policy.expiry,
      daysLeft,
    }));
}

/** Generation stamp in Singapore time, without locale data. */
function formatGeneratedStamp(date: Date): string {
  const sgt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const hours = String(sgt.getUTCHours()).padStart(2, '0');
  const minutes = String(sgt.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(sgt.toISOString().slice(0, 10))}, ${hours}:${minutes} SGT`;
}

/* ------------------------------------------------------------------- page */

export function ReportPage(): JSX.Element {
  const { portfolio, summary, sites, filters, isFiltered } = useFilteredPortfolio();
  const asOf = portfolio.config.effectiveFrom;
  const [generatedAt] = useState(() => new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const pages = usePrintPageCount(rootRef);

  const queue = useMemo(() => buildExceptions(portfolio, sites), [portfolio, sites]);
  const allExceptions = useMemo(
    () => toReportExceptions(queue, portfolio),
    [queue, portfolio],
  );
  const topExceptions = useMemo(() => selectTopExceptions(allExceptions), [allExceptions]);
  const renewals = useMemo(() => buildRenewals(portfolio, asOf), [portfolio, asOf]);

  const scopeEntity =
    filters.entityId === null
      ? null
      : (portfolio.entities.find((entity) => entity.id === filters.entityId) ?? null);
  const scopeUnresolved = filters.entityId !== null && scopeEntity === null;
  const scopeLabel = scopeUnresolved
    ? 'Unavailable — the entity filter matches no entity in the book'
    : scopeEntity !== null
      ? `${scopeEntity.name} · ${portfolio.sites.length} sites`
      : `Group-wide · ${portfolio.sites.length} sites`;

  // A zero here would read as "nothing is insured", which is a different claim
  // from "no scope to compute". Say the second one.
  const figuresAvailable = portfolio.sites.length > 0 && !scopeUnresolved;
  const unavailableReason = scopeUnresolved
    ? 'the scope entity is not in the portfolio'
    : portfolio.sites.length === 0
      ? 'no sites fall inside the current filter'
      : null;

  const filterNotes: string[] = [];
  if (filters.lines !== null) {
    filterNotes.push(filters.lines.length === 0 ? 'no insurance lines' : filters.lines.join(', '));
  }
  if (filters.renewalWindow !== null) filterNotes.push(`renewals ≤ ${filters.renewalWindow} days`);
  if (filters.gapsOnly) filterNotes.push('gaps only');
  if (filters.highRiskOnly) filterNotes.push('high risk only');
  const filterLabel = isFiltered && filterNotes.length > 0 ? filterNotes.join(' · ') : null;

  return (
    <div className="sal-page sal-report" ref={rootRef}>
      <header className="sal-report__head" data-report-section>
        <PageHeader
          eyebrow="Board summary · Renewal review"
          title="Portfolio position for renewal review"
          subtitle={
            <>
              {PROGRAMME_NAME}. Every figure is computed by the Salus engine at the valuation date
              shown; nothing on this page is stored or typed in.
            </>
          }
          actions={
            <button
              type="button"
              className="sal-btn sal-btn--primary sal-report__print"
              onClick={() => {
                window.print();
              }}
            >
              Print / save as PDF
            </button>
          }
        />

        <dl className="sal-report__meta">
          <div className="sal-report__meta-item">
            <dt>Programme</dt>
            <dd>{PROGRAMME_NAME}</dd>
          </div>
          <div className="sal-report__meta-item">
            <dt>Scope</dt>
            <dd>{scopeLabel}</dd>
          </div>
          <div className="sal-report__meta-item">
            <dt>As of</dt>
            <dd>{formatDate(asOf)}</dd>
          </div>
          <div className="sal-report__meta-item">
            <dt>Pages in print</dt>
            <dd data-report-pages>{pages === null ? 'Not measured' : `${pages} (A4)`}</dd>
          </div>
        </dl>

        {filterLabel === null ? null : (
          <p className="sal-report__scopenote" data-screen-only>
            The figures below are filtered: {filterLabel}. Clear the filter bar for the group
            position.
          </p>
        )}
      </header>

      <section className="sal-report__section" data-report-section aria-labelledby="report-position">
        <Card
          title={<span id="report-position">Portfolio position</span>}
          subtitle={`Same figures as the Overview: ${portfolio.entities.length} entities · ${portfolio.sites.length} sites · ${portfolio.policies.filter((policy) => policy.status === 'Active').length} active policies.`}
        >
          {figuresAvailable ? (
            <>
              <div className="sal-kpis sal-report__kpis" data-report-kpis>
                <KpiTile
                  label="Total insured value"
                  value={formatMoneyCompact(summary.tivSgd)}
                  hint={formatSgd(summary.tivSgd)}
                />
                <KpiTile
                  label="Coverage adequacy"
                  value={summary.adequacyPct.toFixed(1)}
                  unit="%"
                  tone={summary.adequacyPct >= 95 ? 'good' : summary.adequacyPct >= 85 ? 'warn' : 'bad'}
                  hint={`${formatMoneyCompact(summary.insuredSgd)} insured of ${formatMoneyCompact(summary.tivSgd)} TIV`}
                />
                <KpiTile
                  label="Open gaps"
                  value={summary.openGaps}
                  tone={summary.openGaps > 0 ? 'bad' : 'good'}
                  hint="Requirement gaps only"
                />
                <KpiTile
                  label="At-risk"
                  value={summary.atRisk}
                  tone={summary.atRisk > 0 ? 'warn' : 'good'}
                  hint="Within tolerance of the required limit, not below it"
                />
                <KpiTile
                  label="Excluded"
                  value={summary.excluded}
                  tone={summary.excluded > 0 ? 'warn' : 'good'}
                  hint="Requirement met by an exclusion"
                />
              </div>
              <p className="sal-report__dfn">
                <strong>Adequacy</strong> is insured value over total insured value, capped per
                site. <strong>Gaps</strong> are contract clauses where placed cover falls short of
                the required limit; <strong>at-risk</strong> is inside the tolerance of that limit;
                <strong> excluded</strong> means an exclusion overrides the requirement. The counts
                are requirement assessments, not sites.
              </p>
            </>
          ) : (
            <p className="sal-report__unavailable" role="status">
              <strong>Figures unavailable.</strong> {unavailableReason ?? 'the scope cannot be resolved'}.
              The pack does not substitute a zero for a figure it cannot compute.
            </p>
          )}
        </Card>
      </section>

      <section className="sal-report__section" data-report-section aria-labelledby="report-exceptions">
        <Card
          title={<span id="report-exceptions">Top five exceptions by value at stake</span>}
          subtitle={
            allExceptions.length === 0
              ? 'No requirement gaps, exclusions, near renewals or under-insured sites in scope.'
              : `${topExceptions.length} of ${allExceptions.length} open items, largest value at stake first.`
          }
          padded={false}
        >
          <div className="sal-table-wrap">
            <table className="sal-table sal-table--dense sal-report__table">
            <caption className="sal-sr-only">
              The five open exceptions with the largest value at stake, with site, requirement,
              status, contract clause and value at stake in SGD
            </caption>
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Requirement</th>
                <th scope="col">Status</th>
                <th scope="col">Clause</th>
                <th scope="col" className="sal-table__cell--right">
                  Value at stake
                </th>
              </tr>
            </thead>
            <tbody>
              {topExceptions.length === 0 ? (
                <tr>
                  <td className="sal-table__empty" colSpan={5}>
                    <span className="sal-table__empty-title">Nothing open</span>
                    Every requirement, exclusion and renewal in scope is clear.
                  </td>
                </tr>
              ) : (
                topExceptions.map((row) => (
                  <tr key={row.id} data-report-exception={row.id}>
                    <td>{row.siteName}</td>
                    <td>
                      <span>{row.requirement}</span>
                      <span className="sal-report__cell-sub">{row.detail}</span>
                    </td>
                    <td>
                      <Tag tone={row.tone}>{row.status}</Tag>
                    </td>
                    <td className="sal-mono">{row.clause ?? '—'}</td>
                    <td className="sal-table__cell--right sal-mono">
                      {formatMoneyCompact(row.valueSgd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </section>

      <section className="sal-report__section" data-report-section aria-labelledby="report-renewals">
        <Card
          title={<span id="report-renewals">Renewals in the next 90 days</span>}
          subtitle={
            renewals.length === 0
              ? `No active policy expires between ${formatDate(asOf)} and 90 days after.`
              : `${renewals.length} active ${renewals.length === 1 ? 'policy' : 'policies'} expiring within 90 days of ${formatDate(asOf)}, soonest first.`
          }
          padded={false}
        >
          <div className="sal-table-wrap">
            <table className="sal-table sal-table--dense sal-report__table">
            <caption className="sal-sr-only">
              Active policies expiring within 90 days of the valuation date, with policy number,
              entity, expiry date and days remaining
            </caption>
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Line</th>
                <th scope="col">Entity</th>
                <th scope="col">Expiry</th>
                <th scope="col" className="sal-table__cell--right">
                  Days left
                </th>
              </tr>
            </thead>
            <tbody>
              {renewals.length === 0 ? (
                <tr>
                  <td className="sal-table__empty" colSpan={5}>
                    <span className="sal-table__empty-title">No renewals in the window</span>
                    Nothing in scope expires within 90 days.
                  </td>
                </tr>
              ) : (
                renewals.map((row) => (
                  <tr key={row.id} data-report-renewal={row.id}>
                    <td className="sal-mono">{row.policyNo}</td>
                    <td>{row.line}</td>
                    <td>{row.entityName}</td>
                    <td>{formatDate(row.expiry)}</td>
                    <td className="sal-table__cell--right sal-mono">{row.daysLeft}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </section>

      <footer className="sal-report__provenance" data-report-section aria-labelledby="report-provenance">
        <h2 className="sal-report__provenance-title" id="report-provenance">
          Provenance
        </h2>
        <dl className="sal-report__provenance-list">
          <dt>Data</dt>
          <dd>
            Synthetic data. Every figure is computed by the Salus engine from the seeded portfolio;
            no client, policy or claims records are used.
          </dd>
          <dt>Valuation date</dt>
          <dd>
            {formatDate(asOf)} (the portfolio config effective date). All money is valued at this
            date.
          </dd>
          <dt>Scope</dt>
          <dd data-report-scope>
            {scopeLabel}
            {filterLabel === null ? '' : ` · filtered: ${filterLabel}`}
          </dd>
          <dt>Generated</dt>
          <dd>{formatGeneratedStamp(generatedAt)}</dd>
          <dt>Page count</dt>
          <dd>
            {pages === null ? 'Not measured' : `${pages} pages`} at A4 with 14 mm margins, estimated
            from the rendered sections; the print dialog's own count is authoritative.
          </dd>
        </dl>
      </footer>
    </div>
  );
}

export default ReportPage;
