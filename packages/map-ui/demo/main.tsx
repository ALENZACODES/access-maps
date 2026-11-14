import { planJourney } from "@access-maps/journey";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { JourneyResult } from "../src/index.js";
import "../src/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";

const plan = planJourney({
  data: {
    stops: [
      {
        id: "a",
        tranche: "transit",
        region: "fixture",
        fields: {
          name: { value: "Scenario stop A", source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
          lat: { value: 43.7, source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
          lon: { value: -79.4, source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
          wheelchair_boarding: { value: "1", source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
        },
      },
      {
        id: "b",
        tranche: "transit",
        region: "fixture",
        fields: {
          name: { value: "Scenario stop B", source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
          lat: { value: 43.701, source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
          lon: { value: -79.395, source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
          wheelchair_boarding: { value: "UNKNOWN", source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 1 },
        },
      },
    ],
    paths: [],
    venues: [],
    washrooms: [],
    trips: [
      {
        id: "bus",
        agencyId: "fixture",
        agencyName: "Fixture agency",
        routeId: "bus",
        routeName: "Fixture bus",
        mode: "bus",
        wheelchairAccessible: "UNKNOWN",
        stopTimes: [
          { stopId: "a", arrival: "08:10", departure: "08:10" },
          { stopId: "b", arrival: "08:25", departure: "08:25" },
        ],
        provenance: {
          sourceId: "fixture",
          licence: "fixture-not-a-real-dataset",
          retrievedAt: "2026-11-13",
          tier: 1,
          note: "Demo fixture. Not an operator feed.",
        },
      },
    ],
  },
  origin: { id: "home", name: "Demo home", lon: -79.401, lat: 43.7 },
  destination: { id: "clinic", name: "Demo clinic", lon: -79.394, lat: 43.701 },
  departAt: "2026-06-15T08:00:00-04:00",
  now: "2026-06-15T07:00:00-04:00",
  winterMode: false,
  profile: { name: "demo", chair: "power", transferSide: null, maxGradePercent: null, maxDistanceMetres: null, maxMinutesBetweenWashrooms: 90, maxTravelMinutes: null, widthMm: null, needsSupportPerson: false, cardsHeld: [], registrations: [], hasSmartphone: true },
});

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Journey demo</h1>
      <p>Fixture data only. Nothing on this page is an operator status or a surveyed place.</p>
      <JourneyResult plan={plan} />
    </main>
  </StrictMode>,
);
