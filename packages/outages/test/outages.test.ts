import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertHonest } from "@access-maps/journey";
import { describe, expect, it } from "vitest";
import {
  checkAlert,
  currentOutages,
  loadOutages,
  normalizeAlerts,
  outageCopyKeys,
  outageFeatures,
  outageState,
  planWithOutages,
  stationStatus,
  withRecord,
  type OutageSnapshot,
} from "../src/index.js";
import { TTC_ACCESSIBILITY_SNAPSHOT, TTC_MANUAL_SEED, TTC_SOURCE, TTC_STOPS } from "../seed/index.js";
import { BUS_TRIP, cedarvaleInput, LINE_TRIP, NOW, PAPE_TRIP, papeInput } from "./scenario.js";

const CEDARVALE = ["16069", "13832", "13831", "16070"];
const FEED_TIME = "2026-11-13T19:48:29.000Z";

async function seedSnapshot(): Promise<OutageSnapshot> {
  return loadOutages({ source: TTC_SOURCE, manualSeed: TTC_MANUAL_SEED });
}

async function feedSnapshot(alerts: readonly unknown[] = TTC_ACCESSIBILITY_SNAPSHOT): Promise<OutageSnapshot> {
  return loadOutages({
    source: TTC_SOURCE,
    manualSeed: TTC_MANUAL_SEED,
    readFeed: async () => ({ alerts, feedTime: FEED_TIME }),
  });
}

describe("seed", () => {
  it("matches the dated .ndjson snapshot line for line", () => {
    const path = fileURLToPath(new URL("../seed/gtfs-rt-ttc-accessibility.2026-11-13.ndjson", import.meta.url));
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown);
    expect(TTC_ACCESSIBILITY_SNAPSHOT).toEqual(lines);
    expect(lines).toHaveLength(32);
  });

  it("passes the service-alert shape check for all 32 alerts", () => {
    const { records, rejected } = normalizeAlerts(TTC_ACCESSIBILITY_SNAPSHOT, "ttc");
    expect(rejected).toEqual([]);
    expect(records).toHaveLength(32);
    for (const record of records) {
      expect(record.provenance).toEqual({ sourceId: "gtfs-rt-ttc-accessibility", licence: "OGL-Toronto-1.0", retrievedAt: "2026-11-13", tier: 4 });
      expect(record.reportedAt).toBe(FEED_TIME);
    }
  });

  it("stop records are unchanged imports with source, licence, date, and tier on every field", () => {
    for (const stop of TTC_STOPS) {
      for (const field of Object.values(stop.fields)) {
        expect(field?.source_id).toBe("gtfs-ttc");
        expect(field?.licence).toBe("OGL-Toronto-1.0");
        expect(field?.retrieved_at).toBe("2026-11-13");
        expect([0, 1]).toContain(field?.tier);
      }
    }
  });
});

