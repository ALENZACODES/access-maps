import { useState } from "react";
import type { Language } from "./strings";
import { wavStrings } from "./wavStrings";
import type {
  WavFilter,
  WavSearchResult,
  WavServiceRecord,
  WavUsableAvailability,
} from "./wavTypes";
import { WAV_SERVICE_TYPES, WAV_USABLE_AVAILABILITY } from "./wavTypes";
import { searchWav, wavMunicipalities } from "./wav";
import { wavItemViews } from "./viewModels";

const control = { minHeight: 44, minWidth: 44, font: "inherit" } as const;
const tick = { width: 24, height: 24, marginInlineEnd: 8 } as const;
const choice = {
  display: "flex",
  alignItems: "center",
  minHeight: 44,
} as const;

export interface WavFinderViewProps {
  result: WavSearchResult;
  municipalities: readonly string[];
  filter: WavFilter;
  onFilterChange: (filter: WavFilter) => void;
  language?: Language;
}

/**
 * Stateless finder. Availability is always written as a labelled value, and
 * an empty result is described as unknown, never as "no service".
 */
export function WavFinderView({
  result,
  municipalities,
  filter,
  onFilterChange,
  language = "en",
}: WavFinderViewProps) {
  const t = wavStrings[language];
  const views = wavItemViews(result.items, language);
  const wanted = filter.availability ?? [];
  const types = WAV_SERVICE_TYPES.filter(
    (type): type is Exclude<typeof type, "UNKNOWN"> => type !== "UNKNOWN",
  );

  function toggle(value: WavUsableAvailability, checked: boolean): void {
    const next = checked
      ? [...wanted.filter((item) => item !== value), value]
      : wanted.filter((item) => item !== value);
    const { availability: _dropped, ...rest } = filter;
    onFilterChange(next.length ? { ...rest, availability: next } : rest);
  }

  return (
    <section lang={language} aria-labelledby="wav-finder-heading">
      <h2 id="wav-finder-heading">{t.heading}</h2>
      <p>{t.intro}</p>
      <div>
        <label htmlFor="wav-municipality">{t.municipalityFilter}</label>{" "}
        <select
          id="wav-municipality"
          style={control}
          value={filter.municipality ?? ""}
          onChange={(event) => {
            const { municipality: _dropped, ...rest } = filter;
            onFilterChange(
              event.target.value
                ? { ...rest, municipality: event.target.value }
                : rest,
            );
          }}
        >
          <option value="">{t.allMunicipalities}</option>
          {municipalities.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="wav-type">{t.typeFilter}</label>{" "}
        <select
          id="wav-type"
          style={control}
          value={filter.serviceType ?? ""}
          onChange={(event) => {
            const { serviceType: _dropped, ...rest } = filter;
            const chosen = types.find((type) => type === event.target.value);
            onFilterChange(chosen ? { ...rest, serviceType: chosen } : rest);
          }}
        >
          <option value="">{t.allTypes}</option>
          {types.map((type) => (
            <option key={type} value={type}>{t.serviceTypes[type]}</option>
          ))}
        </select>
      </div>
      <fieldset aria-describedby="wav-availability-help">
        <legend>{t.availabilityLegend}</legend>
        {WAV_USABLE_AVAILABILITY.map((value) => (
          <label key={value} style={choice}>
            <input
              type="checkbox"
              style={tick}
              checked={wanted.includes(value)}
              onChange={(event) => toggle(value, event.target.checked)}
            />
            {t.usableFilter[value]}
          </label>
        ))}
        <p id="wav-availability-help">{t.availabilityHelp}</p>
      </fieldset>
      <p role="status" aria-live="polite">
        {result.coverage === "no_records"
          ? t.noRecords
          : t.resultCount(views.length)}
      </p>
      {views.length > 0 && (
        <ul>
          {views.map((view) => (
            <li key={view.id}>
              <h3>{view.name}</h3>
              {view.sample && <p><strong>{t.sample}</strong></p>}
              <p>
                {t.fields.availability}{": "}
                <strong>{view.availability}</strong>
                {view.availabilityStale && <>{" — "}{t.staleAvailability}</>}
              </p>
              {view.availabilityDated !== null && (
                <p>{t.datedSource}{" "}{view.availabilityDated}</p>
              )}
              <h4>{t.provenance}</h4>
              <dl>
                {view.fields.map((field) => (
                  <div key={field.name}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.href !== null ? (
                        <a href={field.href} rel="noreferrer">{field.value}</a>
                      ) : (
                        field.value
                      )}
                      {field.stale && <>{" — "}{t.stale}</>}
                      <br />
                      {t.source}{": "}{field.source}{"; "}
                      {t.licence}{": "}{field.licence}{"; "}
                      {t.retrieved}{": "}{field.retrieved}{"; "}
                      {field.tier}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface WavFinderProps {
  records: readonly WavServiceRecord[];
  language?: Language;
  now?: Date;
}

export function WavFinder({ records, language = "en", now }: WavFinderProps) {
  const [filter, setFilter] = useState<WavFilter>({});
  return (
    <WavFinderView
      result={searchWav(records, filter, now ?? new Date())}
      municipalities={wavMunicipalities(records)}
      filter={filter}
      onFilterChange={setFilter}
      language={language}
    />
  );
}
