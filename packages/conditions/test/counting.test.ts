import { describe, expect, it } from "vitest";
import { countRecords } from "../../../src/count/count";
import { isDerivedExcluded, isPiece } from "../../../src/model/provenance";
import {
  reportCountContribution,
  tallyReportContributions,
} from "../src/counting";
import { REPORT_COUNTING } from "../src/reportTypes";
import type { RouteReport } from "../src/reportTypes";
import { DEFAULT_DECAY, corroborateReports } from "../src/reports";
import { routingFacts } from "../src/routingFacts";
import { reportStrings } from "../src/reportStrings";
import { reportGroupViews } from "../src/viewModels";

// Every record in this file is synthetic test data, not an observation.
const NOW = new Date("2026-11-15T12:00:00.000Z");
const HOUR_MS = 3600000;

function report(id: string, overrides: Partial<RouteReport> = {}): RouteReport {
  return {
    id,
    kind: "snowbank",
    location: { type: "segment", segment_id: "synthetic-segment-1" },
    observed_at: "2026-11-15T11:00:00.000Z",
    observation: {
      value: "present",
      source_id: "synthetic-test",
      licence: "CC0-1.0",
      retrieved_at: "2026-11-15T11:30:00.000Z",
      tier: 0,
    },
    reporter: { role: "wheelchair_user", ref: `synthetic-person-${id}` },
    synthetic: true,
    ...overrides,
  };
}

const three = [report("a"), report("b"), report("c")];

describe("route reports and counting", () => {
  it("raises a group to tier 2 on independent reports and still counts it as nothing", () => {
    const [group] = corroborateReports(three, NOW);
    expect(group).toMatchObject({ state: "active", tier: 2, independent_reporters: 3 });
    expect(group?.counting).toEqual({
      counts_as_piece: false,
      counts_toward_verified: false,
    });
    expect(group?.counting).toBe(REPORT_COUNTING);
    if (!group) return;
    expect(reportCountContribution(group)).toEqual({ pieces: 0, verified: 0 });
  });

  it("gives the same zero contribution to reports, groups and routing facts at every tier", () => {
    const groups = corroborateReports(
      [...three, report("d", { kind: "ice" })],
      NOW,
    );
    expect(groups.map((group) => group.tier).sort()).toEqual([0, 2]);
    const facts = routingFacts(groups);
    expect(facts.map((fact) => fact.fact.tier).sort()).toEqual([0, 2]);
    for (const fact of facts) expect(fact.counting).toBe(REPORT_COUNTING);
    expect(
      tallyReportContributions([...three, ...groups, ...facts]),
    ).toEqual({ pieces: 0, verified: 0 });
    expect(tallyReportContributions([])).toEqual({ pieces: 0, verified: 0 });
  });

  it("cannot have its counting flags switched on", () => {
    expect(Object.isFrozen(REPORT_COUNTING)).toBe(true);
    expect(() => {
      (REPORT_COUNTING as { counts_as_piece: boolean }).counts_as_piece = true;
    }).toThrow(TypeError);
    expect(REPORT_COUNTING.counts_as_piece).toBe(false);
  });

  it("is not a piece under the repository counting rule, even at tier 2", () => {
    const [fact] = routingFacts(corroborateReports(three, NOW));
    expect(fact?.fact).toMatchObject({ tier: 2, derived: true });
    if (!fact) return;
    expect(isPiece(fact.fact)).toBe(false);
    expect(isDerivedExcluded(fact.fact)).toBe(true);
    // Reports are never written as data records. If a tier 2 routing fact
    // were placed on one anyway, the repository counter would add nothing.
    const counted = countRecords([
      {
        id: "synthetic-path:1",
        tranche: "path",
        region: "synthetic",
        fields: { surface: fact.fact },
      },
    ]);
    expect(counted.pieces).toBe(0);
    expect(counted.verified_toward_500k).toBe(0);
    expect(counted.accessibility_pieces).toBe(0);
    expect(counted.derived_excluded).toBe(1);
  });

  it("expires a tier 2 group on the decay schedule of its reports", () => {
    const expiry = DEFAULT_DECAY.snowbank.expiry_hours;
    const [current] = corroborateReports(three, NOW);
    expect(current?.tier).toBe(2);
    expect(current?.expires_at).toBe(
      new Date(Date.parse("2026-11-15T11:00:00.000Z") + expiry * HOUR_MS).toISOString(),
    );
    // The same expiry as one unconfirmed report: confirmation adds no time.
    const [single] = corroborateReports([report("a")], NOW);
    expect(single?.tier).toBe(0);
    expect(single?.expires_at).toBe(current?.expires_at);

    const later = new Date(Date.parse(current?.expires_at ?? "") + 60000);
    const [expired] = corroborateReports(three, later);
    expect(expired).toMatchObject({
      state: "expired",
      tier: 0,
      confidence: 0,
      independent_reporters: 0,
    });
    expect(expired?.counting).toBe(REPORT_COUNTING);
    const [gone] = routingFacts(expired ? [expired] : []);
    expect(gone).toMatchObject({ hint: "none", penalty: 0, claim: "no_current_report" });
    expect(gone?.fact.tier).toBe(0);
  });

  it.each(["en", "fr"] as const)(
    "words a tier 2 group as confirmed by N reports, never as verified (%s)",
    (language) => {
      const t = reportStrings[language];
      const [confirmed] = reportGroupViews(corroborateReports(three, NOW), language);
      expect(confirmed?.confirmedBy).toBe(t.confirmedBy(3));
      expect(confirmed?.confirmedBy).toBe(
        language === "en" ? "Confirmed by 3 reports" : "Confirmé par 3 signalements",
      );
      const [single] = reportGroupViews(corroborateReports([report("a")], NOW), language);
      expect(single?.confirmedBy).toBeNull();
      for (const view of [confirmed, single]) {
        expect(JSON.stringify(view).toLowerCase()).not.toMatch(/verif|vérifié/);
      }
    },
  );
});
