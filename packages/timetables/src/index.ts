/** Offline-only schedule lookup. No request is permitted to populate the HTTP cache. */
export const metrolinxAuaLegendEn = "Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service.";
export const metrolinxOglLineEn = "Contains information licensed under the Open Government Licence - Ontario - Metrolinx.";
export const transitEndUserTermsEn = "You must follow all applicable laws when using the transit timetable data in the App.";
export const transitEndUserTermsFr = "Vous devez respecter toutes les lois applicables lorsque vous utilisez les données d’horaires de transport en commun dans l’App.";

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
  tripCount: number;
  sourceId: string;
  licence: string;
  licenceUrl: string;
  retrieved: string;
  feedStart: string;
  feedEnd: string;
  placement: "git" | "release";
  assetName?: string;
  kind: "calendar" | "trips";
  regionId: string;
}
export interface ScheduleManifest {
  version: 1;
  parts: SchedulePart[];
  sources: Array<{ sourceId: string; sourceName: string; inWebPack: boolean; heldReason?: string; licence?: string; licenceUrl?: string; retrieved?: string; feedVersion?: string }>;
}
interface CalendarChunk {
  sourceId: string;
  sourceName: string;
  agency: Array<{ id: string; name: string }>;
  routes: Array<{ id: string; shortName: string; longName: string; type: string }>;
  stops: Array<{ id: string; name: string; lat: number; lon: number; wheelchairBoarding: WheelchairFlag }>;
  calendar: Array<{ serviceId: string; startDate: string; endDate: string; weekdays: string[] }>;
  calendarDates: Array<{ serviceId: string; date: string; exceptionType: string }>;
}
interface TripRow {
  id: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  wheelchairAccessible: WheelchairFlag;
  stopTimes: Array<{ stopId: string; arrival: string; departure: string; sequence: number }>;
}
export interface TimetableSource {
  departures(opts: { stopIds: string[]; at: Date; windowMin?: number; signal?: AbortSignal }): Promise<TimedDeparture[]>;
  hasRegion(regionId: string): Promise<boolean>;
  missingChunks(regionId: string): Promise<string[]>;
}

export function normalizeWheelchair(value: unknown): WheelchairFlag {
  return value === "1" || value === "2" ? value : "UNKNOWN";
}

function sameDigest(actual: Uint8Array, hex: string): boolean {
  const expected = hex.toLowerCase();
  return Array.from(actual, (x) => x.toString(16).padStart(2, "0")).join("") === expected;
}

