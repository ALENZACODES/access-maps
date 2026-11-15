/**
 * I14 TimetableSource shape and a reader for its published schedule chunks.
 * I14 is not merged here; this adapter reads the published format only
 * (manifest.json, gzip calendar JSON, gzip trip NDJSON). Missing, corrupt,
 * or unloaded parts yield no times. Times are never invented.
 */
import type { TimetableChunk } from "./transit.js";

export type WheelchairFlag = "0" | "1" | "2" | "UNKNOWN";

export interface TimedDeparture {
  tripId: string;
  routeId: string;
  routeName: string;
  stopId: string;
  departure: string;
  arrival: string;
  serviceDate: string;
  wheelchairAccessible: WheelchairFlag;
  sourceId: string;
  sourceName: string;
  licence: string;
  licenceUrl: string;
  retrieved: string;
}

export interface SchedulePart {
  path: string;
  bytes: number;
  sha256: string;
  tripCount?: number;
  sourceId: string;
  licence: string;
  licenceUrl?: string;
  retrieved: string;
  feedStart?: string;
  feedEnd?: string;
  placement?: "git" | "release";
  assetName?: string;
  kind: "calendar" | "trips";
  regionId: string;
}

export interface ScheduleManifest {
  version: 1;
  parts: SchedulePart[];
  sources: Array<{
    sourceId: string;
    sourceName: string;
    inWebPack: boolean;
    heldReason?: string;
    licence?: string;
    licenceUrl?: string;
    retrieved?: string;
    feedVersion?: string;
  }>;
}

export interface TimetableSource {
  departures(opts: {
    stopIds: string[];
    at: Date;
    windowMin?: number;
    signal?: AbortSignal;
  }): Promise<TimedDeparture[]>;
  hasRegion(regionId: string): Promise<boolean>;
  missingChunks(regionId: string): Promise<string[]>;
  /** Local adapter only. I14's consumer API does not expose raw region chunks. */
  publishedChunks?(regionId: string, signal?: AbortSignal): Promise<TimetableChunk[]>;
}

interface CalendarChunk {
  sourceId?: string;
  sourceName?: string;
  agency?: Array<{ id: string; name: string }>;
  routes?: Array<{ id: string; shortName: string; longName: string; type: string }>;
  stops?: Array<{ id: string; name: string; lat: number; lon: number; wheelchairBoarding: WheelchairFlag }>;
  calendar?: unknown[];
  calendarDates?: unknown[];
}

interface TripRow {
  id: string;
  routeId: string;
  serviceId?: string;
  headsign?: string;
  wheelchairAccessible?: WheelchairFlag;
  stopTimes: Array<{ stopId: string; arrival: string; departure: string; sequence?: number }>;
}

function sameDigest(actual: Uint8Array, hex: string): boolean {
  const expected = hex.toLowerCase();
  return Array.from(actual, (x) => x.toString(16).padStart(2, "0")).join("") === expected;
}

