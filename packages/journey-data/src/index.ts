import type { TimetableSource } from "./timetable-source.js";
import { readPublishedTimetableChunks } from "./timetable-source.js";
import { messages, type Locale } from "./catalog.js";
import { distance, type Point } from "./geometry.js";
import type { PackRecord, PackSource, PackSourceEntry } from "./pack-types.js";
import { routeRolling, type RollProfile, type RollRoute } from "./route.js";
import {
  nearbyStops, scheduledOptions, type ElevatorAlert, type StopWithAccess,
  type TimetableChunk, type TimetableChunkReader, type TransitOption,
} from "./transit.js";

export type { PackSource, PackRecord, PackSourceEntry } from "./pack-types.js";
export { prototypeLabel, type Evidence, type PrototypeLabel, type RollProfile, type RollRoute } from "./route.js";
export { routeRolling } from "./route.js";
export { elevatorAt, nearbyStops, scheduledOptions } from "./transit.js";
export type { ElevatorAlert, TimetableChunk, TimetableChunkReader, TransitOption } from "./transit.js";
export { messages } from "./catalog.js";
export { createPublishedTimetableAccess, readPublishedTimetableChunks } from "./timetable-source.js";
export type { ScheduleManifest, SchedulePart, TimedDeparture, TimetableSource } from "./timetable-source.js";

export interface JourneyRequest {
  origin: Point;
  destination: Point;
  profile: RollProfile;
  locale?: Locale;
  now: string;
  offline?: boolean;
  signal?: AbortSignal;
}
export interface JourneyResult {
  roll: RollRoute | null;
  originStops: StopWithAccess[];
  destinationStops: StopWithAccess[];
  transit: TransitOption[];
  missingRegions: string[];
  missingTimetables: string[];
  notices: string[];
  sources: PackSourceEntry[];
}
export interface JourneyModule {
  id: "journey";
  plan(request: JourneyRequest): Promise<JourneyResult>;
}
export type TimetableChunksReader = (source: TimetableSource, region: string) => Promise<TimetableChunk[]>;
export interface JourneyDataOptions {
  /** I14 source, or the local stub that reads I14's published chunk format. */
  timetable?: TimetableSource;
  /** One normalised region chunk. Prefer readTimetableChunks when a region has several feeds. */
  readTimetableChunk?: TimetableChunkReader;
  /** Every published chunk in a region. Missing or corrupt parts are omitted, never invented. */
  readTimetableChunks?: TimetableChunksReader;
  /** Already downloaded TTC accessibility alerts; never polled by this module. */
  elevatorAlerts?: readonly ElevatorAlert[];
  /** Optional registry link; not substituted for missing scheduled times. */
  agencyPlannerUrl?: string;
}
/** MiWay stays out, including the pack id gtfs-miway. GO, UP Express, and LTC are in (AUA accepted 2026-11-15; LTC terms OK). */
const HELD_IDS = new Set(["miway", "gtfs-miway"]);
function approved(source: PackSourceEntry | undefined): boolean {
  if (!source || source.inWebPack === false || source.heldReason) return false;
  const id = source.sourceId.trim().toLowerCase();
  const name = source.name.trim().toLowerCase();
  return !HELD_IDS.has(id) && name !== "miway";
}
function within(point: Point, bbox: [number, number, number, number]): boolean {
  return point.lon >= bbox[0] && point.lon <= bbox[2] && point.lat >= bbox[1] && point.lat <= bbox[3];
}
function downloaded(status: { downloaded?: boolean; status?: string; state?: string } | undefined): boolean {
  return status?.downloaded === true || status?.status === "downloaded" || status?.state === "downloaded";
}
function included(record: PackRecord, sources: Map<string, PackSourceEntry>): boolean {
  const fields = Object.values(record.fields).filter((field) => field !== undefined);
  return fields.length > 0 && fields.every((field) => approved(sources.get(field!.source_id)));
}
function unique<T>(items: T[]): T[] { return [...new Set(items)]; }

