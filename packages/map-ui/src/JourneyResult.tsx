import { useEffect, useRef } from "react";
import { toMapFeatures, type Journey, type JourneyPlan, type Leg } from "@access-maps/journey";
import { AccessibleMap } from "./AccessibleMap.js";
import { mapCopy, statusLabel } from "./i18n.js";

const ATTRIBUTION =
  "Map canvas by MapLibre GL (BSD-3-Clause). This demo uses a plain background, not a tile service. When a basemap uses OpenStreetMap data, credit © OpenStreetMap contributors and the Open Database Licence. No agency, municipality, or project endorsement is implied.";

export function JourneyResult({ plan }: { plan: JourneyPlan }) {
  const text = mapCopy(plan.locale);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const features = toMapFeatures(plan);

  useEffect(() => {
    headingRef.current?.focus();
  }, [plan.id]);

  const before = plan.warnings.filter((warning) => warning.beforeCommit);

  return (
    <article className="journey-result">
      <h2 ref={headingRef} tabIndex={-1}>
        {text.resultsHeading}
      </h2>
      {plan.offline ? <p role="status">{plan.offline.banner}</p> : null}
      {plan.systemEvent ? <p role="status">{plan.systemEvent.text}</p> : null}
      {plan.noGo ? <p role="status">{plan.noGo.text}</p> : null}
      {before.length > 0 ? (
        <section aria-labelledby="before-you-go">
          <h3 id="before-you-go">{text.warningsHeading}</h3>
          <ul>
            {before.map((warning) => (
              <li key={`${warning.code}:${warning.text}`} role="status">
                {warning.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {plan.supplyNotes.map((note) => (
        <p key={note.text} role="status">
          {note.text}
        </p>
      ))}
      {plan.journeys.map((journey) => (
        <JourneyBlock key={journey.id} journey={journey} locale={plan.locale} heading="h3" />
      ))}
      {plan.blocked.length > 0 ? (
        <section aria-labelledby="blocked-options">
          <h3 id="blocked-options">{text.blockedHeading}</h3>
          {plan.blocked.map((journey) => (
            <JourneyBlock key={journey.id} journey={journey} locale={plan.locale} heading="h4" />
          ))}
        </section>
      ) : null}
      <p>
        {text.emergency}: {plan.emergency.text}{" "}
        <a href="tel:911">911</a>
      </p>
      <AccessibleMap features={features} locale={plan.locale} attribution={ATTRIBUTION} />
    </article>
  );
}

function JourneyBlock({
  journey,
  locale,
  heading,
}: {
  journey: Journey;
  locale: JourneyPlan["locale"];
  heading: "h3" | "h4";
}) {
  const text = mapCopy(locale);
  const Title = heading;
  return (
    <section aria-labelledby={journey.id}>
      <Title id={journey.id}>{journey.summary}</Title>
      <p>{journey.explanation}</p>
      <p>
        <strong>{journey.weakestLink.text}</strong>
      </p>
      <ol>
        {journey.legs.map((leg) => (
          <LegItem key={leg.id} leg={leg} locale={locale} />
        ))}
      </ol>
      <h4>{text.returnHeading}</h4>
      <p>{journey.returnJourney.explanation}</p>
      <ol>
        {journey.returnJourney.legs.map((leg) => (
          <LegItem key={leg.id} leg={leg} locale={locale} />
        ))}
      </ol>
      <h4>{text.entrance}</h4>
      <p>{journey.depth.entrance.text}</p>
      <h4>{text.washroom}</h4>
      <p>{journey.depth.washroom.text}</p>
      <h4>{text.parking}</h4>
      <p>{journey.depth.parking.text}</p>
    </section>
  );
}

function LegItem({ leg, locale }: { leg: Leg; locale: JourneyPlan["locale"] }) {
  return (
    <li>
      <h5>{leg.title}</h5>
      <p className={`status status-${leg.stepFree.status}`}>{statusLabel(locale, leg.stepFree.status)}</p>
      <p>{leg.note}</p>
      <p>
        Surface: {leg.surface}. Gradient: {leg.gradient}.
      </p>
      {leg.timing ? (
        <p>
          {leg.timing.label}
          {leg.timing.departure ? `: ${leg.timing.departure}` : ""}
          {leg.timing.arrival ? `–${leg.timing.arrival}` : ""}
        </p>
      ) : null}
      <p>
        Source: {leg.provenance.sourceId}. Tier: {leg.provenance.tier}.
      </p>
      {leg.links.length > 0 ? (
        <ul>
          {leg.links.map((link) => (
            <li key={`${link.label}:${link.phone ?? ""}:${link.href ?? ""}`}>
              {link.href ? <a href={link.href}>{link.label}</a> : link.label}
              {link.phone ? <> <a href={`tel:${link.phone}`}>{link.phone}</a></> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
