import { useState } from "react";
import type { ConditionRecord, ObstacleDraft } from "./types";
import { CONDITION_TYPES } from "./types";
import type { Language } from "./strings";
import { strings } from "./strings";
import { exportDrafts } from "./drafts";

export interface ConditionsListProps {
  records: readonly ConditionRecord[];
  drafts?: readonly ObstacleDraft[];
  language?: Language;
  now?: Date;
}

export function ConditionsList({
  records,
  drafts = [],
  language = "en",
  now,
}: ConditionsListProps) {
  const [filter, setFilter] = useState<string>("all");
  const [approved, setApproved] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const t = strings[language];
  const currentTime = now ?? new Date();
  const visible = records.filter(
    (record) => filter === "all" || record.type === filter,
  );

  function readableDate(date: string | null): string {
    if (!date || !Number.isFinite(Date.parse(date))) return t.unknown;
    return new Intl.DateTimeFormat(
      language === "fr" ? "fr-CA" : "en-CA",
      { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
    ).format(new Date(date)) + " UTC";
  }

  function isStale(record: ConditionRecord): boolean {
    const fetched = Date.parse(record.last_fetched);
    const checked = record.last_checked
      ? Date.parse(record.last_checked)
      : NaN;
    const latest = Number.isFinite(checked)
      ? Math.max(fetched, checked)
      : fetched;
    return (
      !Number.isFinite(latest) ||
      latest > currentTime.getTime() ||
      currentTime.getTime() - latest >= record.expiry_hours * 3600000
    );
  }

  function download(): void {
    const selected = drafts
      .filter((draft) => approved.includes(draft.id))
      .map((draft) => ({ ...draft, verified_by_person: true as const }));
    if (!selected.length) {
      setMessage(t.noVerified);
      return;
    }
    try {
      exportDrafts(selected);
      setMessage(t.exported);
    } catch {
      setMessage(t.noVerified);
    }
  }

  return (
    <section lang={language} aria-labelledby="conditions-heading">
      <h2 id="conditions-heading">{t.heading}</h2>
      <div>
        <label htmlFor="conditions-type">{t.filter}</label>{" "}
        <select
          id="conditions-type"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">{t.all}</option>
          {CONDITION_TYPES.map((type) => (
            <option key={type} value={type}>{t.types[type]}</option>
          ))}
        </select>
      </div>
      {visible.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <ul>
          {visible.map((record) => (
            <li key={record.id}>
              <h3>{t.types[record.type]}</h3>
              {isStale(record) && <p>{t.needsCheck}</p>}
              <p>{record.fact.value === "UNKNOWN"
                ? t.unknown
                : String(record.fact.value)}</p>
              <dl>
                <dt>{t.source}</dt>
                <dd>{record.fact.source_id}</dd>
                <dt>{t.licence}</dt>
                <dd>{record.fact.licence}</dd>
                <dt>{t.lastFetched}</dt>
                <dd>{readableDate(record.last_fetched)}</dd>
                <dt>{t.lastChecked}</dt>
                <dd>{readableDate(record.last_checked)}</dd>
                <dt>{t.tier}</dt>
                <dd>{record.fact.tier}</dd>
              </dl>
              {record.fact.licence === "ODbL" && (
                <p>{'\u00A9'} OpenStreetMap contributors, ODbL</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <h3>{t.drafts}</h3>
      {drafts.map((draft) => (
        <div key={draft.id}>
          <p>{t.types[draft.type]}{' \u2014 '}{draft.note || t.unknown}</p>
          <label>
            <input
              type="checkbox"
              checked={approved.includes(draft.id)}
              onChange={(event) => {
                setApproved((previous) =>
                  event.target.checked
                    ? [...previous, draft.id]
                    : previous.filter((id) => id !== draft.id),
                );
              }}
            />
            {t.verify}
          </label>
        </div>
      ))}
      <button type="button" onClick={download}>{t.export}</button>
      <p role="status" aria-live="polite">{message}</p>
    </section>
  );
}
