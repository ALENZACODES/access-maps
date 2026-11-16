/** Standalone reference contracts: no production module assumptions. */
export type Assessment = "PASS" | "BLOCKED" | "UNKNOWN";
export type Requirement = "step_free" | "surface" | "width";

export interface Evidence {
  readonly source: string;
  readonly licence: string;
  readonly observedAt: string;
}
export interface Observation {
  readonly requirement: Requirement;
  readonly assessment: Assessment;
  readonly evidence: Evidence | null;
}
export interface RoutingProfile {
  readonly id: string;
  readonly requirements: readonly Requirement[];
}
export interface JourneySegment {
  readonly id: string;
  readonly observations: readonly Observation[];
}
export interface JourneyRoute {
  readonly id: string;
  readonly segments: readonly JourneySegment[];
}
export interface Condition {
  readonly assessment: Assessment;
  readonly evidence: Evidence | null;
  readonly validUntil: string | null;
}
export interface JourneyDecision {
  readonly routeId: string;
  readonly profileId: string;
  readonly assessment: Assessment;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_LICENCES: readonly string[] = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0"];

/** Reject impossible dates rather than allowing silent date rollover. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (monthDays[month - 1] ?? 0);
}

/** Evidence requires source, explicitly allowed open licence, and date. */
export function hasProvenance(evidence: Evidence | null): evidence is Evidence {
  return evidence !== null && evidence.source.trim().length > 0 &&
    OPEN_LICENCES.includes(evidence.licence) && isIsoDate(evidence.observedAt);
}

export function assessObservation(observation: Observation | undefined): Assessment {
  return observation !== undefined && hasProvenance(observation.evidence)
    ? observation.assessment : "UNKNOWN";
}

/** A documented barrier wins; otherwise all required checks must pass. */
export function combineAssessments(assessments: readonly Assessment[]): Assessment {
  if (assessments.length === 0) return "UNKNOWN";
  if (assessments.includes("BLOCKED")) return "BLOCKED";
  if (assessments.includes("UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

export function assessRequirement(segment: JourneySegment, requirement: Requirement): Assessment {
  return combineAssessments(segment.observations
    .filter((item) => item.requirement === requirement)
    .map(assessObservation));
}

/** Profile requirements describe checks, never inferred personal attributes. */
export function assessRoute(route: JourneyRoute, profile: RoutingProfile): JourneyDecision {
  const checks: Assessment[] = [];
  for (const segment of route.segments) {
    for (const requirement of profile.requirements) {
      checks.push(assessRequirement(segment, requirement));
    }
  }
  return { routeId: route.id, profileId: profile.id, assessment: combineAssessments(checks) };
}

/** A condition is usable only during its evidence-backed validity window. */
export function assessCondition(condition: Condition | null, asOf: string): Assessment {
  if (condition === null || !isIsoDate(asOf) ||
      !hasProvenance(condition.evidence) || condition.validUntil === null ||
      !isIsoDate(condition.validUntil)) return "UNKNOWN";
  if (condition.evidence.observedAt > asOf ||
      condition.evidence.observedAt > condition.validUntil ||
      condition.validUntil < asOf) return "UNKNOWN";
  return condition.assessment;
}

/** Conditions can constrain a route but never upgrade missing route evidence. */
export function assessRouteWithConditions(
  route: JourneyRoute,
  profile: RoutingProfile,
  conditions: readonly (Condition | null)[],
  asOf: string,
): JourneyDecision {
  const base = assessRoute(route, profile);
  const conditionChecks: Assessment[] = conditions.length === 0
    ? ["UNKNOWN"] : conditions.map((item) => assessCondition(item, asOf));
  return { ...base, assessment: combineAssessments([base.assessment, ...conditionChecks]) };
}
