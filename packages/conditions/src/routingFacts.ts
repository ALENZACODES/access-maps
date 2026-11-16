import { REPORT_COUNTING } from "./reportTypes";
import type {
  ReportGroup,
  RoutingClaim,
  RoutingFact,
  RoutingHint,
  RoutingWeights,
} from "./reportTypes";

/**
 * Default planner weights. Adjustable settings, not measurements. Whether a
 * condition matters for a given person and device is the planner's decision.
 */
export const DEFAULT_ROUTING_WEIGHTS: RoutingWeights = {
  weight: {
    snowbank: 0.8,
    curb_cut_blocked: 0.9,
    ice: 0.7,
    surface: 0.5,
    gradient: 0.5,
    obstruction: 0.8,
    other: 0.3,
  },
  may_avoid: ["snowbank", "curb_cut_blocked", "obstruction"],
  avoid_threshold: 0.6,
};

/**
 * Turns assessed report groups into facts a planner can weigh.
 *
 * Every group yields one fact, so expired and cleared reports stay visible
 * with a "none" hint instead of disappearing. No fact states that a way can
 * be used: `passable` is always UNKNOWN, a "reported cleared" fact carries no
 * bonus, and the absence of a fact means no report, not a clear way.
 */
export function routingFacts(
  groups: readonly ReportGroup[],
  weights: RoutingWeights = DEFAULT_ROUTING_WEIGHTS,
): RoutingFact[] {
  if (!(weights.avoid_threshold > 0 && weights.avoid_threshold <= 1)) {
    throw new RangeError("Invalid avoid threshold");
  }
  return groups.map((group) => {
    const weight = weights.weight[group.kind];
    if (!(weight >= 0 && weight <= 1)) {
      throw new RangeError("Invalid routing weight");
    }
    const current = group.state === "active" || group.state === "disputed";
    let hint: RoutingHint = "none";
    let penalty = 0;
    if (current) {
      penalty = Math.round(weight * group.confidence * 1000) / 1000;
      hint =
        group.state === "active" &&
        group.tier === 2 &&
        weights.may_avoid.includes(group.kind) &&
        group.confidence >= weights.avoid_threshold
          ? "avoid_if_possible"
          : "penalty";
    }
    const claim: RoutingClaim = current
      ? "reported_condition"
      : group.state === "reported_cleared"
        ? "reported_cleared"
        : "no_current_report";
    const counted = group.reports.filter((item) =>
      group.state === "reported_cleared"
        ? item.part === "clearing"
        : item.part === "supporting",
    );
    const saved = (counted.length ? counted : group.reports)
      .map((item) => item.report.observation.retrieved_at)
      .reduce((latest, value) =>
        Date.parse(value) > Date.parse(latest) ? value : latest,
      );
    return {
      id: `routing:${group.id}`,
      kind: group.kind,
      location: group.location,
      state: group.state,
      claim,
      hint,
      penalty,
      passable: "UNKNOWN",
      fact: {
        value: group.kind,
        source_id: group.source_id,
        licence: group.licence,
        retrieved_at: saved,
        tier: group.tier,
        derived: true,
      },
      counting: REPORT_COUNTING,
      provenance: {
        report_ids: group.reports.map((item) => item.report.id),
        counted_report_ids: counted.map((item) => item.report.id),
        independent_reporters: group.independent_reporters,
        confidence: group.confidence,
        latest_observed_at: group.latest_observed_at,
        expires_at: group.expires_at,
        has_photo: group.has_photo,
      },
    };
  });
}
