import { render, screen } from "@testing-library/react";
import { loadOutages, planWithOutages, stationStatus } from "@access-maps/outages";
import { TTC_MANUAL_SEED, TTC_SOURCE, TTC_STOPS } from "@access-maps/outages/seed";
import { describe, expect, it } from "vitest";
import { OutageJourneyView, StationOutageStatus } from "../src/index.js";

const NOW = "2026-11-13T20:30:00.000Z";
const provenance = { sourceId: "scenario-fixture", licence: "fixture-not-a-real-dataset", retrievedAt: "2026-11-13", tier: 1 as const };

describe("outage views", () => {
  it("never shows no-outage as working, and keeps the unknown case unknown", async () => {
    const snapshot = await loadOutages({ source: TTC_SOURCE, manualSeed: TTC_MANUAL_SEED });
    render(
      <>
        <StationOutageStatus status={stationStatus(snapshot, { networkId: "ttc", stopIds: ["13830"] }, NOW)} stationName="St Clair West" locale="en" />
        <StationOutageStatus status={stationStatus(snapshot, { networkId: "go-transit", stopIds: ["08047"] }, NOW)} stationName="Uncovered stop" locale="fr" />
      </>,
    );
    expect(screen.getByText(/This is not a check that the elevator works\./)).toBeTruthy();
    expect(screen.getByText(/L'état des pannes pour cette station est inconnu\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bworking\b|en service\b/i);
  });

  it("renders the affected route with the outage on its leg and states when nothing avoids it", async () => {
    const snapshot = await loadOutages({ source: TTC_SOURCE, manualSeed: TTC_MANUAL_SEED });
    const result = planWithOutages(
      {
        data: {
          stops: TTC_STOPS,
          paths: [],
          venues: [],
          washrooms: [],
          trips: [
            {
              id: "scenario-line-2",
              agencyId: "scenario-subway",
              agencyName: "Scenario subway trip",
              routeId: "scenario-line-2",
              routeName: "Scenario Line 2 trip",
              mode: "subway",
              wheelchairAccessible: "UNKNOWN",
              stopTimes: [
                { stopId: "gtfs:gtfs-ttc:13745", arrival: "15:40", departure: "15:40" },
                { stopId: "gtfs:gtfs-ttc:13830", arrival: "16:10", departure: "16:10" },
              ],
              provenance,
            },
          ],
        },
        origin: { id: "o", name: "Scenario origin", lon: -79.3455, lat: 43.6797 },
        destination: { id: "d", name: "Scenario destination", lon: -79.415, lat: 43.6835 },
        departAt: NOW,
        now: NOW,
        winterMode: false,
      },
      snapshot,
    );
    render(<OutageJourneyView result={result} stops={TTC_STOPS} locale="en" />);
    expect(screen.getAllByRole("note", { name: "Outage on this leg" })[0]?.textContent).toContain("Elevator 8D1L at Pape");
    expect(screen.getByText("No option in the data avoids Pape. The original route stays listed with the outage.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Route with the outage/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
