import type { Journey, JourneyPlan, Leg } from "./types.js";

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\breal-?time\b/i, "real-time"],
  [/\blive\b/i, "live"],
  [/\bbooked\b/i, "booked"],
  [/\bdysreflexia\b/i, "dysreflexia"],
  [/\bcatheter/i, "catheter"],
  [/\bblood pressure\b/i, "blood pressure"],
  [/\btriage\b/i, "triage"],
  [/\bin range\b/i, "in range"],
  [/\bguaranteed\b/i, "guaranteed"],
];

/** Throws when a plan contradicts the honesty rules. Called at the end of every plan. */
export function assertHonest(plan: JourneyPlan): void {
  const texts = collectText(plan);
  for (const text of texts) {
    for (const [pattern, label] of FORBIDDEN) {
      if (pattern.test(text)) {
        throw new Error(`Forbidden wording (${label}) in: ${text}`);
      }
    }
  }
  for (const journey of [...plan.journeys, ...plan.blocked]) {
    checkJourney(journey);
  }
}

function checkJourney(journey: Journey): void {
  checkLegs(journey.legs, journey.presentedAsStepFree, journey.id);
  checkLegs(journey.returnJourney.legs, journey.returnJourney.presentedAsStepFree, `${journey.id}:return`);
  if (journey.roundTripStepFree && (!journey.presentedAsStepFree || !journey.returnJourney.presentedAsStepFree)) {
    throw new Error(`${journey.id} is marked as a step-free round trip without both halves.`);
  }
  for (const leg of [...journey.legs, ...journey.returnJourney.legs]) {
    if (leg.mode === "paratransit-info" && /confirmed trip\./i.test(leg.note) && !/not a confirmed trip/i.test(leg.note)) {
      throw new Error(`${leg.id} presents paratransit as a confirmed trip.`);
    }
  }
}

function checkLegs(legs: Leg[], presented: boolean, id: string): void {
  for (const leg of legs) {
    if (!leg.stepFree || !leg.stepFree.status) {
      throw new Error(`${leg.id} is missing a step-free status.`);
    }
    if (leg.stepFree.status === "step-free" && leg.stepFree.evidence.length === 0) {
      throw new Error(`${leg.id} is step-free without evidence.`);
    }
    if (leg.distanceKind === "straight-line" && leg.stepFree.status === "step-free") {
      throw new Error(`${leg.id} treats a straight-line distance as step-free.`);
    }
    if (leg.timing && leg.timing.kind !== "scheduled") {
      throw new Error(`${leg.id} has a time that is not scheduled.`);
    }
    if (!leg.provenance?.sourceId) {
      throw new Error(`${leg.id} is missing a source.`);
    }
  }
  const actually = legs.length > 0 && legs.every((leg) => leg.stepFree.status === "step-free");
  if (presented !== actually) {
    throw new Error(`${id} presentedAsStepFree=${presented} but legs say ${actually}.`);
  }
}

function collectText(plan: JourneyPlan): string[] {
  const texts: string[] = [plan.emergency.text];
  if (plan.systemEvent) texts.push(plan.systemEvent.text);
  if (plan.noGo) texts.push(plan.noGo.text);
  if (plan.offline) texts.push(plan.offline.banner);
  for (const warning of [...plan.warnings, ...plan.supplyNotes]) texts.push(warning.text);
  for (const journey of [...plan.journeys, ...plan.blocked]) {
    texts.push(journey.explanation, journey.weakestLink.text, journey.returnJourney.explanation);
    texts.push(journey.depth.entrance.text, journey.depth.washroom.text, journey.depth.parking.text);
    texts.push(journey.returnJourney.depth.entrance.text, journey.returnJourney.depth.washroom.text, journey.returnJourney.depth.parking.text);
    for (const line of journey.fareSummary) texts.push(line.text);
    for (const warning of journey.warnings) texts.push(warning.text);
    for (const slot of journey.chain.slots) texts.push(slot.text);
    texts.push(journey.chain.fare.text, journey.chain.timing.text);
    for (const leg of [...journey.legs, ...journey.returnJourney.legs]) {
      texts.push(leg.note, leg.title);
      if (leg.timing) texts.push(leg.timing.label);
      for (const warning of leg.warnings) texts.push(warning.text);
    }
  }
  return texts;
}
