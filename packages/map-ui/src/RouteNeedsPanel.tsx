import { useId, useMemo, useState, type ChangeEvent } from 'react';
import type { JourneyPlan } from '@access-maps/journey';
import { compareRoutes, DEFAULT_PROFILE, focusedObservations, REQUIREMENTS, summarizeComparison,
  withChoice, type Choice, type NeedsProfile, type RequirementId, type RequirementResult } from './routeNeeds.js';
import { needsCopy, type NeedsCopy } from './routeNeedsCopy.js';
import { exportNeedsJson } from './routeNeedsReview.js';

/** A local-only comparison; it never modifies the underlying route records. */
export function RouteNeedsPanel({ plan, onExport }: {
  plan: JourneyPlan;
  onExport?: (json: string) => void;
}) {
  const [profile, setProfile] = useState<NeedsProfile>(() => ({ ...DEFAULT_PROFILE,
    choices: DEFAULT_PROFILE.choices.map((choice) => ({ ...choice })) }));
  const [visibleRequirement, setVisibleRequirement] = useState<RequirementId | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const text = needsCopy(plan.locale);
  const uid = useId();
  const report = useMemo(() => compareRoutes(plan, profile), [plan, profile]);
  const totals = summarizeComparison(report);

  function setChoice(id: RequirementId, patch: Partial<Choice>) {
    setProfile((current) => withChoice(current, id, patch));
  }

  function reset() {
    setProfile({ ...DEFAULT_PROFILE, choices: DEFAULT_PROFILE.choices.map((choice) => ({ ...choice })) });
    setVisibleRequirement('all');
    setExpanded(null);
  }

  function exportData() {
    const json = exportNeedsJson(plan, profile);
    if (json === null) return;
    if (onExport) {
      onExport(json);
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'route-preferences.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby={`${uid}-heading`} className="route-needs">
      <h3 id={`${uid}-heading`}>{text.heading}</h3>
      <p>{text.intro}</p>
      <p className="route-needs-disclaimer">{text.disclaimer}</p>
      <fieldset className="route-needs-controls">
        <legend>{text.preferencesHeading}</legend>
        <div className="route-needs-switches">
          <label><input type="checkbox" checked={profile.includeReturn}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setProfile((current) => ({ ...current, includeReturn: event.target.checked }))} />
            {text.includeReturn}</label>
          <label><input type="checkbox" checked={profile.includeBlocked}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setProfile((current) => ({ ...current, includeBlocked: event.target.checked }))} />
            {text.showBlocked}</label>
        </div>
        <div className="route-needs-scope">
          <label htmlFor={`${uid}-date`}>{text.dateLabel}</label>
          <input id={`${uid}-date`} type="date" value={profile.asOf}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setProfile((current) => ({ ...current, asOf: event.target.value }))} />
          <label htmlFor={`${uid}-age`}>{text.ageLabel}</label>
          <input id={`${uid}-age`} type="number" min={0} max={3650} step={1}
            value={profile.maximumSourceAgeDays}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setProfile((current) => ({ ...current, maximumSourceAgeDays: Number(event.target.value) }))} />
        </div>
        <div className="route-needs-preferences">
          {REQUIREMENTS.map((id) => {
            const choice = profile.choices.find((value) => value.id === id);
            if (!choice) return null;
            return <RequirementControl key={id} id={id} choice={choice} text={text}
              keyPrefix={uid} onChange={(patch) => setChoice(id, patch)} />;
          })}
        </div>
        <button type="button" onClick={reset}>{text.reset}</button>
      </fieldset>
      <section aria-labelledby={`${uid}-results`}>
        <h4 id={`${uid}-results`}>{text.compareHeading}</h4>
        <p>{text.supportedCount}{plan.locale === 'fr' ? '\u00a0:' : ':'} {totals.supported} / {totals.total}</p>
        <p>{text.barrierCount}{plan.locale === 'fr' ? '\u00a0:' : ':'} {totals.barriers}</p>
        <p>{text.unresolved}{plan.locale === 'fr' ? '\u00a0:' : ':'} {totals.unknown}</p>
        <label className="route-needs-filter" htmlFor={`${uid}-filter`}>{text.filtered}
          <select id={`${uid}-filter`} value={visibleRequirement}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setVisibleRequirement(event.target.value as RequirementId | 'all')}>
            <option value="all">{text.all}</option>
            {REQUIREMENTS.map((id) => <option key={id} value={id}>{text.requirements[id]}</option>)}
          </select>
        </label>
        {report.routes.length === 0 ? <p>{text.noRoutes}</p> : (
          <ol className="route-needs-results">
            {report.routes.map((route, index) => {
              const isOpen = expanded === route.routeId;
              const rows = route.requirements.filter((row) => row.priority !== 'off' &&
                (visibleRequirement === 'all' || row.id === visibleRequirement));
              return (
                <li key={route.routeId} className="route-needs-option">
                  <h5>{text.routeLabel} {index + 1}{plan.locale === 'fr' ? '\u00a0:' : ':'} {route.summary}</h5>
                  <p className={`route-needs-status route-needs-status-${route.status}`}>
                    {text.results[route.status]}
                  </p>
                  {route.knownDistanceMetres === null ? <p>{text.noDistance}</p> :
                    <p>{text.routeDistance}{plan.locale === 'fr' ? '\u00a0:' : ':'} {route.knownDistanceMetres} m</p>}
                  <ul>
                    {rows.map((row) => <li key={row.id} className={`route-needs-result-${row.result}`}>
                      <strong>{text.requirements[row.id]}</strong>{plan.locale === 'fr' ? '\u00a0:' : ':'} {text.results[row.result]}
                      {row.affectedLegIds.length ? <small> {text.affectedLegs}{plan.locale === 'fr' ? '\u00a0:' : ':'} {row.affectedLegIds.join(', ')}</small> : null}
                    </li>)}
                  </ul>
                  <button type="button" aria-expanded={isOpen} aria-controls={`${uid}-detail-${index}`}
                    onClick={() => setExpanded((old) => old === route.routeId ? null : route.routeId)}>
                    {isOpen ? text.closeDetails : text.showDetails}
                  </button>
                  <div id={`${uid}-detail-${index}`} hidden={!isOpen}>
                    {isOpen ? <EvidenceDetail route={route} text={text} locale={plan.locale}
                      selected={visibleRequirement} /> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p>{report.preferredRouteId === null ? text.noSupported : text.disclaimer}</p>
        <p>{report.preferredRouteId === null ? text.noSelection :
          `${text.selected}${plan.locale === 'fr' ? '\u00a0:' : ':'} ${report.preferredRouteId}`}</p>
        <button type="button" onClick={exportData} disabled={!report.ok}>{text.export}</button>
        <p className="route-needs-help">{text.exportHelp}</p>
      </section>
    </section>
  );
}

function RequirementControl({ id, choice, text, keyPrefix, onChange }: {
  id: RequirementId;
  choice: Choice;
  text: NeedsCopy;
  keyPrefix: string;
  onChange: (patch: Partial<Choice>) => void;
}) {
  const needsLimit = id === 'distance' || id === 'slope' || id === 'transfers';
  const limitLabel = id === 'distance' ? text.distanceLabel : id === 'slope' ? text.slopeLabel : text.transfersLabel;
  return <div className="route-needs-preference">
    <strong>{text.requirements[id]}</strong>
    <label htmlFor={`${keyPrefix}-${id}-priority`}>{text.choosePriority}</label>
    <select id={`${keyPrefix}-${id}-priority`} value={choice.priority}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ priority: event.target.value as Choice['priority'] })}>
      <option value="essential">{text.priorities.essential}</option>
      <option value="preferred">{text.priorities.preferred}</option>
      <option value="off">{text.priorities.off}</option>
    </select>
    {needsLimit ? <>
      <label htmlFor={`${keyPrefix}-${id}-limit`}>{limitLabel}</label>
      <input id={`${keyPrefix}-${id}-limit`} type="number" min={0} step={id === 'slope' ? 0.1 : 1}
        value={choice.limit ?? ''}
        placeholder={text.limitUnset}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ limit: event.target.value === '' ? null : Number(event.target.value) })} />
    </> : null}
  </div>;
}

