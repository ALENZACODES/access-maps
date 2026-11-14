import { planJourney, type MapFeature } from "@access-maps/journey";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AccessibleMap, JourneyResult, mapCopyLocaleKeys } from "../src/index.js";

const features: MapFeature[] = [
  {
    id: "stop-a",
    name: "Stop A",
    kind: "stop",
    status: "unknown. No elevator record.",
    statusCode: "unknown",
    source: "gtfs-fixture",
    licence: "fixture-not-a-real-dataset",
    retrievedAt: "2026-11-13",
    prototypeLabel: "Tier 1. Imported or reported record, unverified by the App. Not a survey.",
    odbl: false,
    tier: 1,
    lon: -79.4,
    lat: 43.7,
  },
  {
    id: "washroom",
    name: "Washroom",
    kind: "washroom",
    status: "unknown. Not recommended.",
    statusCode: "unknown",
    source: "fixture",
    licence: "fixture-not-a-real-dataset",
    retrievedAt: "2026-11-13",
    prototypeLabel: "Unknown. This is not a verification tier.",
    odbl: false,
    tier: null,
    lon: -79.39,
    lat: 43.7,
  },
  {
    id: "elevator",
    name: "Elevator",
    kind: "elevator",
    status: "not-step-free. Out of service.",
    statusCode: "not-step-free",
    source: "elevator-fixture",
    licence: "fixture-not-a-real-dataset",
    retrievedAt: "2026-11-13",
    prototypeLabel: "Tier 4. Imported or reported record, unverified by the App. Not a survey.",
    odbl: false,
    tier: 4,
    lon: -79.395,
    lat: 43.7,
  },
];

describe("AccessibleMap", () => {
  it("lists every feature and moves selection with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <AccessibleMap
        features={features}
        locale="en"
        attribution="© OpenStreetMap contributors would apply to an OpenStreetMap basemap."
      />,
    );
    const buttons = screen.getAllByRole("button").filter((button) => button.closest(".feature-list"));
    expect(buttons).toHaveLength(features.length);
    expect(screen.getByText(/© OpenStreetMap contributors/)).toBeTruthy();
    buttons[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(buttons[1]);
    expect(screen.getByText(/Selected: Washroom/)).toBeTruthy();
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(buttons[2]);
    expect(screen.getByText("▲ Not step-free")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Skip the map canvas/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pan up" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show on map" })).toBeTruthy();
  });

  it("uses the same keys in French and English", () => {
    const keys = mapCopyLocaleKeys();
    expect([...keys.fr].sort()).toEqual([...keys.en].sort());
  });

  it("uses French chrome for the list", () => {
    render(<AccessibleMap features={features} locale="fr" attribution="Attribution de démonstration." />);
    expect(screen.getByRole("heading", { name: "Carte et liste des éléments" })).toBeTruthy();
    expect(screen.getAllByText("? Inconnu").length).toBeGreaterThan(0);
  });
});

