import { useId, useMemo, useState, type ReactNode } from "react";
import { toMapFeatures, type ImportedRecord, type Journey, type JourneyPlan, type Leg } from "@access-maps/journey";
import {
  describeOutage,
  expiresAt,
  formatTime,
  outageCopy,
  outageFeatures,
  type LegOutage,
  type OutagePlan,
  type OutageRecord,
  type StationStatus,
} from "@access-maps/outages";
import { AccessibleMap } from "./AccessibleMap.js";
import { mapCopy, statusLabel, type MapLocale } from "./i18n.js";

function OutageFacts({ record, locale }: { record: OutageRecord; locale: MapLocale }) {
  const text = mapCopy(locale);
  const words = outageCopy(locale);
  const end = expiresAt(record);
  return (
    <dl className="outage-facts">
      <div>
        <dt>{text.station}</dt>
        <dd>{record.stationName === "UNKNOWN" ? words.stationUnknownName : record.stationName}</dd>
      </div>
      <div>
        <dt>{text.equipment}</dt>
        <dd>
          {words.equipment[record.equipment]}
          {record.assetLabel ? ` ${record.assetLabel}` : ` (${words.assetUnnamed})`}
        </dd>
      </div>
      <div>
        <dt>{text.statusWord}</dt>
        <dd>{record.status === "out_of_service" ? words.statusOut : words.statusUnknown}</dd>
      </div>
      <div>
        <dt>{text.reported}</dt>
        <dd>{formatTime(record.reportedAt, locale)}</dd>
      </div>
      <div>
        <dt>{text.expires}</dt>
        <dd>{end ? formatTime(end, locale) : text.noEndTime}</dd>
      </div>
      <div>
        <dt>{text.source}</dt>
        <dd>
          {record.provenance.sourceId}. {text.licence}: {record.provenance.licence}. {text.retrieved}:{" "}
          {record.provenance.retrievedAt}. {text.tierFour}
        </dd>
      </div>
      <div>
        <dt>{text.operatorText}</dt>
        <dd lang={record.effectLanguage}>{record.effectNote}</dd>
      </div>
    </dl>
  );
}

