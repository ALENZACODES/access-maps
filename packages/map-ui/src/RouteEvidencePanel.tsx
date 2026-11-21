import "./route-evidence.css";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { JourneyPlan } from "@access-maps/journey";
import { mapCopy } from "./i18n.js";
import {
  buildRouteEvidence, compareEvidenceOptions, EMPTY_FILTERS, EVIDENCE_COPY,
  evidenceExport, filterEvidence, sortedOptions,
  type EvidenceCategory, type EvidenceDashboard, type EvidenceFilters,
  type EvidenceIssue, type EvidenceLocale, type EvidenceOption,
  type EvidenceSeverity, type EvidenceSort,
} from "./routeEvidence.js";

const SORT_OPTIONS: ReadonlyArray<{ value: EvidenceSort; key: "original" | "uncertainty" | "distanceSort" | "sourceSort" }> = [
  { value: "original", key: "original" },
  { value: "uncertainty", key: "uncertainty" },
  { value: "distance", key: "distanceSort" },
  { value: "source", key: "sourceSort" },
];

const SEVERITY: readonly EvidenceSeverity[] = ["blocking", "caution", "information"];
const CATEGORIES: readonly EvidenceCategory[] = ["access", "time", "source", "surface", "distance", "continuity", "return"];

function IssueRow({ issue, locale }: { issue: EvidenceIssue; locale: EvidenceLocale }) {
  const copy = EVIDENCE_COPY[locale];
  return (
    <li className={`route-evidence-issue route-evidence-${issue.severity}`}>
      <span className="route-evidence-issue-title">{copy[issue.severity]}{mapCopy(locale).colon} {issue.text[locale]}</span>
      <dl>
        <div><dt>{copy.segment}</dt><dd>{issue.legId}</dd></div>
        <div><dt>{copy.direction}</dt><dd>{issue.direction === "outbound" ? copy.outbound : copy.back}</dd></div>
        <div><dt>{copy.source}</dt><dd>{issue.sourceId}</dd></div>
        <div><dt>{copy.licence}</dt><dd>{issue.licence}</dd></div>
        <div><dt>{copy.date}</dt><dd>{issue.retrievedOn}</dd></div>
        <div><dt>{copy.tier}</dt><dd>{issue.tier ?? "UNKNOWN"}</dd></div>
      </dl>
    </li>
  );
}

