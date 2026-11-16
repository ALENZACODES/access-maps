import { buildAttributionPage, type ProviderId } from "../../../docs/attribution/index.js";
import type { JourneyPlan } from "@access-maps/journey";

function providersForPlan(plan: JourneyPlan): ProviderId[] {
  const used = new Set<ProviderId>();
  const consider = (value: string | undefined): void => {
    if (!value) return;
    const token = value.toLowerCase();
    if (token.includes("osm") || token.includes("openstreetmap") || token.includes("odbl")) {
      used.add("osm");
    }
    if (
      token.includes("metrolinx") ||
      token.includes("gotransit") ||
      token.includes("go transit") ||
      token.includes("up express")
    ) {
      used.add("metrolinx");
    }
    if (token.includes("ltc") || token.includes("london transit")) {
      used.add("ltc");
    }
  };
  for (const journey of [...plan.journeys, ...plan.blocked]) {
    for (const leg of journey.legs) {
      consider(leg.provenance.sourceId);
      consider(leg.provenance.licence);
      consider(leg.provenance.attribution);
    }
  }
  return [...used];
}

export function AttributionSources({ plan }: { plan: JourneyPlan }) {
  const locale = plan.locale === "fr" ? "fr" : "en";
  const page = buildAttributionPage(locale, providersForPlan(plan));
  if (page.entries.length === 0) return null;
  const headingId = "journey-sources-licences";
  const nbsp = "\u00a0";
  return (
    <section className="journey-attribution" aria-labelledby={headingId}>
      <h2 id={headingId}>{page.heading}</h2>
      {page.entries.map((entry) => (
        <article key={entry.id}>
          <h3>{entry.title}</h3>
          <p>{entry.explanation}</p>
          {entry.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
          <p>{locale === "fr" ? `Licence${nbsp}: ${entry.licence}` : `Licence: ${entry.licence}`}</p>
          <p>
            <a href={entry.sourceUrl}>Source</a>
            {" · "}
            <a href={entry.licenceUrl}>{locale === "fr" ? "Texte de la licence" : "Licence text"}</a>
          </p>
          <p>
            {locale === "fr"
              ? `Conditions consultées le ${entry.termsReviewedOn}. Données en date du${nbsp}: ${entry.datasetAsOf === "UNKNOWN" ? page.unknownLabel : entry.datasetAsOf}.`
              : `Terms reviewed on ${entry.termsReviewedOn}. Dataset as of: ${entry.datasetAsOf === "UNKNOWN" ? page.unknownLabel : entry.datasetAsOf}.`}
          </p>
        </article>
      ))}
    </section>
  );
}
