import { copy } from "./explain.js";
import { unknownAssessment } from "./stepfree.js";
import type { Journey, JourneyPlan, Leg } from "./types.js";

/**
 * A saved plan keeps its routes and drops elevator status that would otherwise
 * be read as current. Paths from the catalog stay, with the same honesty labels.
 */
export function applyOffline(plan: JourneyPlan, asOf: string): JourneyPlan {
  const banner = copy(plan.locale).offlineBanner(asOf);
  const journeys = plan.journeys.map((journey) => downgradeJourney(journey, banner));
  const blocked = plan.blocked.map((journey) => downgradeJourney(journey, banner));
  return {
    ...plan,
    journeys,
    blocked,
    offline: { asOf, banner },
    warnings: [
      { code: "offline", beforeCommit: true, text: banner, phones: [] },
      ...plan.warnings.filter((warning) => warning.code !== "offline"),
    ],
  };
}

function downgradeJourney(journey: Journey, banner: string): Journey {
  const legs = journey.legs.map((leg) => downgradeLeg(leg, banner));
  const returnLegs = journey.returnJourney.legs.map((leg) => downgradeLeg(leg, banner));
  const presentedAsStepFree = isFullyStepFree(legs);
  return {
    ...journey,
    legs,
    presentedAsStepFree,
    roundTripStepFree: presentedAsStepFree && isFullyStepFree(returnLegs),
    returnJourney: {
      ...journey.returnJourney,
      legs: returnLegs,
      presentedAsStepFree: isFullyStepFree(returnLegs),
    },
  };
}

function downgradeLeg(leg: Leg, banner: string): Leg {
  if (leg.mode !== "station-access" || leg.stepFree.status !== "step-free") return leg;
  return {
    ...leg,
    stepFree: unknownAssessment("elevator-unknown", [`offline:${leg.id}`], leg.stepFree.tier),
    note: `${banner} Status from the earlier check is not repeated as current.`,
    singlePointOfFailure: leg.singlePointOfFailure,
  };
}

function isFullyStepFree(legs: Leg[]): boolean {
  return legs.length > 0 && legs.every((leg) => leg.stepFree.status === "step-free" && leg.stepFree.evidence.length > 0);
}