async function unpack(response: Response, part: SchedulePart): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== part.bytes) throw new Error(`Schedule byte count mismatch: ${part.path}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (!sameDigest(digest, part.sha256)) throw new Error(`Schedule SHA-256 mismatch: ${part.path}`);
  if (typeof DecompressionStream === "undefined") throw new Error("gzip decompression is unavailable");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function minutes(time: string): number {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 60 : NaN;
}
function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function serviceActive(calendar: CalendarChunk, serviceId: string, date: Date): boolean {
  const day = ymd(date).replace(/-/g, "");
  const overrides = calendar.calendarDates.filter((row) => row.serviceId === serviceId && row.date === day);
  const latest = overrides.at(-1);
  if (latest) return latest.exceptionType === "1";
  const base = calendar.calendar.find((row) => row.serviceId === serviceId);
  if (!base || day < base.startDate || day > base.endDate) return false;
  return base.weekdays[date.getDay()] === "1";
}

/** Cached Responses only: the browser never downloads an absent part on lookup. */
export function createTimetableSource(opts: { baseUrl: string; fetch?: typeof fetch; manifest?: ScheduleManifest }): TimetableSource {
  const root = new URL(opts.baseUrl, typeof location === "undefined" ? "https://offline.invalid/" : location.href);
  let manifestPromise: Promise<ScheduleManifest | null> | undefined;
  const injected = opts.fetch;
  async function cached(url: string, signal?: AbortSignal): Promise<Response | null> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (injected) {
      const response = await injected(url, { signal, cache: "only-if-cached", mode: "same-origin" });
      return response.ok ? response : null;
    }
    if (typeof caches === "undefined") return null;
    const match = await caches.match(url);
    return match?.ok ? match : null;
  }
  async function manifest(): Promise<ScheduleManifest | null> {
    if (opts.manifest) return opts.manifest;
    manifestPromise ??= (async () => {
      const response = await cached(new URL("manifest.json", root).href);
      return response ? (await response.json()) as ScheduleManifest : null;
    })();
    return manifestPromise;
  }
  function partsInRegion(doc: ScheduleManifest | null, region: string): SchedulePart[] {
    return doc?.parts.filter((part) => part.regionId === region) ?? [];
  }
  async function absent(part: SchedulePart): Promise<boolean> {
    return !(await cached(new URL(part.path, root).href));
  }
  return {
    async hasRegion(regionId) {
      const doc = await manifest();
      return partsInRegion(doc, regionId).some((p) => p.kind === "trips");
    },
    async missingChunks(regionId) {
      const doc = await manifest();
      if (!doc) return ["manifest.json"];
      const parts = partsInRegion(doc, regionId);
      return (await Promise.all(parts.map(async (part) => (await absent(part)) ? part.path : null))).filter((p): p is string => p !== null);
    },
    async departures({ stopIds, at, windowMin = 60, signal }) {
      if (!stopIds.length || !Number.isFinite(at.getTime()) || windowMin < 0) return [];
      const doc = await manifest();
      if (!doc) return [];
      const wanted = new Set(stopIds);
      const output: TimedDeparture[] = [];
      // GTFS hours may exceed 24:00:00; look back to preceding service dates.
      const dates = [0, 1, 2].map((offset) => {
        const day = new Date(at.getFullYear(), at.getMonth(), at.getDate() - offset);
        return { date: day, offset, dayMinutes: offset * 1440 + at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60 };
      });
      const byRegion = new Map<string, SchedulePart[]>();
      for (const part of doc.parts) {
        const list = byRegion.get(part.regionId) ?? [];
        list.push(part);
        byRegion.set(part.regionId, list);
      }
      for (const [, parts] of byRegion) {
        const calendars = parts.filter((p) => p.kind === "calendar");
        for (const calendarPart of calendars) {
          const tripParts = parts.filter((p) => p.kind === "trips" && p.sourceId === calendarPart.sourceId);
          if (!tripParts.length) continue;
          const all = [calendarPart, ...tripParts];
          const responses = await Promise.all(all.map((p) => cached(new URL(p.path, root).href, signal)));
          const calendarResponse = responses[0];
          if (!calendarResponse || responses.some((p) => !p)) continue;
          const calendar = JSON.parse(await unpack(calendarResponse, calendarPart)) as CalendarChunk;
          if (!calendar.stops.some((stop) => wanted.has(stop.id))) continue;
          const routes = new Map(calendar.routes.map((route) => [route.id, route]));
          for (let i = 0; i < tripParts.length; i++) {
            const tripPart = tripParts[i];
            const tripResponse = responses[i + 1];
            if (!tripPart || !tripResponse) continue;
            const rows = (await unpack(tripResponse, tripPart)).trim().split("\n").filter(Boolean);
            for (const line of rows) {
              const trip = JSON.parse(line) as TripRow;
              for (const stop of trip.stopTimes) {
                if (!wanted.has(stop.stopId)) continue;
                const dep = minutes(stop.departure);
                if (!Number.isFinite(dep)) continue;
                for (const { date, dayMinutes } of dates) {
                  if (!serviceActive(calendar, trip.serviceId, date)) continue;
                  if (dep < dayMinutes || dep > dayMinutes + windowMin) continue;
                  const route = routes.get(trip.routeId);
                  output.push({ tripId: trip.id, routeId: trip.routeId, routeName: route?.shortName || route?.longName || trip.routeId,
                    stopId: stop.stopId, departure: stop.departure, arrival: stop.arrival, serviceDate: ymd(date),
                    wheelchairAccessible: normalizeWheelchair(trip.wheelchairAccessible), sourceId: calendarPart.sourceId,
                    sourceName: calendar.sourceName, licence: calendarPart.licence, licenceUrl: calendarPart.licenceUrl,
                    retrieved: calendarPart.retrieved });
                }
              }
            }
          }
        }
      }
      const unique = new Map<string, TimedDeparture>();
      for (const row of output) unique.set(`${row.sourceId}|${row.tripId}|${row.stopId}|${row.serviceDate}|${row.departure}`, row);
      return Array.from(unique.values()).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || minutes(a.departure) - minutes(b.departure));
    }
  };
}