async function unpack(response: Response, part: SchedulePart): Promise<string | null> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== part.bytes) return null;
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (!sameDigest(digest, part.sha256)) return null;
  if (typeof DecompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export function createPublishedTimetableAccess(opts: {
  baseUrl: string;
  fetch?: typeof fetch;
  manifest?: ScheduleManifest;
}): { source: TimetableSource; readTimetableChunks: (source: TimetableSource, region: string, signal?: AbortSignal) => Promise<TimetableChunk[]> } {
  const root = new URL(opts.baseUrl, typeof location === "undefined" ? "https://offline.invalid/" : location.href);
  let manifestPromise: Promise<ScheduleManifest | null> | undefined;
  const injected = opts.fetch;

  async function cached(url: string, signal?: AbortSignal): Promise<Response | null> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (injected) {
      const response = await injected(url, { signal, cache: "only-if-cached", mode: "same-origin" });
      return response.ok ? response : null;
    }
    if (typeof caches !== "undefined") {
      const match = await caches.match(url);
      return match?.ok ? match : null;
    }
    // Never download a missing part just to satisfy a lookup.
    return null;
  }

  async function manifest(): Promise<ScheduleManifest | null> {
    if (opts.manifest) return opts.manifest;
    manifestPromise ??= (async () => {
      const response = await cached(new URL("manifest.json", root).href);
      return response ? ((await response.json()) as ScheduleManifest) : null;
    })();
    return manifestPromise;
  }

  function partsInRegion(doc: ScheduleManifest | null, region: string): SchedulePart[] {
    return doc?.parts.filter((part) => part.regionId === region) ?? [];
  }

  async function publishedChunks(regionId: string, signal?: AbortSignal): Promise<TimetableChunk[]> {
    const doc = await manifest();
    if (!doc) return [];
    const parts = partsInRegion(doc, regionId);
    const calendars = parts.filter((part) => part.kind === "calendar");
    const chunks: TimetableChunk[] = [];
    for (const calendarPart of calendars) {
      const tripParts = parts.filter((part) => part.kind === "trips" && part.sourceId === calendarPart.sourceId);
      if (!tripParts.length) continue;
      const calendarResponse = await cached(new URL(calendarPart.path, root).href, signal);
      if (!calendarResponse) continue;
      const calendarText = await unpack(calendarResponse, calendarPart);
      if (calendarText === null) continue;
      let calendar: CalendarChunk;
      try {
        calendar = JSON.parse(calendarText) as CalendarChunk;
      } catch {
        continue;
      }
      const trips: TimetableChunk["trips"] = [];
      let failed = false;
      for (const tripPart of tripParts) {
        const tripResponse = await cached(new URL(tripPart.path, root).href, signal);
        if (!tripResponse) {
          failed = true;
          break;
        }
        const tripText = await unpack(tripResponse, tripPart);
        if (tripText === null) {
          failed = true;
          break;
        }
        for (const line of tripText.trim().split("\n").filter(Boolean)) {
          let row: TripRow;
          try {
            row = JSON.parse(line) as TripRow;
          } catch {
            failed = true;
            break;
          }
          if (!row?.id || !row.routeId || !Array.isArray(row.stopTimes)) {
            failed = true;
            break;
          }
          trips.push({
            id: row.id,
            routeId: row.routeId,
            stopTimes: row.stopTimes.map((stop) => ({
              stopId: stop.stopId,
              departure: stop.departure,
              arrival: stop.arrival,
            })),
          });
        }
        if (failed) break;
      }
      // A partial region is not a timetable. Drop the source rather than invent gaps.
      if (failed) continue;
      chunks.push({
        region: regionId,
        sourceId: calendarPart.sourceId,
        sourceName: calendar.sourceName ?? doc.sources.find((item) => item.sourceId === calendarPart.sourceId)?.sourceName ?? calendarPart.sourceId,
        licence: calendarPart.licence,
        fetchedAt: calendarPart.retrieved,
        tier: null,
        trips,
      });
    }
    return chunks;
  }

  const source: TimetableSource = {
    async hasRegion(regionId) {
      const doc = await manifest();
      return partsInRegion(doc, regionId).some((part) => part.kind === "trips");
    },
    async missingChunks(regionId) {
      const doc = await manifest();
      if (!doc) return ["manifest.json"];
      const parts = partsInRegion(doc, regionId);
      return (
        await Promise.all(
          parts.map(async (part) => ((await cached(new URL(part.path, root).href)) ? null : part.path)),
        )
      ).filter((path): path is string => path !== null);
    },
    async departures() {
      // I7 plans from published chunks, not from this lookup. Do not invent departures.
      return [];
    },
    publishedChunks,
  };

  return {
    source,
    readTimetableChunks: async (_source, region, signal) => publishedChunks(region, signal),
  };
}

/** Uses the adapter's publishedChunks when present; otherwise no times. */
export async function readPublishedTimetableChunks(
  source: TimetableSource,
  region: string,
  signal?: AbortSignal,
): Promise<TimetableChunk[]> {
  if (!source.publishedChunks) return [];
  return source.publishedChunks(region, signal);
}
