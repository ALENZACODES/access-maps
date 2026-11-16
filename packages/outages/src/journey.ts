import {
  planJourney,
  type ElevatorAsset,
  type EquipmentProfile,
  type ImportedRecord,
  type Journey,
  type JourneyDataSource,
  type JourneyPlan,
  type Leg,
  type PlanInput,
} from "@access-maps/journey";
import { describeOutage, formatTime, outageCopy } from "./copy.js";
import { blocksStepFree, currentOutages, expiresAt } from "./state.js";
import type { Locale, OutageRecord, OutageSnapshot } from "./types.js";

/** GTFS stop id of an imported transit record: the part after the last colon of `gtfs:<feed>:<stop_id>`. */
export function gtfsStopId(record: ImportedRecord): string {
  const parts = record.id.split(":");
  return parts[parts.length - 1] ?? record.id;
}

function stopsForRecord(data: JourneyDataSource, record: OutageRecord): ImportedRecord[] {
  const wanted = new Set(record.stopIds);
  return data.stops.filter((stop) => wanted.has(gtfsStopId(stop)));
}

/**
 * Elevator assets built from current elevator outages, one per matching stop.
 * The status is the operator's "out of service" at the feed time. No alternate is assumed.
 * The journey engine ages that time: past four hours it reads as unknown, not working.
 *
 * Each asset gets its own network id. One alert lists the same elevator under several platform stop ids,
 * and every alert in a snapshot shares one feed time, so the engine's "three outages within 30 minutes"
 * correlation would fire on copies of one record. Feed time is not the time the outages began.
 */
export function outageElevators(data: JourneyDataSource, snapshot: OutageSnapshot, nowIso: string): ElevatorAsset[] {
  const assets: ElevatorAsset[] = [];
  for (const record of currentOutages(snapshot, nowIso)) {
    if (!blocksStepFree(record)) continue;
    const provenance = {
      sourceId: record.provenance.sourceId,
      licence: record.provenance.licence,
      retrievedAt: record.provenance.retrievedAt,
      tier: 4 as const,
      note: `${record.id}. ${snapshot.demonstration ? "Demonstration snapshot." : "Operator feed."}`,
    };
    for (const stop of stopsForRecord(data, record)) {
      assets.push({
        id: `outage:${record.id}:${stop.id}`,
        name: record.assetLabel ? `Elevator ${record.assetLabel}` : `Elevator in alert ${record.id}`,
        stopId: stop.id,
        networkId: `${snapshot.networkId}:${record.id}:${stop.id}`,
        operatorName: "UNKNOWN",
        helpPhone: null,
        alternateStepFree: false,
        status: { state: "out", observedAt: record.reportedAt, source: "feed", provenance },
        provenance,
      });
    }
  }
  return assets;
}

export function applyOutages(data: JourneyDataSource, snapshot: OutageSnapshot, nowIso: string): JourneyDataSource {
  return { ...data, elevators: [...(data.elevators ?? []), ...outageElevators(data, snapshot, nowIso)] };
}

export interface LegOutage {
  journeyId: string;
  legId: string;
  stopId: string;
  stationName: string;
  records: OutageRecord[];
  /** True when at least one record is an elevator outage. */
  blocking: boolean;
  /** Sentences for the leg, in the plan's language. */
  lines: string[];
}

export interface ProfileFlag {
  /** EquipmentProfile key the flag comes from. */
  setting: string;
  text: string;
}

export interface Alternative {
  journey: Journey;
  avoids: string[];
  text: string;
  flags: ProfileFlag[];
}

export interface OutagePlan {
  plan: JourneyPlan;
  snapshot: OutageSnapshot;
  /** Snapshot sentence: feed, last-known, or seed, with its time. */
  statusLine: string;
  legOutages: LegOutage[];
  /** Journeys with an elevator outage on a station leg, outbound or return. */
  affected: Journey[];
  alternatives: Alternative[];
  /** Set when a journey is affected and no usable option avoids it. */
  noAlternative: string | null;
}

function stopForLeg(data: JourneyDataSource, leg: Leg): ImportedRecord | undefined {
  if (leg.mode !== "station-access") return undefined;
  return data.stops.find((stop) => {
    const name = stop.fields.name?.value;
    const lat = stop.fields.lat?.value;
    const lon = stop.fields.lon?.value;
    return name === leg.fromName && lat === leg.from.lat && lon === leg.from.lon;
  });
}

