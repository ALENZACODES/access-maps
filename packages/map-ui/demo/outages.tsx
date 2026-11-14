import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PlanInput, TransitTrip } from "@access-maps/journey";
import { formatTime, loadOutages, planWithOutages, stationStatus, type OutageSnapshot } from "@access-maps/outages";
import { TTC_MANUAL_SEED, TTC_SOURCE, TTC_STOPS } from "@access-maps/outages/seed";
import { OutageJourneyView, StationOutageStatus, type MapLocale } from "../src/index.js";
import "../src/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";

/** Demonstration clock: about 40 minutes after the snapshot feed time. Outage times are compared with it. */
const NOW = "2026-11-13T20:30:00.000Z";

const scenario = {
  sourceId: "scenario-fixture",
  licence: "fixture-not-a-real-dataset",
  retrievedAt: "2026-11-13",
  tier: 1 as const,
  note: "Scenario trip. Not an operator schedule.",
};

function trip(id: string, mode: TransitTrip["mode"], name: string, stops: Array<[string, string]>): TransitTrip {
  return {
    id,
    agencyId: `scenario-${mode}`,
    agencyName: name,
    routeId: id,
    routeName: name,
    mode,
    wheelchairAccessible: "UNKNOWN",
    stopTimes: stops.map(([stopId, time]) => ({ stopId: `gtfs:gtfs-ttc:${stopId}`, arrival: time, departure: time })),
    provenance: scenario,
  };
}

const TRIPS = [
  trip("scenario-line-1", "subway", "Scenario Line 1 trip", [["13831", "15:35"], ["13830", "15:39"]]),
  trip("scenario-bus", "bus", "Scenario bus trip", [["9895", "15:33"], ["14779", "15:50"]]),
  trip("scenario-line-2", "subway", "Scenario Line 2 trip", [["13745", "15:40"], ["13830", "16:10"]]),
];

const JOURNEYS = {
  cedarvale: { lon: -79.4365, lat: 43.6996 },
  pape: { lon: -79.3455, lat: 43.6797 },
} as const;

const WORDS = {
  en: {
    title: "Outage demonstration",
    intro:
      "Stops are TTC records. Trips, times, the origin, and the destination are scenario fixtures, not an operator schedule. Outage text is the dated TTC snapshot of 13 November 2026.",
    clock: "Demonstration clock",
    settings: "Demonstration settings",
    language: "Language",
    offline: "Show the saved copy, as when offline",
    profile: "Power chair profile with a maximum gradient of 5%",
    journey: "Journey",
    fromCedarvale: "From near Cedarvale Station",
    fromPape: "From near Pape Station",
    stations: "Station outage status",
    origin: "Scenario origin",
    destination: "Scenario destination near St Clair West Station",
    loading: "Loading outage status.",
  },
  fr: {
    title: "Démonstration des pannes",
    intro:
      "Les arrêts sont des fiches de la TTC. Les trajets, les heures, l'origine et la destination sont des scénarios, pas un horaire de l'exploitant. Le texte des pannes est l'instantané daté de la TTC du 13 novembre 2026.",
    clock: "Horloge de démonstration",
    settings: "Réglages de démonstration",
    language: "Langue",
    offline: "Afficher la copie enregistrée, comme hors ligne",
    profile: "Profil de fauteuil motorisé avec une pente maximale de 5 %",
    journey: "Trajet",
    fromCedarvale: "Depuis les environs de la station Cedarvale",
    fromPape: "Depuis les environs de la station Pape",
    stations: "État des pannes par station",
    origin: "Origine du scénario",
    destination: "Destination du scénario près de la station St Clair West",
    loading: "Chargement de l'état des pannes.",
  },
} as const;

function Demo() {
  const initial = new URLSearchParams(window.location.search).get("lang") === "fr" ? "fr" : "en";
  const [locale, setLocale] = useState<MapLocale>(initial);
  const [offline, setOffline] = useState(false);
  const [power, setPower] = useState(false);
  const [from, setFrom] = useState<keyof typeof JOURNEYS>("cedarvale");
  const [snapshot, setSnapshot] = useState<OutageSnapshot | null>(null);
  const words = WORDS[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = words.title;
  }, [locale, words.title]);

  useEffect(() => {
    void loadOutages({ source: TTC_SOURCE, manualSeed: TTC_MANUAL_SEED }).then(setSnapshot);
  }, []);

  const result = useMemo(() => {
    if (!snapshot) return null;
    const input: PlanInput = {
      data: { stops: TTC_STOPS, paths: [], venues: [], washrooms: [], trips: TRIPS },
      origin: { id: `origin-${from}`, name: words.origin, ...JOURNEYS[from] },
      destination: { id: "destination", name: words.destination, lon: -79.415, lat: 43.6835 },
      departAt: NOW,
      now: NOW,
      winterMode: false,
      locale,
      offline,
      profile: power ? { chair: "power", maxGradePercent: 5 } : { chair: "manual", maxGradePercent: null },
    };
    return planWithOutages(input, snapshot);
  }, [snapshot, from, locale, offline, power, words.destination, words.origin]);

  return (
    <main>
      <h1>{words.title}</h1>
      <p>{words.intro}</p>
      <p>
        {words.clock}: {formatTime(NOW, locale)}
      </p>
      <fieldset>
        <legend>{words.settings}</legend>
        <div role="group" aria-label={words.language}>
          <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
            English
          </button>{" "}
          <button type="button" lang="fr" aria-pressed={locale === "fr"} onClick={() => setLocale("fr")}>
            Français
          </button>
        </div>
        <p>
          <label>
            <input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} /> {words.offline}
          </label>
        </p>
        <p>
          <label>
            <input type="checkbox" checked={power} onChange={(event) => setPower(event.target.checked)} /> {words.profile}
          </label>
        </p>
      </fieldset>
      <fieldset>
        <legend>{words.journey}</legend>
        <p>
          <label>
            <input type="radio" name="from" checked={from === "cedarvale"} onChange={() => setFrom("cedarvale")} /> {words.fromCedarvale}
          </label>
        </p>
        <p>
          <label>
            <input type="radio" name="from" checked={from === "pape"} onChange={() => setFrom("pape")} /> {words.fromPape}
          </label>
        </p>
      </fieldset>
      {!snapshot || !result ? (
        <p role="status">{words.loading}</p>
      ) : (
        <>
          <section aria-labelledby="stations-heading">
            <h2 id="stations-heading">{words.stations}</h2>
            <StationOutageStatus
              status={stationStatus(snapshot, { networkId: "ttc", stopIds: ["16069", "13832", "13831", "16070"] }, NOW)}
              stationName="Cedarvale"
              locale={locale}
            />
            <StationOutageStatus
              status={stationStatus(snapshot, { networkId: "ttc", stopIds: ["13829", "13830"] }, NOW)}
              stationName="St Clair West"
              locale={locale}
            />
          </section>
          <OutageJourneyView key={`${from}-${locale}-${offline}-${power}`} result={result} stops={TTC_STOPS} locale={locale} offline={offline} />
        </>
      )}
    </main>
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
