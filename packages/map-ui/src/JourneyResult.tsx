import { useEffect, useId, useRef, useState } from "react";
import { displayValue, prototypeLabel, toMapFeatures, type Journey, type JourneyPlan, type Leg } from "@access-maps/journey";
import { AccessibleMap } from "./AccessibleMap.js";
import { AttributionSources } from "./AttributionSources.js";
import { RouteEvidencePanel } from "./RouteEvidencePanel.js";
import { RouteNeedsPanel } from "./RouteNeedsPanel.js";
import "./route-needs.css";
import { mapCopy, statusLabel } from "./i18n.js";

export function JourneyResult({ plan }: { plan: JourneyPlan }) {
  const text = mapCopy(plan.locale);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const features = toMapFeatures(plan);
  const needsId = useId();
  const [showNeeds, setShowNeeds] = useState(false);

  const before = plan.warnings.filter((warning) => warning.beforeCommit);
  const urgent = [
    plan.offline?.banner,
    plan.systemEvent?.text,
    plan.noGo?.text,
    ...before.map((warning) => warning.text),
    ...plan.supplyNotes.map((note) => note.text),
  ].filter((item): item is string => Boolean(item));
  const urgentText = urgent.join(" ");
  // The live region is always in the page and is filled after the result mounts,
  // so screen readers announce it. A region that arrives already filled is often not read.
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    headingRef.current?.focus();
    setAnnouncement("");
    setShowNeeds(false);
    const timer = setTimeout(() => setAnnouncement(urgentText), 50);
    return () => clearTimeout(timer);
  }, [plan.id, urgentText]);

  const hasBarrier =
    plan.blocked.length > 0 ||
    plan.journeys.some((journey) => journey.legs.some((leg) => leg.stepFree.status === "not-step-free"));

  const drawsOsm = features.some((feature) => feature.odbl);
  const needsButtonLabel = plan.locale === "fr"
    ? (showNeeds ? "Masquer la comparaison des parcours" : "Comparer les parcours selon vos préférences d’accessibilité")
    : (showNeeds ? "Hide route comparison" : "Compare routes with your accessibility preferences");

  return (
    <article className="journey-result">
      <h2 ref={headingRef} tabIndex={-1}>
        {text.resultsHeading}
      </h2>
      {/* Focus lands on the heading when results load, so 911 follows it and is the next Tab stop. */}
      <p className="emergency-call">
        {text.emergency}{text.colon} {plan.emergency.text}{" "}
        <a href="tel:911">911</a>
      </p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <p className="step-free-setting">
        {plan.stepFreeRequired ? text.stepFreeRequiredOn : text.stepFreeRequiredOff}
        {hasBarrier ? null : ` ${text.stepFreeNoEffect}`}
      </p>
      {plan.offline ? <p>{plan.offline.banner}</p> : null}
      {plan.systemEvent ? <p>{plan.systemEvent.text}</p> : null}
      {plan.noGo ? <p>{plan.noGo.text}</p> : null}
      {before.length > 0 ? (
        <section aria-labelledby="before-you-go">
          <h3 id="before-you-go">{text.warningsHeading}</h3>
          <ul>
            {before.map((warning) => (
              <li key={`${warning.code}:${warning.text}`}>{warning.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {plan.supplyNotes.map((note) => (
        <p key={note.text}>{note.text}</p>
      ))}
      {plan.journeys.map((journey, index) => (
        <JourneyBlock key={journey.id} journey={journey} locale={plan.locale} heading="h3" number={index + 1} />
      ))}
      {plan.blocked.length > 0 ? (
        <section aria-labelledby="blocked-options">
          <h3 id="blocked-options">{text.blockedHeading}</h3>
          {plan.blocked.map((journey, index) => (
            <JourneyBlock
              key={journey.id}
              journey={journey}
              locale={plan.locale}
              heading="h4"
              number={plan.journeys.length + index + 1}
            />
          ))}
        </section>
      ) : null}
      <AccessibleMap
        features={features}
        locale={plan.locale}
        attribution={drawsOsm ? text.attributionOsm : text.attributionPlain}
      />
      <AttributionSources plan={plan} />
      <section aria-label={plan.locale === "fr" ? "Comparaison des parcours" : "Route comparison"}>
        <button
          type="button"
          className="route-needs-launch"
          style={{ minHeight: 44, minWidth: 44 }}
          aria-expanded={showNeeds}
          aria-controls={needsId}
          onClick={() => setShowNeeds((previous) => !previous)}
        >
          {needsButtonLabel}
        </button>
        <div id={needsId}>
          {showNeeds ? <RouteNeedsPanel plan={plan} /> : null}
        </div>
      </section>
      <RouteEvidencePanel key={plan.id} plan={plan} />
    </article>
  );
}

function JourneyBlock({
  journey,
  locale,
  heading,
  number,
}: {
  journey: Journey;
  locale: JourneyPlan["locale"];
  heading: "h3" | "h4";
  /** Numbered so that two options with the same leg sequence have different names. */
  number: number;
}) {
  const text = mapCopy(locale);
  const Title = heading;
  const sub: "h4" | "h5" = heading === "h3" ? "h4" : "h5";
  const Sub = sub;
  return (
    <section aria-labelledby={journey.id}>
      <Title id={journey.id}>
        {text.option} {number}. {journey.summary}
      </Title>
      <p>{journey.explanation}</p>
      <p>
        <strong>{journey.weakestLink.text}</strong>
      </p>
      <ol aria-label={text.outboundLegs}>
        {journey.legs.map((leg) => (
          <LegItem key={leg.id} leg={leg} locale={locale} heading={sub} />
        ))}
      </ol>
      <Sub>{text.returnHeading}</Sub>
      <p>{journey.returnJourney.explanation}</p>
      <ol aria-label={text.returnLegs}>
        {journey.returnJourney.legs.map((leg) => (
          <LegItem key={leg.id} leg={leg} locale={locale} heading={sub} />
        ))}
      </ol>
      <Sub>{text.entrance}</Sub>
      <p>{journey.depth.entrance.text}</p>
      <Sub>{text.washroom}</Sub>
      <p>{journey.depth.washroom.text}</p>
      <Sub>{text.parking}</Sub>
      <p>{journey.depth.parking.text}</p>
    </section>
  );
}

function LegItem({
  leg,
  locale,
  heading,
}: {
  leg: Leg;
  locale: JourneyPlan["locale"];
  heading: "h4" | "h5";
}) {
  const text = mapCopy(locale);
  const Title = heading;
  return (
    <li>
      <Title>{leg.title}</Title>
      <p className={`status status-${leg.stepFree.status}`}>{statusLabel(locale, leg.stepFree.status)}</p>
      <p>{leg.note}</p>
      <p>
        {text.surface}{text.colon} {displayValue(locale, leg.surface)}. {text.gradient}{text.colon} {displayValue(locale, leg.gradient)}.
      </p>
      {leg.timing ? (
        <p>
          {leg.timing.label}
          {leg.timing.departure ? `${text.colon} ${leg.timing.departure}` : ""}
          {leg.timing.arrival ? `–${leg.timing.arrival}` : ""}
        </p>
      ) : null}
      <p>
        {text.source}{text.colon} {displayValue(locale, leg.provenance.sourceId)}. {text.licence}{text.colon} {displayValue(locale, leg.provenance.licence)}.{" "}
        {leg.provenance.attribution ? `${text.attribution}${text.colon} ${leg.provenance.attribution}. ` : ""}
        {text.retrieved}{text.colon} {displayValue(locale, leg.provenance.retrievedOn ?? leg.provenance.retrievedAt)}. {prototypeLabel(locale, leg.provenance.tier)}
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