function legLines(records: OutageRecord[], snapshot: OutageSnapshot, locale: Locale): string[] {
  const text = outageCopy(locale);
  const lines: string[] = [];
  for (const record of records) {
    const end = expiresAt(record);
    lines.push(
      [
        describeOutage(record, locale),
        text.reported(formatTime(record.reportedAt, locale)),
        end ? text.expires(formatTime(end, locale)) : text.noEnd,
        blocksStepFree(record) ? "" : text.escalatorInfo,
        text.source(record.provenance.sourceId, record.provenance.licence),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (snapshot.demonstration) lines.push(text.demonstration);
  if (snapshot.mayBeOutOfDate) lines.push(statusLine(snapshot, locale));
  return lines;
}

export function statusLine(snapshot: OutageSnapshot, locale: Locale): string {
  const text = outageCopy(locale);
  const asOf = formatTime(snapshot.asOf, locale);
  if (snapshot.origin === "feed") return text.feedRead(asOf);
  if (snapshot.origin === "last-known") return text.lastKnown(asOf);
  return text.manualSeed(asOf);
}

function journeyLegs(journey: Journey): Leg[] {
  return [...journey.legs, ...journey.returnJourney.legs];
}

/** A straight-line gap is not an option. An option must have a route or a scheduled leg and no recorded barrier. */
function usable(journey: Journey): boolean {
  if (journey.legs.some((leg) => leg.stepFree.status === "not-step-free")) return false;
  return journey.legs.some(
    (leg) => leg.distanceKind === "route" || leg.mode === "transit" || leg.mode === "intercity" || leg.mode === "paratransit-info",
  );
}

const WARNING_SETTING: Record<string, keyof EquipmentProfile> = {
  "grade-unknown": "maxGradePercent",
  "travel-time": "maxTravelMinutes",
  "distance-over": "maxDistanceMetres",
  "washroom-interval": "maxMinutesBetweenWashrooms",
  "duration-unknown": "maxMinutesBetweenWashrooms",
  "card-missing": "cardsHeld",
  "parking-app-only": "hasSmartphone",
  "registration-gap": "registrations",
  "no-charger": "chair",
};

const REASON_SETTING: Record<string, keyof EquipmentProfile> = {
  "grade-over-limit": "maxGradePercent",
  "width-under-chair": "widthMm",
};

/** Each flag names the profile setting it comes from. Duplicate flags are merged. */
export function profileFlags(journey: Journey, locale: Locale): ProfileFlag[] {
  const text = outageCopy(locale);
  const flags = new Map<string, ProfileFlag>();
  const add = (setting: string, reason: string) => {
    const label = text.settings[setting] ?? setting;
    const key = `${setting}|${reason}`;
    if (!flags.has(key)) flags.set(key, { setting, text: text.flag(label, reason) });
  };
  for (const warning of journey.warnings) {
    const setting = WARNING_SETTING[warning.code];
    if (setting) add(setting, warning.text);
  }
  for (const leg of journeyLegs(journey)) {
    for (const reason of leg.stepFree.reasons) {
      const setting = REASON_SETTING[reason];
      if (setting) add(setting, `${leg.title}. ${leg.note}`);
    }
  }
  return [...flags.values()];
}

/**
 * Plan with outages applied, mark the legs that pass an outage, and offer every usable option that
 * avoids the affected stations. When there is none, say so. Nothing is rerouted by guesswork:
 * the options are the ones the journey engine already found in the data.
 */
export function planWithOutages(input: PlanInput, snapshot: OutageSnapshot): OutagePlan {
  const now = input.now ?? input.departAt;
  const locale = input.locale ?? "en";
  const data = applyOutages(input.data, snapshot, now);
  const plan = planJourney({ ...input, data });
  const current = currentOutages(snapshot, now);

  const legOutages: LegOutage[] = [];
  for (const journey of [...plan.journeys, ...plan.blocked]) {
    for (const leg of journeyLegs(journey)) {
      const stop = stopForLeg(data, leg);
      if (!stop) continue;
      const stopId = gtfsStopId(stop);
      const records = current.filter((record) => record.stopIds.includes(stopId));
      if (records.length === 0) continue;
      legOutages.push({
        journeyId: journey.id,
        legId: leg.id,
        stopId: stop.id,
        stationName: records[0]?.stationName ?? leg.fromName,
        records,
        blocking: records.some(blocksStepFree),
        lines: legLines(records, snapshot, locale),
      });
    }
  }

  const affectedIds = new Set(legOutages.filter((item) => item.blocking).map((item) => item.journeyId));
  const affected = [...plan.journeys, ...plan.blocked].filter((journey) => affectedIds.has(journey.id));
  const stations = [...new Set(legOutages.filter((item) => item.blocking).map((item) => item.stationName))];
  const text = outageCopy(locale);
  const list = stations.join(", ");

  const alternatives: Alternative[] =
    affected.length === 0
      ? []
      : plan.journeys
          .filter((journey) => !affectedIds.has(journey.id) && usable(journey))
          .map((journey) => ({ journey, avoids: stations, text: text.avoids(list), flags: profileFlags(journey, locale) }));

  return {
    plan,
    snapshot,
    statusLine: statusLine(snapshot, locale),
    legOutages,
    affected,
    alternatives,
    noAlternative: affected.length > 0 && alternatives.length === 0 ? text.noAlternative(list) : null,
  };
}
