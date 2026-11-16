import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import type { Language } from "./strings";
import { reportStrings } from "./reportStrings";
import type {
  LocationRef,
  PhotoMeta,
  ReportGroup,
  ReportIssue,
  ReportWarningCode,
  RouteReport,
} from "./reportTypes";
import {
  REPORTER_ROLES,
  REPORT_KINDS,
  REPORT_OBSERVATIONS,
} from "./reportTypes";
import { NOTE_MAX_LENGTH } from "./reports";
import type { ReportFormValues } from "./viewModels";
import { buildReport, reportGroupViews } from "./viewModels";

const control = { minHeight: 44, minWidth: 44, font: "inherit" } as const;
const tick = { width: 24, height: 24, marginInlineEnd: 8 } as const;
const choice = {
  display: "flex",
  alignItems: "center",
  minHeight: 44,
} as const;

export interface RouteReportsListProps {
  groups: readonly ReportGroup[];
  language?: Language;
}

/**
 * Lists assessed report groups. State, tier and expiry are written as text
 * on every item; nothing is conveyed by colour or position alone.
 */
export function RouteReportsList({
  groups,
  language = "en",
}: RouteReportsListProps) {
  const t = reportStrings[language];
  const views = reportGroupViews(groups, language);
  return (
    <section lang={language} aria-labelledby="route-reports-heading">
      <h2 id="route-reports-heading">{t.heading}</h2>
      <p>{t.intro}</p>
      {views.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <ul>
          {views.map((view) => (
            <li key={view.id}>
              <h3>{view.heading}</h3>
              {view.sample && <p><strong>{t.sample}</strong></p>}
              <p><strong>{view.state}</strong></p>
              <dl>
                <dt>{t.tier}</dt>
                <dd>{view.tier}</dd>
                <dt>{t.lastObserved}</dt>
                <dd>{view.lastObserved}</dd>
                <dt>{view.expiryLabel}</dt>
                <dd>{view.expiry}</dd>
                {view.confidence !== null && (
                  <>
                    <dt>{t.confidence}</dt>
                    <dd>{view.confidence}{" — "}{t.confidenceNote}</dd>
                    <dt>{t.reporters}</dt>
                    <dd>{view.reporters}</dd>
                  </>
                )}
                <dt>{t.photo}</dt>
                <dd>{view.photo}</dd>
                <dt>{t.source}</dt>
                <dd>{view.source}</dd>
                <dt>{t.licence}</dt>
                <dd>{view.licence}</dd>
              </dl>
              <h4>{t.individual}</h4>
              <ul>
                {view.reports.map((line) => (
                  <li key={line.id}>
                    {t.observed}{": "}{line.observed}{" — "}
                    {line.observation}{" — "}{line.part}{" — "}
                    {line.role}
                    {line.note !== null && <>{" — "}{line.note}</>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface ReportFormFields {
  kind: string;
  observation: string;
  /** Value of the date-and-time control, in the device's local time. */
  observedLocal: string;
  role: string;
  note: string;
}

export const EMPTY_REPORT_FORM: ReportFormFields = {
  kind: "",
  observation: "",
  observedLocal: "",
  role: "UNKNOWN",
  note: "",
};

export interface RouteReportFormViewProps {
  language?: Language;
  locationLabel: string;
  fields: ReportFormFields;
  issues?: readonly ReportIssue[];
  warnings?: readonly ReportWarningCode[];
  saved?: boolean;
  /** Receives the error summary element so the host can move focus to it. */
  errorSummaryRef?: Ref<HTMLDivElement>;
  onChange: (fields: ReportFormFields) => void;
  onSubmit: () => void;
}

const FIELD_OF_ISSUE: Record<string, string> = {
  kind: "kind",
  "observation.value": "observation",
  observed_at: "observed",
  "observation.retrieved_at": "observed",
  "reporter.role": "role",
  note: "note",
  location: "location",
};

/** Stateless form. All state arrives through props. */
export function RouteReportFormView({
  language = "en",
  locationLabel,
  fields,
  issues = [],
  warnings = [],
  saved = false,
  errorSummaryRef,
  onChange,
  onSubmit,
}: RouteReportFormViewProps) {
  const t = reportStrings[language];
  const messages = new Map<string, string>();
  for (const issue of issues) {
    const key = FIELD_OF_ISSUE[issue.field] ?? "form";
    if (!messages.has(key)) messages.set(key, t.errors[issue.code]);
  }
  const labels: Record<string, string> = {
    kind: t.kindLabel,
    observation: t.observationLegend,
    observed: t.observedLabel,
    role: t.roleLabel,
    note: t.noteLabel,
    location: t.location,
    form: t.formHeading,
  };
  const error = (key: string) =>
    messages.has(key) ? (
      <p id={`route-report-${key}-error`}>{messages.get(key)}</p>
    ) : null;
  const describe = (key: string, help?: string) =>
    [help, messages.has(key) ? `route-report-${key}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      lang={language}
      aria-labelledby="route-report-form-heading"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2 id="route-report-form-heading">{t.formHeading}</h2>
      <p>{t.formIntro}</p>
      {messages.size > 0 && (
        <div role="alert" tabIndex={-1} ref={errorSummaryRef}>
          <p>{t.errorSummary}</p>
          <ul>
            {[...messages].map(([key, message]) => (
              <li key={key}>{labels[key]}{": "}{message}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        {t.location}{": "}{locationLabel}
      </p>
      {error("location")}
      <div>
        <label htmlFor="route-report-kind">{t.kindLabel}</label>{" "}
        <select
          id="route-report-kind"
          style={control}
          required
          value={fields.kind}
          aria-invalid={messages.has("kind") || undefined}
          aria-describedby={describe("kind")}
          onChange={(event) => onChange({ ...fields, kind: event.target.value })}
        >
          <option value="">{"—"}</option>
          {REPORT_KINDS.map((kind) => (
            <option key={kind} value={kind}>{t.kinds[kind]}</option>
          ))}
        </select>
        {error("kind")}
      </div>
      <fieldset aria-describedby={describe("observation")}>
        <legend>{t.observationLegend}</legend>
        {REPORT_OBSERVATIONS.map((value) => (
          <label key={value} style={choice}>
            <input
              type="radio"
              name="route-report-observation"
              style={tick}
              value={value}
              checked={fields.observation === value}
              onChange={() => onChange({ ...fields, observation: value })}
            />
            {t.observations[value]}
          </label>
        ))}
        {error("observation")}
      </fieldset>
      <div>
        <label htmlFor="route-report-observed">{t.observedLabel}</label>{" "}
        <input
          id="route-report-observed"
          type="datetime-local"
          style={control}
          required
          value={fields.observedLocal}
          aria-invalid={messages.has("observed") || undefined}
          aria-describedby={describe("observed", "route-report-observed-help")}
          onChange={(event) =>
            onChange({ ...fields, observedLocal: event.target.value })
          }
        />
        <p id="route-report-observed-help">{t.observedHelp}</p>
        {error("observed")}
      </div>
      <div>
        <label htmlFor="route-report-role">{t.roleLabel}</label>{" "}
        <select
          id="route-report-role"
          style={control}
          value={fields.role}
          aria-invalid={messages.has("role") || undefined}
          aria-describedby={describe("role")}
          onChange={(event) => onChange({ ...fields, role: event.target.value })}
        >
          {REPORTER_ROLES.map((role) => (
            <option key={role} value={role}>{t.roles[role]}</option>
          ))}
        </select>
        {error("role")}
      </div>
      <div>
        <label htmlFor="route-report-note">{t.noteLabel}</label>
        <br />
        <textarea
          id="route-report-note"
          style={{ font: "inherit", width: "100%", maxWidth: "40em" }}
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          value={fields.note}
          aria-invalid={messages.has("note") || undefined}
          aria-describedby={describe("note", "route-report-note-help")}
          onChange={(event) => onChange({ ...fields, note: event.target.value })}
        />
        <p id="route-report-note-help">{t.noteHelp}</p>
        {error("note")}
      </div>
      <button type="submit" style={control}>{t.submit}</button>
      <div role="status" aria-live="polite">
        {saved && <p>{t.saved}</p>}
        {warnings.map((warning) => (
          <p key={warning}>{t.warnings[warning]}</p>
        ))}
      </div>
    </form>
  );
}

/** Local time from a date-and-time control to ISO, or "" when unreadable. */
export function localInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

/** Validates the form and returns the report, or the issues to show. */
export function submitReportForm(
  fields: ReportFormFields,
  context: {
    id: string;
    location: LocationRef;
    source_id: string;
    licence: string;
    reporter_ref: string | null;
    photo?: PhotoMeta;
    now: Date;
  },
) {
  const values = {
    kind: fields.kind,
    observation: fields.observation,
    observed_at: localInputToIso(fields.observedLocal),
    role: fields.role,
    note: fields.note,
  } as ReportFormValues;
  return buildReport(values, context);
}

export interface RouteReportFormProps {
  language?: Language;
  /** The place the host has already resolved. No device location is read. */
  location: LocationRef;
  locationLabel: string;
  sourceId: string;
  /** Licence id the host applies to reports saved on this device. */
  licence: string;
  reporterRef: string | null;
  photo?: PhotoMeta;
  newId: () => string;
  now?: () => Date;
  /** Receives the validated tier 0 report. Storage is the host's decision. */
  onSave: (report: RouteReport) => void;
}

export function RouteReportForm({
  language = "en",
  location,
  locationLabel,
  sourceId,
  licence,
  reporterRef,
  photo,
  newId,
  now = () => new Date(),
  onSave,
}: RouteReportFormProps) {
  const [fields, setFields] = useState<ReportFormFields>(EMPTY_REPORT_FORM);
  const [issues, setIssues] = useState<readonly ReportIssue[]>([]);
  const [warnings, setWarnings] = useState<readonly ReportWarningCode[]>([]);
  const [saved, setSaved] = useState(false);
  const [rejected, setRejected] = useState(0);
  const summary = useRef<HTMLDivElement>(null);

  // After a rejected submission, focus moves to the error summary so the
  // errors are the next thing read and the first field is one Tab away.
  useEffect(() => {
    if (rejected > 0) summary.current?.focus();
  }, [rejected]);

  function submit(): void {
    const result = submitReportForm(fields, {
      id: newId(),
      location,
      source_id: sourceId,
      licence,
      reporter_ref: reporterRef,
      ...(photo ? { photo } : {}),
      now: now(),
    });
    if (!result.ok) {
      setIssues(result.errors);
      setWarnings([]);
      setSaved(false);
      setRejected((count) => count + 1);
      return;
    }
    onSave(result.report);
    setIssues([]);
    setWarnings(result.warnings);
    setSaved(true);
    setFields(EMPTY_REPORT_FORM);
  }

  return (
    <RouteReportFormView
      language={language}
      locationLabel={locationLabel}
      fields={fields}
      issues={issues}
      warnings={warnings}
      saved={saved}
      errorSummaryRef={summary}
      onChange={(next) => {
        setFields(next);
        setSaved(false);
      }}
      onSubmit={submit}
    />
  );
}