function IssueFilters({
  filters, change, locale,
}: {
  filters: EvidenceFilters;
  change: (next: EvidenceFilters) => void;
  locale: EvidenceLocale;
}) {
  const copy = EVIDENCE_COPY[locale];
  const base = useId();
  const field = <K extends keyof EvidenceFilters>(key: K, value: EvidenceFilters[K]): void => {
    change({ ...filters, [key]: value });
  };
  return (
    <div className="route-evidence-filters" role="group" aria-label={copy.unresolved}>
      <div>
        <label htmlFor={`${base}-direction`}>{copy.direction}</label>
        <select id={`${base}-direction`} value={filters.direction} onChange={(event) => field("direction", event.target.value as EvidenceFilters["direction"])}>
          <option value="all">{copy.all}</option>
          <option value="outbound">{copy.outbound}</option>
          <option value="return">{copy.back}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${base}-severity`}>{copy.severity}</label>
        <select id={`${base}-severity`} value={filters.severity} onChange={(event) => field("severity", event.target.value as EvidenceFilters["severity"])}>
          <option value="all">{copy.all}</option>
          {SEVERITY.map((name) => <option value={name} key={name}>{copy[name]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${base}-category`}>{copy.category}</label>
        <select id={`${base}-category`} value={filters.category} onChange={(event) => field("category", event.target.value as EvidenceFilters["category"])}>
          <option value="all">{copy.all}</option>
          {CATEGORIES.map((name) => <option value={name} key={name}>{copy[name]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${base}-search`}>{copy.query}</label>
        <input id={`${base}-search`} type="search" value={filters.query} onChange={(event) => field("query", event.target.value)} />
      </div>
      <button type="button" onClick={() => change(EMPTY_FILTERS)}>{copy.clear}</button>
    </div>
  );
}

function SegmentDetails({ option, locale }: { option: EvidenceOption; locale: EvidenceLocale }) {
  const copy = EVIDENCE_COPY[locale];
  return (
    <div className="route-evidence-segments">
      {option.segments.map((part) => (
        <section key={part.key} className={`route-evidence-segment route-evidence-status-${part.status.toLowerCase()}`}>
          <h5>{part.title}</h5>
          <dl>
            <div><dt>{copy.direction}</dt><dd>{part.direction === "outbound" ? copy.outbound : copy.back}</dd></div>
            <div><dt>{copy.segmentStatus}</dt><dd>{part.status}</dd></div>
            <div><dt>{copy.surface}</dt><dd>{part.surface}</dd></div>
            <div><dt>{copy.distance}</dt><dd>{part.distanceMetres ?? copy.unknownDistance}</dd></div>
            <div><dt>{copy.source}</dt><dd>{part.sourceId}</dd></div>
            <div><dt>{copy.licence}</dt><dd>{part.licence}</dd></div>
            <div><dt>{copy.date}</dt><dd>{part.observedOn}</dd></div>
            <div><dt>{copy.tier}</dt><dd>{part.tier ?? "UNKNOWN"}</dd></div>
          </dl>
          {part.attribution ? <p>{part.attribution}</p> : null}
        </section>
      ))}
    </div>
  );
}

function SourceTable({ option, locale }: { option: EvidenceOption; locale: EvidenceLocale }) {
  const copy = EVIDENCE_COPY[locale];
  if (!option.sources.length) return <p>{copy.missing}</p>;
  return (
    <div className="route-evidence-scroll">
      <table>
        <caption>{copy.sources}</caption>
        <thead><tr><th scope="col">{copy.source}</th><th scope="col">{copy.licence}</th><th scope="col">{copy.date}</th><th scope="col">{copy.tier}</th></tr></thead>
        <tbody>
          {option.sources.map((source, index) => (
            <tr key={`${source.id}-${source.retrievedOn}-${index}`}>
              <th scope="row">{source.id}</th>
              <td>{source.licence}</td>
              <td>{source.retrievedOn}</td>
              <td>{source.tier ?? "UNKNOWN"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeferredDetails({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      {open ? children : null}
    </details>
  );
}

const ISSUES_PER_PAGE = 3;

function IssuePages({ id, issues, locale }: { id: string; issues: readonly EvidenceIssue[]; locale: EvidenceLocale }) {
  const copy = EVIDENCE_COPY[locale];
  const [requestedPage, setPage] = useState(0);
  const lastPage = Math.ceil(issues.length / ISSUES_PER_PAGE) - 1;
  const page = Math.min(requestedPage, lastPage);
  const start = page * ISSUES_PER_PAGE;
  const end = Math.min(start + ISSUES_PER_PAGE, issues.length);
  const rangeRef = useRef<HTMLParagraphElement>(null);
  const focusAfterPageChange = useRef(false);

  function goToPage(next: number) {
    focusAfterPageChange.current = true;
    setPage(next);
  }

  useLayoutEffect(() => {
    if (focusAfterPageChange.current) {
      rangeRef.current?.focus();
      focusAfterPageChange.current = false;
    }
  }, [page]);

  return (
    <>
      <p id={`${id}-range`} ref={rangeRef} tabIndex={-1}>
        {copy.itemsShown}{mapCopy(locale).colon} {start + 1}–{end} {copy.ofTotal} {issues.length}
      </p>
      <ul id={id} className="route-evidence-issues" aria-describedby={`${id}-range`}>
        {issues.slice(start, end).map((item) => <IssueRow issue={item} key={item.id} locale={locale} />)}
      </ul>
      {lastPage > 0 ? (
        <div className="route-evidence-pagination">
          <button type="button" aria-controls={id} disabled={page === 0}
            onClick={() => goToPage(page - 1)}>{copy.previousIssues}</button>
          <button type="button" aria-controls={id} disabled={page === lastPage}
            onClick={() => goToPage(page + 1)}>{copy.nextIssues}</button>
        </div>
      ) : null}
    </>
  );
}

function OptionReview({
  option, locale, filters, selected, select,
}: {
  option: EvidenceOption;
  locale: EvidenceLocale;
  filters: EvidenceFilters;
  selected: boolean;
  select: () => void;
}) {
  const copy = EVIDENCE_COPY[locale];
  const id = useId();
  const issues = useMemo(() => filterEvidence(option, filters), [option, filters]);
  const filterKey = JSON.stringify([filters.direction, filters.severity, filters.category, filters.query]);
  return (
    <section className="route-evidence-option" aria-label={`${copy.options}${mapCopy(locale).colon} ${option.title}`}>
      <header>
        <h4>{option.title}</h4>
        <p className={`route-evidence-outcome route-evidence-outcome-${option.status.toLowerCase()}`}>
          {copy[option.status === "UNKNOWN" ? "unknown" : option.status]}
        </p>
      </header>
      <p>{option.explanation}</p>
      <p>{copy.unresolved}{mapCopy(locale).colon} {option.totals.caution + option.totals.blocking}</p>
      <p>{copy.measuredDistance}{mapCopy(locale).colon} {option.distanceMetres ?? copy.unknownDistance}</p>
      <button type="button" aria-pressed={selected} onClick={select}>{copy.compare}</button>
      <DeferredDetails label={copy.segment}><SegmentDetails option={option} locale={locale} /></DeferredDetails>
      <DeferredDetails label={copy.sources}><SourceTable option={option} locale={locale} /></DeferredDetails>
      <h5>{copy.unresolved}</h5>
      {issues.length ? <IssuePages key={filterKey} id={id} issues={issues} locale={locale} /> :
        <p>{option.issues.length ? copy.noMatch : copy.noIssues}</p>}
    </section>
  );
}

export interface RouteEvidencePanelProps {
  readonly plan: JourneyPlan;
  /** Start collapsed to preserve the existing results and emergency focus order. */
  readonly initiallyOpen?: boolean;
  readonly onExport?: (json: string) => void;
}

function EvidenceComparison({
  dashboard, firstId, secondId, locale,
}: {
  dashboard: EvidenceDashboard;
  firstId: string;
  secondId: string;
  locale: EvidenceLocale;
}) {
  const copy = EVIDENCE_COPY[locale];
  const first = dashboard.options.find((value) => value.id === firstId);
  const second = dashboard.options.find((value) => value.id === secondId);
  if (!first || !second || first.id === second.id) return null;
  const differences = compareEvidenceOptions(first, second);
  return (
    <section aria-label={copy.explain} className="route-evidence-compare">
      <h4>{copy.explain}</h4>
      <p>{first.title} / {second.title}</p>
      {!differences.length ? <p>{copy.none}</p> : (
        <div className="route-evidence-scroll"><table>
          <thead><tr><th scope="col">{copy.category}</th><th scope="col">{first.title}</th><th scope="col">{second.title}</th></tr></thead>
          <tbody>{differences.map((difference) => (
            <tr key={difference.code}>
              <th scope="row">{difference.label[locale]}</th>
              <td>{difference.valueA}</td><td>{difference.valueB}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

export function RouteEvidencePanel({ plan, initiallyOpen = false, onExport }: RouteEvidencePanelProps) {
  const sortId = useId();
  const exportId = useId();
  const locale: EvidenceLocale = plan.locale;
  const copy = EVIDENCE_COPY[locale];
  const [open, setOpen] = useState(initiallyOpen);
  const [filters, setFilters] = useState<EvidenceFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<EvidenceSort>("original");
  const [selectedFirst, setFirst] = useState("");
  const [selectedSecond, setSecond] = useState("");
  const [preparedJson, setPreparedJson] = useState("");
  const dashboard = useMemo(() => buildRouteEvidence(plan), [plan]);
  const options = useMemo(() => sortedOptions(dashboard.options, sort), [dashboard.options, sort]);
  const toggleComparison = (id: string): void => {
    if (id === selectedFirst) { setFirst(""); return; }
    if (id === selectedSecond) { setSecond(""); return; }
    if (!selectedFirst) { setFirst(id); return; }
    setSecond(id);
  };
  const exportReview = (): void => {
    const text = evidenceExport(dashboard);
    onExport?.(text);
    setPreparedJson(text);
    if (!onExport && typeof URL.createObjectURL === "function") {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "route-evidence-review.json";
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    }
  };
  return (
    <section className="route-evidence-panel" aria-label={copy.heading}>
      <h3>{copy.heading}</h3>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? copy.hide : copy.review}
      </button>
      {open ? (
        <div className="route-evidence-body">
          <p>{copy.introduction}</p>
          <p>{copy.options}{mapCopy(locale).colon} {dashboard.summary.options}. {copy.unresolved}{mapCopy(locale).colon} {dashboard.issues.length}.</p>
          <p>{copy.notAdvice}</p>
          <div className="route-evidence-sort">
            <label htmlFor={sortId}>{copy.sort}</label>
            <select id={sortId} value={sort} onChange={(event) => setSort(event.target.value as EvidenceSort)}>
              {SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{copy[item.key]}</option>)}
            </select>
          </div>
          <IssueFilters filters={filters} change={setFilters} locale={locale} />
          {!options.length ? <p>{copy.noOptions}</p> : (
            <div className="route-evidence-option-list">
              {options.map((option) => (
                <OptionReview option={option} key={option.id} locale={locale} filters={filters}
                  selected={option.id === selectedFirst || option.id === selectedSecond}
                  select={() => toggleComparison(option.id)} />
              ))}
            </div>
          )}
          <EvidenceComparison dashboard={dashboard} firstId={selectedFirst} secondId={selectedSecond} locale={locale} />
          <button type="button" onClick={exportReview}>{copy.save}</button>
          {preparedJson ? (
            <div>
              <p role="status">{copy.saved}</p>
              <div className="route-evidence-export-label">
                <label htmlFor={exportId}>{copy.copy}</label>
                <textarea id={exportId} rows={8} readOnly value={preparedJson} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