describe("Day 9: outage records", () => {
  it("D09-1 a seeded outage has station, elevator, status, demonstration source, time, and expiry", async () => {
    const snapshot = await seedSnapshot();
    expect(snapshot.origin).toBe("manual-seed");
    expect(snapshot.demonstration).toBe(true);
    const status = stationStatus(snapshot, { networkId: "ttc", stopIds: CEDARVALE }, NOW);
    expect(status.state).toBe("outage-reported");
    const elevator = status.current.find((record) => record.equipment === "elevator");
    expect(elevator).toMatchObject({
      stationName: "Cedarvale",
      assetLabel: "ELV02-B",
      status: "out_of_service",
      reportedAt: FEED_TIME,
      periods: [{ start: "2026-11-13T14:14:03.000Z", end: null }],
    });
    expect(status.sourceId).toBe("gtfs-rt-ttc-accessibility");
  });

  it("D09-2 a station with no outage says no outage reported, with the source, and an uncovered station is unknown", async () => {
    const snapshot = await seedSnapshot();
    const stClairWest = stationStatus(snapshot, { networkId: "ttc", stopIds: ["13830", "13829"] }, NOW);
    expect(stClairWest.state).toBe("no-outage-reported");
    expect(stClairWest.current).toEqual([]);
    expect(stClairWest.sourceId).toBe("gtfs-rt-ttc-accessibility");
    expect(stClairWest.asOf).toBe(FEED_TIME);
    const go = stationStatus(snapshot, { networkId: "go-transit", stopIds: ["08047"] }, NOW);
    expect(go.state).toBe("unknown");
    expect(stationStatus(snapshot, { networkId: "ttc", stopIds: [] }, NOW).state).toBe("unknown");
  });

  it("D09-3 a demo journey through an affected station shows the outage on that leg", async () => {
    const result = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), await seedSnapshot());
    const hit = result.legOutages.find((item) => item.blocking);
    expect(hit?.stationName).toBe("Cedarvale");
    const journey = [...result.plan.journeys, ...result.plan.blocked].find((item) => item.id === hit?.journeyId);
    const leg = journey?.legs.find((item) => item.id === hit?.legId);
    expect(leg?.mode).toBe("station-access");
    expect(leg?.stepFree.status).toBe("not-step-free");
    expect(leg?.note).toContain("Elevator ELV02-B");
    expect(hit?.lines.join(" ")).toContain("Elevator ELV02-B at Cedarvale: Out of service.");
    expect(hit?.lines.join(" ")).toContain("The operator gave no end time.");
    expect(hit?.lines.join(" ")).toContain("Demonstration data");
    assertHonest(result.plan);
  });

  it("D09-4 maps the feed and falls back to the manual seed when the feed is unavailable", async () => {
    const fromFeed = await feedSnapshot();
    expect(fromFeed).toMatchObject({ origin: "feed", mayBeOutOfDate: false, demonstration: false, asOf: FEED_TIME, feedError: null });
    expect(fromFeed.records).toHaveLength(32);

    const failing = await loadOutages({
      source: TTC_SOURCE,
      manualSeed: TTC_MANUAL_SEED,
      readFeed: async () => {
        throw new Error("network");
      },
    });
    expect(failing).toMatchObject({ origin: "manual-seed", mayBeOutOfDate: true, demonstration: true, feedError: "network" });

    const garbage = await loadOutages({
      source: TTC_SOURCE,
      manualSeed: TTC_MANUAL_SEED,
      readFeed: async () => ({ alerts: [{ id: "x" }], feedTime: FEED_TIME }),
    });
    expect(garbage.origin).toBe("manual-seed");
    expect(garbage.feedError).toBe("feed-all-rejected");
    expect(checkAlert({ id: "x" })).toBe("missing:source_id");
    expect(checkAlert({ ...(TTC_ACCESSIBILITY_SNAPSHOT[0] as object), tier: 3 })).toBe("invalid:tier");
    expect(checkAlert({ ...(TTC_ACCESSIBILITY_SNAPSHOT[0] as object), live: true })).toBe("unexpected:live");
  });

  it("D09-5 a past-expiry outage does not show as current, and a planned one does not either", async () => {
    const snapshot = await seedSnapshot();
    const fairbank = snapshot.records.find((record) => record.stationName === "Fairbank");
    expect(fairbank?.periods[0]?.end).toBe("2026-11-13T20:00:00.000Z");
    expect(outageState(fairbank!, NOW)).toBe("expired");
    expect(outageState(fairbank!, "2026-11-13T19:50:00.000Z")).toBe("current");
    const finchWest = snapshot.records.find((record) => record.assetLabel === "11S1E");
    expect(outageState(finchWest!, NOW)).toBe("planned");
    const current = currentOutages(snapshot, NOW);
    expect(current.map((record) => record.id)).not.toContain(fairbank!.id);
    expect(current.map((record) => record.id)).not.toContain(finchWest!.id);
    const status = stationStatus(snapshot, { networkId: "ttc", stopIds: ["16204"] }, NOW);
    expect(status.state).toBe("no-outage-reported");
    expect(status.notCurrent.map((item) => item.state)).toEqual(["expired"]);
  });

  it("an open-ended record leaves the current view 30 days after the feed time", async () => {
    const snapshot = await seedSnapshot();
    const cedarvale = snapshot.records.find((record) => record.assetLabel === "ELV02-B")!;
    expect(outageState(cedarvale, "2026-12-13T18:00:00.000Z")).toBe("current");
    expect(outageState(cedarvale, "2026-12-13T20:00:00.000Z")).toBe("stale");
  });

  it("escalator outages inform the leg and do not change step-free status", async () => {
    const snapshot = await seedSnapshot();
    const escalatorOnly: OutageSnapshot = { ...snapshot, records: snapshot.records.filter((record) => record.equipment === "escalator") };
    const result = planWithOutages(cedarvaleInput([LINE_TRIP]), escalatorOnly);
    const cedarvale = result.legOutages.find((item) => item.stationName === "Cedarvale");
    expect(cedarvale?.blocking).toBe(false);
    expect(cedarvale?.lines.join(" ")).toContain("An escalator is not a step-free route");
    expect(result.affected).toEqual([]);
  });

  it("does not turn copies of one alert into a correlated network event", async () => {
    const result = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP], { data: { stops: TTC_STOPS, paths: [], venues: [], washrooms: [], trips: [LINE_TRIP, BUS_TRIP] } }), await seedSnapshot());
    expect(result.plan.systemEvent).toBeNull();
  });
});