/** Outage status for one station. "No outage reported" is never shown as "working". */
export function StationOutageStatus({
  status,
  stationName,
  locale,
}: {
  status: StationStatus;
  stationName: string;
  locale: MapLocale;
}) {
  const words = outageCopy(locale);
  const text = mapCopy(locale);
  const headingId = useId();
  const asOf = formatTime(status.asOf, locale);
  const lead =
    status.state === "outage-reported"
      ? words.outageReported
      : status.state === "no-outage-reported"
        ? words.noOutage(status.sourceId, asOf)
        : words.stationUnknown;
  return (
    <section className="station-outage" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {text.station}: {stationName}
      </h3>
      <p>
        <strong>{lead}</strong>
      </p>
      {status.mayBeOutOfDate ? (
        <p>{status.origin === "last-known" ? words.lastKnown(asOf) : words.manualSeed(asOf)}</p>
      ) : null}
      {status.demonstration ? <p>{words.demonstration}</p> : null}
      {status.current.length > 0 ? (
        <ul className="outage-list">
          {status.current.map((record) => (
            <li key={record.id}>
              <OutageFacts record={record} locale={locale} />
            </li>
          ))}
        </ul>
      ) : null}
      {status.notCurrent.length > 0 ? (
        <>
          <h4>{text.notCounted}</h4>
          <ul>
            {status.notCurrent.map(({ record, state }) => (
              <li key={record.id}>
                {describeOutage(record, locale)} {words.states[state]}.
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function LegRow({ leg, outages, locale }: { leg: Leg; outages: LegOutage[]; locale: MapLocale }) {
  const text = mapCopy(locale);
  const mine = outages.filter((item) => item.legId === leg.id);
  return (
    <li>
      <h4>{leg.title}</h4>
      <p className={`status status-${leg.stepFree.status}`}>{statusLabel(locale, leg.stepFree.status)}</p>
      <p>{leg.note}</p>
      {leg.timing ? (
        <p>
          {leg.timing.label}
          {leg.timing.departure ? `: ${leg.timing.departure}` : ""}
          {leg.timing.arrival ? `–${leg.timing.arrival}` : ""}
        </p>
      ) : null}
      {mine.length > 0 ? (
        <div className="leg-outage" role="note" aria-label={text.outageOnLeg}>
          <p>
            <strong>{text.outageOnLeg}</strong>
          </p>
          {mine.flatMap((item) => item.lines).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function RouteBlock({
  journey,
  label,
  outages,
  locale,
  children,
}: {
  journey: Journey;
  label: string;
  outages: LegOutage[];
  locale: MapLocale;
  children?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="route-block" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {label}: {journey.summary}
      </h3>
      {children}
      <p>{journey.explanation}</p>
      <ol>
        {journey.legs.map((leg) => (
          <LegRow key={leg.id} leg={leg} outages={outages} locale={locale} />
        ))}
      </ol>
    </section>
  );
}

/**
 * The route that passes an outage and every option that avoids it, both reachable by keyboard.
 * The route switch only changes which route the feature list and map show.
 */
export function OutageJourneyView({
  result,
  stops,
  locale,
  offline = false,
}: {
  result: OutagePlan;
  stops: ImportedRecord[];
  locale: MapLocale;
  offline?: boolean;
}) {
  const text = mapCopy(locale);
  const words = outageCopy(locale);
  const plan: JourneyPlan = result.plan;
  const routes = useMemo(
    () => [
      ...result.affected.map((journey) => ({ journey, label: text.originalRoute })),
      ...result.alternatives.map((alternative, index) => ({ journey: alternative.journey, label: `${text.alternative} ${index + 1}` })),
    ],
    [result, text.alternative, text.originalRoute],
  );
  const [selected, setSelected] = useState<string | null>(routes[0]?.journey.id ?? null);
  const features = useMemo(() => {
    const legs = toMapFeatures(plan).filter((feature) => selected !== null && feature.id.startsWith(`${selected}:`));
    const outages = outageFeatures(result.snapshot, stops, { locale, nowIso: plan.now, offline }).features;
    return [...outages, ...legs];
  }, [plan, result.snapshot, selected, stops, locale, offline]);

  return (
    <article className="outage-journey">
      <h2>{text.outageHeading}</h2>
      <p role="status">{offline ? words.lastChecked(formatTime(result.snapshot.asOf, locale)) : result.statusLine}</p>
      {result.snapshot.demonstration ? <p>{words.demonstration}</p> : null}
      {plan.offline ? <p>{plan.offline.banner}</p> : null}
      <p className="emergency-call">
        {text.emergency}: {plan.emergency.text} <a href="tel:911">911</a>
      </p>
      {result.affected.length === 0 ? <p>{text.noAffected}</p> : null}
      {result.affected.map((journey) => (
        <RouteBlock key={journey.id} journey={journey} label={text.originalRoute} outages={result.legOutages} locale={locale} />
      ))}
      {result.affected.length > 0 ? (
        <section aria-labelledby="alternatives-heading">
          <h2 id="alternatives-heading">{text.alternativesHeading}</h2>
          {result.noAlternative ? (
            <p>
              <strong>{result.noAlternative}</strong>
            </p>
          ) : null}
          {result.alternatives.map((alternative, index) => (
            <RouteBlock
              key={alternative.journey.id}
              journey={alternative.journey}
              label={`${text.alternative} ${index + 1}`}
              outages={result.legOutages}
              locale={locale}
            >
              <p>{alternative.text}</p>
              <h4>{text.profileChecks}</h4>
              {alternative.flags.length > 0 ? (
                <ul>
                  {alternative.flags.map((flag) => (
                    <li key={flag.text}>{flag.text}</li>
                  ))}
                </ul>
              ) : (
                <p>{text.noProfileFlags}</p>
              )}
            </RouteBlock>
          ))}
        </section>
      ) : null}
      {routes.length > 0 ? (
        <div className="route-switch" role="group" aria-label={text.routeChoice}>
          {routes.map((route) => (
            <button
              key={route.journey.id}
              type="button"
              aria-pressed={selected === route.journey.id}
              onClick={() => setSelected(route.journey.id)}
            >
              {route.label}
              {selected === route.journey.id ? ` (${text.shown})` : ""}
            </button>
          ))}
        </div>
      ) : null}
      <AccessibleMap features={features} locale={locale} attribution={`${text.attributionTtc} ${text.attributionPlain}`} />
    </article>
  );
}
