import "./route-evidence.css";
import { useId, useMemo, useState } from "react";
import type { JourneyPlan } from "@access-maps/journey";
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
      <span className="route-evidence-issue-title">{copy[issue.severity]}: {issue.text[locale]}</span>
      <dl>
        <div><dt>{copy.segment}</dt><dd>{issue.legId}</dd></div>
        <div><dt>{copy.direction}</dt><dd>{issue.direction === "outbound" ? copy.outbound : copy.back}</dd></div>
        <div><dt>{copy.source}</dt><dd>{issue.sourceId}</dd></div>
        <div><dt>{copy.date}</dt><dd>{issue.observedOn}</dd></div>
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
      <label htmlFor={`${base}-direction`}>{copy.direction}
        <select id={`${base}-direction`} value={filters.direction} onChange={(event) => field("direction", event.target.value as EvidenceFilters["direction"])}>
          <option value="all">{copy.all}</option>
          <option value="outbound">{copy.outbound}</option>
          <option value="return">{copy.back}</option>
        </select>
      </label>
      <label htmlFor={`${base}-severity`}>{copy.severity}
        <select id={`${base}-severity`} value={filters.severity} onChange={(event) => field("severity", event.target.value as EvidenceFilters["severity"])}>
          <option value="all">{copy.all}</option>
          {SEVERITY.map((name) => <option value={name} key={name}>{copy[name]}</option>)}
        </select>
      </label>
      <label htmlFor={`${base}-category`}>{copy.category}
        <select id={`${base}-category`} value={filters.category} onChange={(event) => field("category", event.target.value as EvidenceFilters["category"])}>
          <option value="all">{copy.all}</option>
          {CATEGORIES.map((name) => <option value={name} key={name}>{copy[name]}</option>)}
        </select>
      </label>
      <label htmlFor={`${base}-search`}>{copy.query}
        <input id={`${base}-search`} type="search" value={filters.query} onChange={(event) => field("query", event.target.value)} />
      </label>
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
  const issues = filterEvidence(option, filters);
  return (
    <section className="route-evidence-option" aria-label={`${copy.options}: ${option.title}`}>
      <header>
        <h4>{option.title}</h4>
        <p className={`route-evidence-outcome route-evidence-outcome-${option.status.toLowerCase()}`}>
          {copy[option.status === "UNKNOWN" ? "unknown" : option.status]}
        </p>
      </header>
      <p>{option.explanation}</p>
      <p>{copy.unresolved}: {option.totals.caution + option.totals.blocking}</p>
      <p>{copy.measuredDistance}: {option.distanceMetres ?? copy.unknownDistance}</p>
      <button type="button" aria-pressed={selected} onClick={select}>{copy.compare}</button>
      <details>
        <summary>{copy.segment}</summary>
        <SegmentDetails option={option} locale={locale} />
      </details>
      <details>
        <summary>{copy.sources}</summary>
        <SourceTable option={option} locale={locale} />
      </details>
      <h5>{copy.unresolved}</h5>
      {issues.length ? <ul className="route-evidence-issues">{issues.map((item) => <IssueRow issue={item} key={item.id} locale={locale} />)}</ul> :
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
      <p>{copy.introduction}</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? copy.hide : copy.review}
      </button>
      {open ? (
        <div className="route-evidence-body">
          <p>{copy.options}: {dashboard.summary.options}. {copy.unresolved}: {dashboard.issues.length}.</p>
          <p>{copy.notAdvice}</p>
          <label className="route-evidence-sort">{copy.sort}
            <select value={sort} onChange={(event) => setSort(event.target.value as EvidenceSort)}>
              {SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{copy[item.key]}</option>)}
            </select>
          </label>
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
              <label className="route-evidence-export-label">{copy.copy}
                <textarea rows={8} readOnly value={preparedJson} />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