describe("Day 10: alternatives", () => {
  it("D10-1 offers an alternative that avoids the affected station", async () => {
    const result = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), await seedSnapshot());
    expect(result.affected).toHaveLength(1);
    expect(result.plan.blocked.map((journey) => journey.id)).toContain(result.affected[0]?.id);
    expect(result.alternatives).toHaveLength(1);
    const alternative = result.alternatives[0]!;
    expect(alternative.text).toBe("This option avoids Cedarvale.");
    expect(alternative.journey.legs.some((leg) => leg.mode === "transit" && leg.fromName.startsWith("Eglinton Ave West at Everden Rd"))).toBe(true);
    expect(result.noAlternative).toBeNull();
  });

  it("D10-2 a second affected journey with no way around says so and names Pape", async () => {
    const result = planWithOutages(papeInput([PAPE_TRIP]), await seedSnapshot());
    expect(result.affected).toHaveLength(1);
    expect(result.alternatives).toEqual([]);
    expect(result.noAlternative).toBe("No option in the data avoids Pape. The original route stays listed with the outage.");
    expect(result.legOutages.find((item) => item.blocking)?.lines.join(" ")).toContain("Elevator 8D1L at Pape: Out of service.");
  });

  it("D10-3 changing an outage record updates the journey warnings to match", async () => {
    const snapshot = await feedSnapshot();
    const before = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), snapshot);
    expect(before.affected).toHaveLength(1);
    const cedarvale = snapshot.records.find((record) => record.assetLabel === "ELV02-B")!;
    const ended = withRecord(snapshot, { ...cedarvale, periods: [{ start: cedarvale.periods[0]!.start, end: "2026-11-13T20:10:00.000Z" }] });
    const after = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), ended);
    expect(after.affected).toEqual([]);
    expect(after.legOutages.filter((item) => item.blocking)).toEqual([]);
    expect(after.alternatives).toEqual([]);
    const relabelled = withRecord(snapshot, { ...cedarvale, assetLabel: "ELV99-Z" });
    const changed = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), relabelled);
    expect(changed.legOutages.find((item) => item.blocking)?.lines.join(" ")).toContain("Elevator ELV99-Z at Cedarvale");
  });

  it("D10-4 when the feed fails, last-known status shows with its time and a may-be-out-of-date statement", async () => {
    const lastKnown = await feedSnapshot();
    const fallback = await loadOutages({
      source: TTC_SOURCE,
      manualSeed: TTC_MANUAL_SEED,
      lastKnown,
      readFeed: async () => {
        throw new Error("timeout");
      },
    });
    expect(fallback).toMatchObject({ origin: "last-known", asOf: FEED_TIME, mayBeOutOfDate: true, feedError: "timeout" });
    const result = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), fallback);
    expect(result.statusLine).toMatch(/^The outage feed could not be read\. Showing the last known status from Nov 13, 2026, 14:48\./);
    expect(result.statusLine).toContain("It may be out of date.");
    expect(result.legOutages[0]?.lines.join(" ")).toContain("It may be out of date.");
    const french = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP], { locale: "fr" }), fallback);
    expect(french.statusLine).toContain("Il peut être périmé.");
  });

  it("D10-5 a power chair profile flags any alternative that violates it, naming the setting", async () => {
    const result = planWithOutages(
      cedarvaleInput([LINE_TRIP, BUS_TRIP], { profile: { chair: "power", maxGradePercent: 5 } }),
      await seedSnapshot(),
    );
    const flags = result.alternatives[0]?.flags ?? [];
    expect(flags.map((flag) => flag.setting)).toContain("maxGradePercent");
    expect(flags.find((flag) => flag.setting === "maxGradePercent")?.text.startsWith("Maximum gradient: ")).toBe(true);
    const manual = planWithOutages(
      cedarvaleInput([LINE_TRIP, BUS_TRIP], { profile: { chair: "manual", maxGradePercent: null } }),
      await seedSnapshot(),
    );
    expect(manual.alternatives[0]?.flags.map((flag) => flag.setting)).not.toContain("maxGradePercent");
  });

  it("an unaffected plan offers no alternatives and no statement", async () => {
    const snapshot = await seedSnapshot();
    const empty: OutageSnapshot = { ...snapshot, records: [] };
    const result = planWithOutages(cedarvaleInput([LINE_TRIP, BUS_TRIP]), empty);
    expect(result.affected).toEqual([]);
    expect(result.alternatives).toEqual([]);
    expect(result.noAlternative).toBeNull();
  });
});

describe("Day 12: outage map features", () => {
  it("places current outages on real stops, says last checked offline, and never says live", async () => {
    const snapshot = await feedSnapshot();
    const online = outageFeatures(snapshot, TTC_STOPS, { locale: "en", nowIso: NOW, offline: false });
    const cedarvale = online.features.find((feature) => feature.name === "Elevator: Cedarvale");
    expect(cedarvale?.statusCode).toBe("not-step-free");
    expect(cedarvale?.tier).toBe(4);
    expect(cedarvale?.status).not.toContain("Last checked");
    const offline = outageFeatures(snapshot, TTC_STOPS, { locale: "en", nowIso: NOW, offline: true });
    expect(offline.features.every((feature) => feature.status.includes("Last checked"))).toBe(true);
    const all = [...online.features, ...offline.features].map((feature) => feature.status).join(" ");
    expect(all).not.toMatch(/\blive\b|real-?time/i);
    expect(online.unplaced.length + online.features.length).toBe(currentOutages(snapshot, NOW).length);
  });
});

describe("copy", () => {
  it("has the same keys in English and French", () => {
    const keys = outageCopyKeys();
    expect(keys.fr).toEqual(keys.en);
  });
});