function EvidenceDetail({ route, text, locale, selected }: {
  route: ReturnType<typeof compareRoutes>['routes'][number];
  text: NeedsCopy;
  locale: 'en' | 'fr';
  selected: RequirementId | 'all';
}) {
  const requirements = route.requirements.filter((item) => item.priority !== 'off' &&
    (selected === 'all' || item.id === selected));
  return <div className="route-needs-detail">
    <h6>{text.observations}</h6>
    {requirements.map((requirement) => {
      const observations = focusedObservations(route, requirement.id);
      return <section key={requirement.id}>
        <h6>{text.requirements[requirement.id]}</h6>
        {observations.length === 0 ? <p>{text.noEvidence}</p> : (
          <ul>{observations.map((observation, index) => <li key={`${observation.legId}-${observation.code}-${index}`}>
            <strong>{observation.legId}</strong> — {text.results[observation.value === 'YES' ? 'met' :
              observation.value === 'NO' ? 'barrier' : 'UNKNOWN'] as string}
            <dl>
              <dt>{text.direction}</dt><dd>{observation.direction === 'outbound' ? text.outbound : text.returning}</dd>
              <dt>{text.source}</dt><dd>{observation.sourceId}</dd>
              <dt>{text.licence}</dt><dd>{observation.licence}</dd>
              <dt>{text.retrieved}</dt><dd>{observation.retrievedOn}</dd>
              <dt>{text.tier}</dt><dd>{observation.tier ?? 'UNKNOWN'}</dd>
            </dl>
            {locale === 'en' ? observation.explanation : text.results[observation.value === 'YES' ? 'met' :
              observation.value === 'NO' ? 'barrier' : 'UNKNOWN']}
          </li>)}</ul>
        )}
      </section>;
    })}
  </div>;
}