describe("JourneyResult", () => {
  it("shows the approach, a warning, and a feature list that matches the plan", async () => {
    const user = userEvent.setup();
    const stamp = {
      source_id: "fixture",
      licence: "fixture-not-a-real-dataset",
      retrieved_at: "2026-11-13",
      tier: 1 as const,
    };
    const plan = planJourney({
      data: {
        stops: [
          {
            id: "a",
            tranche: "transit" as const,
            region: "fixture",
            fields: {
              name: { value: "Stop A", ...stamp },
              lat: { value: 43.7, ...stamp },
              lon: { value: -79.4, ...stamp },
              wheelchair_boarding: { value: "UNKNOWN", ...stamp },
            },
          },
          {
            id: "b",
            tranche: "transit" as const,
            region: "fixture",
            fields: {
              name: { value: "Stop B", ...stamp },
              lat: { value: 43.701, ...stamp },
              lon: { value: -79.39, ...stamp },
              wheelchair_boarding: { value: "UNKNOWN", ...stamp },
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
            mode: "bus" as const,
            wheelchairAccessible: "UNKNOWN" as const,
            stopTimes: [
              { stopId: "a", arrival: "08:10", departure: "08:10" },
              { stopId: "b", arrival: "08:25", departure: "08:25" },
            ],
            provenance: {
              sourceId: "fixture",
              licence: "fixture-not-a-real-dataset",
              retrievedAt: "2026-11-13",
              tier: 1 as const,
              note: "Demo fixture. Not an operator feed.",
            },
          },
        ],
      },
      origin: { id: "home", name: "Home", lon: -79.4, lat: 43.7 },
      destination: { id: "clinic", name: "Clinic", lon: -79.39, lat: 43.7 },
      departAt: "2026-06-15T08:00:00-04:00",
      now: "2026-06-15T07:00:00-04:00",
      winterMode: false,
      profile: { chair: "manual" },
    });
    function Harness() {
      const [current, setCurrent] = useState(plan);
      return (
        <>
          <button type="button" onClick={() => setCurrent({ ...plan, id: "second-plan" })}>
            Load another plan
          </button>
          <JourneyResult plan={current} />
        </>
      );
    }
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Journey results" }));
    expect(screen.getAllByRole("heading", { name: /Approach/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Straight-line distance only/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Scheduled/).length).toBeGreaterThan(0);
    const warning = screen.getAllByRole("status").find((node) => /washroom/i.test(node.textContent ?? ""));
    expect(warning).toBeTruthy();
    const listButtons = screen.getAllByRole("button").filter((button) => button.closest(".feature-list"));
    expect(listButtons.length).toBeGreaterThan(0);
    const emergency = screen.getByRole("link", { name: "911" });
    expect(emergency.getAttribute("href")).toBe("tel:911");
    const article = emergency.closest("article");
    const heading = screen.getByRole("heading", { name: "Journey results" });
    // 911 stays at the top: the first thing after the results heading. Focus lands on the
    // heading when results load, so 911 is the next Tab stop (Day 17 keyboard audit).
    expect(article?.firstElementChild).toBe(heading);
    expect(heading.nextElementSibling).toBe(emergency.parentElement);
    await user.click(screen.getByRole("button", { name: "Load another plan" }));
    expect(document.activeElement).toBe(heading);
    await user.tab();
    expect(document.activeElement).toBe(emergency);
  });

  it("does not show English labels on a French plan", () => {
    const plan = planJourney({
      locale: "fr",
      data: { stops: [], paths: [], venues: [], washrooms: [] },
      origin: { id: "home", name: "Domicile", lon: -79.4, lat: 43.7 },
      destination: { id: "clinic", name: "Clinique", lon: -79.39, lat: 43.7 },
      departAt: "2026-06-15T08:00:00-04:00",
      now: "2026-06-15T07:00:00-04:00",
      winterMode: false,
      profile: { chair: "manual" },
    });
    const view = render(<JourneyResult plan={plan} />);
    expect(screen.getByRole("heading", { name: "Résultats du trajet" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: /Approche|Sortie du domicile/ }).length).toBeGreaterThan(0);
    const page = view.container.textContent ?? "";
    expect(page).not.toContain("Gradient:");
    expect(page).not.toContain("Steps:");
    expect(page).not.toContain("Door width");
    expect(page).not.toContain("home-exit");
    expect(page).not.toContain("unknown.");
    expect(page).not.toContain("not-step-free.");
    expect(screen.getAllByText(/Pente :/).length).toBeGreaterThan(0);
    // The data value UNKNOWN is shown as a French word, with French spacing before the colon.
    expect(page).not.toMatch(/UNKNOWN|INCONNU/);
    expect(page).toContain("Source : Inconnu.");
    expect(page).toContain("Licence : Inconnu.");
    expect(page).toContain("Récupéré : Inconnu.");
    expect(page).not.toMatch(/Source:|Licence:|Récupéré:|Sélectionné:/);
    expect(page).not.toContain("..");
  });

  const osmStamp = { source_id: "osm-ontario", licence: "ODbL-1.0", retrieved_at: "2026-10-01T04:12:00Z", tier: 0 as const };
  const line: Array<[number, number]> = [
    [-79.4, 43.7],
    [-79.39, 43.7],
  ];
  function walkPlan(stamp: { source_id: string; licence: string; retrieved_at: string; tier: 0 }) {
    return planJourney({
      data: {
        stops: [],
        paths: [
          {
            id: "way/1001",
            tranche: "path" as const,
            region: "fixture",
            fields: {
              geometry: { value: line, ...stamp },
              wheelchair: { value: "yes", ...stamp },
              step_count: { value: 0, ...stamp },
            },
          },
        ],
        venues: [],
        washrooms: [],
      },
      origin: { id: "home", name: "Home", lon: -79.4, lat: 43.7 },
      destination: { id: "clinic", name: "Clinic", lon: -79.39, lat: 43.7 },
      departAt: "2026-06-15T08:00:00-04:00",
      now: "2026-06-15T07:00:00-04:00",
      winterMode: false,
      profile: { chair: "manual" },
    });
  }

  it("shows the source, licence, credit, date, and tier on an OpenStreetMap walking leg", () => {
    const view = render(<JourneyResult plan={walkPlan(osmStamp)} />);
    const page = view.container.textContent ?? "";
    expect(page).toContain(
      "Source: osm-ontario. Licence: ODbL-1.0. Attribution: © OpenStreetMap contributors. Retrieved: 2026-10-01. Tier 0.",
    );
    expect(page).not.toContain("Source: graph");
    expect(page).not.toContain("catalog-path");
    expect(view.container.querySelector(".map-attribution")?.textContent).toContain("© OpenStreetMap contributors");
    expect(page).not.toContain("..");
  });

  it("does not credit OpenStreetMap for a path from another source", () => {
    const view = render(
      <JourneyResult
        plan={walkPlan({ source_id: "fixture", licence: "fixture-not-a-real-dataset", retrieved_at: "2026-11-13", tier: 0 })}
      />,
    );
    expect(view.container.textContent ?? "").not.toContain("OpenStreetMap contributors");
    expect(view.container.textContent ?? "").toContain("Source: fixture. Licence: fixture-not-a-real-dataset.");
  });

  it("groups the map controls and lets the skip link move focus to the list", () => {
    const view = render(<JourneyResult plan={walkPlan(osmStamp)} />);
    const group = within(view.container).getByRole("group", { name: "Map controls" });
    expect(group.querySelectorAll("button").length).toBe(7);
    const skip = view.container.querySelector<HTMLAnchorElement>(".skip-link");
    const target = document.getElementById((skip?.getAttribute("href") ?? "").slice(1));
    expect(target?.tagName).toBe("UL");
    expect(target?.getAttribute("tabindex")).toBe("-1");
    target?.focus();
    expect(document.activeElement).toBe(target);
  });

  it("labels the control group in French and reads the status without its symbol", async () => {
    const user = userEvent.setup();
    const plan = { ...walkPlan(osmStamp), locale: "fr" as const };
    const view = render(<JourneyResult plan={plan} />);
    expect(within(view.container).getByRole("group", { name: "Commandes de la carte" })).toBeTruthy();
    const first = view.container.querySelector<HTMLButtonElement>(".feature-list button");
    expect(first).toBeTruthy();
    if (first) await user.click(first);
    const live = view.container.querySelector(".selection-live")?.textContent ?? "";
    expect(live).toContain("Sélectionné :");
    expect(live).not.toMatch(/[■▲●?] /);
  });
});