/** Pull only the relevant cells. PackSource handles IndexedDB and download ownership. */
export function createJourneyModule(source: PackSource, options: JourneyDataOptions = {}): JourneyModule {
  return {
    id: "journey",
    async plan(request): Promise<JourneyResult> {
      const locale = request.locale ?? "en";
      const copy = messages[locale];
      const manifest = await source.manifest();
      const sourceMap = new Map(manifest.sources.map((entry) => [entry.sourceId, entry]));
      const activeSources = manifest.sources.filter(approved);
      const endpointRegions = manifest.regions.filter((region) =>
        within(request.origin, region.bbox) || within(request.destination, region.bbox));
      const status = await source.regions();
      const missingRegions = request.offline ? endpointRegions.filter((region) =>
        !downloaded(status.find((item) => item.id === region.id))).map((region) => region.label[locale]) : [];
      const notices = missingRegions.map(copy.missingRegion);
      if (request.offline) notices.push(copy.offline);
      if (distance(request.origin, request.destination) > 3000) notices.push(copy.far);
      const minLat = Math.min(request.origin.lat, request.destination.lat);
      const maxLat = Math.max(request.origin.lat, request.destination.lat);
      const minLon = Math.min(request.origin.lon, request.destination.lon);
      const maxLon = Math.max(request.origin.lon, request.destination.lon);
      const pad = 0.009; // Approximate 800 m, bounding box is deliberately generous.
      const cells = await source.cellsFor({ bbox: [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad] });
      const availableCells = request.offline ? cells.filter((cell) =>
        endpointRegions.some((region) => region.cells.includes(cell) &&
          downloaded(status.find((item) => item.id === region.id)))) : cells;
      const gather = async (tranche: "path" | "transit"): Promise<PackRecord[]> => {
        const found: PackRecord[] = [];
        for (const cell of availableCells) {
          try {
            for await (const record of source.records(tranche, cell, request.signal)) {
              if (included(record, sourceMap)) found.push(record);
            }
          } catch (error) {
            if (request.signal?.aborted) throw error;
            // Missing and corrupt cells are not a positive accessibility finding.
            notices.push(copy.missingRegion(endpointRegions.find((region) => region.cells.includes(cell))?.label[locale] ?? cell));
          }
        }
        return [...new Map(found.map((item) => [item.id, item])).values()];
      };
      const [paths, stops] = await Promise.all([gather("path"), gather("transit")]);
      const roll = routeRolling(paths, request.origin, request.destination, request.profile, activeSources);
      if (!roll && distance(request.origin, request.destination) <= 3000) notices.push(copy.noRoute);
      if (roll?.unknownSurfaceCount) notices.push(copy.unknownSurface(roll.unknownSurfaceCount));
      if (roll?.unknownAccessCount) notices.push(copy.unknownOther(roll.unknownAccessCount));
      if (roll?.status === "unknown") notices.push(copy.unverified);
      const alerts = options.elevatorAlerts ?? [];
      const originStops = nearbyStops(stops, request.origin, activeSources, [...alerts], request.now);
      const destinationStops = nearbyStops(stops, request.destination, activeSources, [...alerts], request.now);
      if (!originStops.length || !destinationStops.length) notices.push(copy.noStops);
      const regions = unique([...originStops, ...destinationStops].map((item) => item.region));
      const chunks: TimetableChunk[] = [];
      const missingTimetables: string[] = [];
      const readChunks = options.readTimetableChunks
        ?? (options.readTimetableChunk && options.timetable
          ? async (source: TimetableSource, regionId: string) => {
              const one = await options.readTimetableChunk!(source, regionId);
              return one ? [one] : [];
            }
          : options.timetable
            ? readPublishedTimetableChunks
            : undefined);
      for (const region of regions) {
        const label = manifest.regions.find((item) => item.id === region)?.label[locale] ?? region;
        if (!options.timetable || !readChunks) {
          missingTimetables.push(label);
          continue;
        }
        const found = await readChunks(options.timetable, region);
        const accepted = found.filter((chunk) => approved(sourceMap.get(chunk.sourceId)));
        if (!accepted.length) {
          missingTimetables.push(label);
          continue;
        }
        chunks.push(...accepted);
      }
      notices.push(...missingTimetables.map(copy.missingSchedule));
      const transit = scheduledOptions(originStops, destinationStops, chunks);
      return { roll, originStops, destinationStops, transit, missingRegions,
        missingTimetables, notices: unique(notices), sources: activeSources };
    },
  };
}
