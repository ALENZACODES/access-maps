import type { JourneyPlan } from "./types.js";

/** A map feature the accessible list must show. The map canvas is not the only interface. */
export interface MapFeature {
  id: string;
  name: string;
  kind: string;
  status: string;
  statusCode: "step-free" | "unknown" | "not-step-free" | "info";
  source: string;
  tier: number | null;
  lon: number;
  lat: number;
  geometry?: Array<[number, number]>;
}

export function toMapFeatures(plan: JourneyPlan): MapFeature[] {
  const features: MapFeature[] = [];
  const journeys = [...plan.journeys, ...plan.blocked];
  for (const journey of journeys) {
    for (const leg of journey.legs) {
      features.push({
        id: `${journey.id}:${leg.id}`,
        name: leg.title,
        kind: leg.mode,
        status: `${leg.stepFree.status}. ${leg.note}`,
        statusCode: leg.stepFree.status,
        source: leg.provenance.sourceId,
        tier: leg.stepFree.tier,
        lon: leg.from.lon,
        lat: leg.from.lat,
        geometry: [
          [leg.from.lon, leg.from.lat],
          [leg.to.lon, leg.to.lat],
        ],
      });
    }
  }
  if (plan.systemEvent) {
    features.push({
      id: `${plan.id}:system-event`,
      name: plan.systemEvent.text,
      kind: "disruption",
      status: plan.systemEvent.text,
      statusCode: "not-step-free",
      source: "elevator-status",
      tier: 4,
      lon: plan.journeys[0]?.legs[0]?.from.lon ?? plan.blocked[0]?.legs[0]?.from.lon ?? 0,
      lat: plan.journeys[0]?.legs[0]?.from.lat ?? plan.blocked[0]?.legs[0]?.from.lat ?? 0,
    });
  }
  return features;
}
