import type { TimetableSource } from "./timetable-source.js";
import { distance, position, text, type Point } from "./geometry.js";
import type { PackRecord, PackSourceEntry } from "./pack-types.js";
import { prototypeLabel, type Evidence } from "./route.js";

/** I14 owns timetable parsing and caching. This lane only consumes a normalised chunk. */
export interface TimetableTrip {
  id: string;
  routeId: string;
  stopTimes: Array<{ stopId: string; departure: string; arrival: string }>;
}
export interface TimetableChunk {
  region: string;
  sourceId: string;
  sourceName: string;
  licence: string;
  fetchedAt: string;
  tier: number | null;
  trips: TimetableTrip[];
}
export type TimetableChunkReader = (source: TimetableSource, region: string) => Promise<TimetableChunk | null>;
export interface ElevatorAlert {
  id: string;
  stopId: string;
  state: "working" | "out" | "unknown";
  checkedAt: string;
  sourceId: string;
  sourceName: string;
  licence: string;
  tier: number | null;
}
export interface StopWithAccess {
  id: string;
  name: string;
  point: Point;
  region: string;
  boarding: "yes" | "no" | "unknown";
  evidence: Evidence[];
  elevator: { state: "working" | "out" | "unknown"; checkedAt: string; evidence: Evidence } | null;
}
export interface TransitOption {
  from: StopWithAccess;
  to: StopWithAccess;
  routeId: string;
  departure: string;
  arrival: string;
  sourceName: string;
  fetchedAt: string;
  evidence: Evidence[];
  scheduled: true;
}
function evidence(record: PackRecord, fieldName: string, sources: PackSourceEntry[]): Evidence[] {
  const field = record.fields[fieldName];
  if (!field) return [];
  const tier = field.tier ?? null;
  return [{
    recordId: record.id, field: fieldName, sourceId: field.source_id,
    sourceName: sources.find((source) => source.sourceId === field.source_id)?.name ?? field.source_id,
    licence: field.licence, retrievedAt: field.retrieved_at, tier,
    prototype_label: prototypeLabel(tier),
  }];
}
export function elevatorAt(alert: ElevatorAlert | undefined, now: string): StopWithAccess["elevator"] {
  if (!alert) return null;
  const checked = Date.parse(alert.checkedAt);
  const current = Date.parse(now);
  const fresh = Number.isFinite(checked) && Number.isFinite(current) &&
    current >= checked && current - checked <= 4 * 60 * 60 * 1000;
  return {
    state: fresh ? alert.state : "unknown", checkedAt: alert.checkedAt,
    evidence: { recordId: alert.id, field: "state", sourceId: alert.sourceId,
      sourceName: alert.sourceName, licence: alert.licence, retrievedAt: alert.checkedAt, tier: alert.tier,
      prototype_label: prototypeLabel(alert.tier) },
  };
}
export function nearbyStops(
  stops: PackRecord[], point: Point, sources: PackSourceEntry[], alerts: ElevatorAlert[], now: string,
): StopWithAccess[] {
  return stops.flatMap((stop): StopWithAccess[] => {
    const location = position(stop);
    if (!location || distance(location, point) > 800) return [];
    const raw = text(stop, "wheelchair_boarding");
    const boarding = raw === "1" ? "yes" : raw === "2" ? "no" : "unknown";
    const alert = alerts.find((item) => item.stopId === stop.id);
    return [{ id: stop.id, name: text(stop, "name") ?? stop.id, point: location,
      region: stop.region, boarding, evidence: evidence(stop, "wheelchair_boarding", sources),
      elevator: elevatorAt(alert, now) }];
  }).sort((a, b) => distance(a.point, point) - distance(b.point, point));
}
/** Never interpret wheelchair_boarding=0 as yes. No agency times are synthesized. */
export function scheduledOptions(
  from: StopWithAccess[], to: StopWithAccess[], chunks: TimetableChunk[],
): TransitOption[] {
  const result: TransitOption[] = [];
  for (const chunk of chunks) {
    for (const trip of chunk.trips) {
      for (const origin of from) for (const destination of to) {
        if (origin.boarding === "no" || destination.boarding === "no" ||
          origin.elevator?.state === "out" || destination.elevator?.state === "out") continue;
        const startIndex = trip.stopTimes.findIndex((item) => item.stopId === origin.id);
        const endIndex = trip.stopTimes.findIndex((item, index) => index > startIndex && item.stopId === destination.id);
        if (startIndex < 0 || endIndex < 0) continue;
        const start = trip.stopTimes[startIndex]; const end = trip.stopTimes[endIndex];
        if (!start?.departure || !end?.arrival) continue;
        result.push({ from: origin, to: destination, routeId: trip.routeId,
          departure: start.departure, arrival: end.arrival,
          sourceName: chunk.sourceName, fetchedAt: chunk.fetchedAt, scheduled: true,
          evidence: [...origin.evidence, ...destination.evidence,
            ...(origin.elevator ? [origin.elevator.evidence] : []),
            ...(destination.elevator ? [destination.elevator.evidence] : []),
            { recordId: trip.id, field: "stopTimes", sourceId: chunk.sourceId,
              sourceName: chunk.sourceName, licence: chunk.licence,
              retrievedAt: chunk.fetchedAt, tier: chunk.tier,
              prototype_label: prototypeLabel(chunk.tier) }],
        });
      }
    }
  }
  return result;
}
