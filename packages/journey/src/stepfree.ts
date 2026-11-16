import type { Provenance, StepFreeAssessment, StepFreeStatus, SurveyRecord, VerificationTier } from "./types.js";

export interface StepEvidenceInput {
  stairs: number | null;
  wheelchair: "yes" | "no" | "unknown";
  boarding: "yes" | "no" | "unknown";
  ramp: "yes" | "no" | "unknown";
  inclinePercent: number | null;
  widthMm: number | null;
  blocked: boolean;
  blockReason: string | null;
  winterDowngrade: boolean;
  tier: VerificationTier | null;
  evidenceLabel: string | null;
  /** True only when protocol, verifier role, method, and survey date are all recorded. */
  surveyed?: boolean;
}

const EMPTY: StepFreeAssessment = {
  status: "unknown",
  appVerified: false,
  tier: null,
  reasons: ["no-evidence"],
  evidence: [],
};

/**
 * Resolve step-free status from evidence that was actually supplied.
 * An empty input is unknown. A positive tag is a claim. Tier 3 is App-verified only with survey evidence.
 */
export function resolveStepFree(input: StepEvidenceInput | undefined): StepFreeAssessment {
  if (!input) return { ...EMPTY, reasons: ["no-evidence"], evidence: [] };

  const evidence: string[] = [];
  if (input.evidenceLabel) evidence.push(input.evidenceLabel);

  if (input.blocked) {
    return barrier(input.blockReason ?? "blocked", input.tier, evidence);
  }
  if (input.stairs !== null && input.stairs > 0) {
    evidence.push(`steps:${input.stairs}`);
    return barrier("stairs", input.tier, evidence);
  }
  if (input.wheelchair === "no") {
    evidence.push("wheelchair:no");
    return barrier("wheelchair-no", input.tier, evidence);
  }
  if (input.boarding === "no") {
    evidence.push("boarding:2");
    return barrier("boarding-not-accessible", input.tier, evidence);
  }
  if (input.ramp === "no" && input.stairs === null && input.wheelchair !== "yes") {
    evidence.push("ramp:no");
    return barrier("ramp-no", input.tier, evidence);
  }

  const taggedYes = input.wheelchair === "yes";
  const rampWithoutStairs = input.ramp === "yes" && input.stairs === 0;
  const positive = taggedYes || rampWithoutStairs;

  if (!positive) {
    const reasons = input.stairs === 0 ? ["steps-zero-only"] : ["no-evidence"];
    if (input.boarding === "yes") {
      evidence.push("boarding:1");
      reasons.push("boarding-flag-is-not-a-path");
    }
    return {
      status: "unknown",
      appVerified: false,
      tier: input.tier,
      reasons,
      evidence,
    };
  }

  if (input.winterDowngrade) {
    evidence.push("winter-check:missing");
    return {
      status: "unknown",
      appVerified: false,
      tier: input.tier,
      reasons: ["summer-not-winter"],
      evidence,
    };
  }

  if (input.wheelchair === "yes") evidence.push("wheelchair:yes");
  if (input.ramp === "yes") evidence.push("ramp:yes");
  if (input.stairs === 0) evidence.push("steps:0");

  const claim = claimFromTier(input.tier, input.surveyed === true);
  return {
    status: "step-free",
    appVerified: claim.appVerified,
    tier: input.tier,
    reasons: [claim.reason],
    evidence,
  };
}

export function surveyComplete(survey: SurveyRecord | null | undefined): boolean {
  if (!survey) return false;
  return [survey.protocol, survey.verifierRole, survey.method, survey.surveyedAt].every((part) => {
    const trimmed = part.trim();
    return trimmed.length > 0 && trimmed.toUpperCase() !== "UNKNOWN";
  });
}

/** Tier 3 without a protocol, role, method, and date is not an App survey. */
export function claimFromTier(
  tier: VerificationTier | null,
  surveyed: boolean,
): { appVerified: boolean; reason: string } {
  if (tier === 3 && surveyed) return { appVerified: true, reason: "surveyed" };
  if (tier === 3) return { appVerified: false, reason: "tier-without-survey" };
  if (tier === 1) return { appVerified: false, reason: "operator-claim" };
  if (tier === 2) return { appVerified: false, reason: "contributed-report" };
  if (tier === 4) return { appVerified: false, reason: "status-feed" };
  return { appVerified: false, reason: "open-data-claim" };
}

export function unknownAssessment(reason: string, evidence: string[] = [], tier: VerificationTier | null = null): StepFreeAssessment {
  return {
    status: "unknown",
    appVerified: false,
    tier,
    reasons: [reason],
    evidence,
  };
}

export function barrier(reason: string, tier: VerificationTier | null, evidence: string[]): StepFreeAssessment {
  return {
    status: "not-step-free",
    appVerified: false,
    tier,
    reasons: [reason],
    evidence,
  };
}

export function worstStatus(statuses: StepFreeStatus[]): StepFreeStatus {
  if (statuses.some((status) => status === "not-step-free")) return "not-step-free";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  if (statuses.length > 0 && statuses.every((status) => status === "step-free")) return "step-free";
  return "unknown";
}

export function combineAssessments(parts: StepFreeAssessment[]): StepFreeAssessment {
  if (parts.length === 0) return { ...EMPTY };
  const status = worstStatus(parts.map((part) => part.status));
  const evidence = parts.flatMap((part) => part.evidence);
  const reasons = [...new Set(parts.flatMap((part) => part.reasons))];
  const tier = parts.reduce<VerificationTier | null>((lowest, part) => {
    if (part.tier === null) return lowest;
    if (lowest === null) return part.tier;
    return part.tier < lowest ? part.tier : lowest;
  }, null);
  if (status === "step-free" && evidence.length === 0) {
    return unknownAssessment("no-evidence");
  }
  return {
    status,
    appVerified: status === "step-free" && parts.every((part) => part.appVerified),
    tier,
    reasons: reasons.length > 0 ? reasons : ["no-evidence"],
    evidence,
  };
}

export function provenanceTier(provenance: Provenance | undefined): VerificationTier | null {
  return provenance?.tier ?? null;
}
