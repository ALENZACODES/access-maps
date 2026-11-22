import type { Issue } from "./common.ts";

/** Reference lookup and service-day arithmetic for one source in one region. */
export type CataloguePresence = "present" | "missing" | "unknown";
type Boarding = "1" | "2" | "UNKNOWN";
type Activity = "active" | "inactive" | "unknown";
export interface ServiceDays {
  active: number;
  inactive: number;
  unknown: number;
}
export interface CalendarScope {
  sourceId: string;
  sourceName?: string;
  feedStart: string;
  feedEnd: string;
}
export interface CalendarIndex {
  route(id: string): CataloguePresence;
  stop(id: string): CataloguePresence;
  service(id: string): CataloguePresence;
  stopBoarding(id: string): Boarding;
  /** Inclusive YYYYMMDD civil dates. Outside the feed window, coverage is unknown. */
  serviceDays(id: string, start: string, end: string): ServiceDays;
}
type Emit = (issue: Issue) => void;
type ObjectRow = Record<string, unknown>;

function objectRow(value: unknown): value is ObjectRow {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Comparisons use exact upstream identifiers. In particular, never coerce "001" to 1.
function identifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function failure(emit: Emit, code: string, at: string): void {
  emit({ code, at, severity: "error" });
}

export function scheduleDateOrdinal(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{8}$/u.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6));
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // Date.UTC treats years 00–99 as 1900–1999. The setter preserves the written year.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.getTime() / 86_400_000;
}

function checkedOrdinal(value: unknown, at: string, emit: Emit): number | undefined {
  const day = scheduleDateOrdinal(value);
  if (day === undefined) failure(emit, "CAL_DATE", at);
  return day;
}

function feedBound(value: string, at: string, emit: Emit): number | undefined {
  if (value === "UNKNOWN") {
    emit({ code: "CAL_UNKNOWN_COVERAGE", at, severity: "warning" });
    return undefined;
  }
  return checkedOrdinal(value, at, emit);
}

interface IdIndex<T> {
  values: Map<string, T>;
  ambiguous: Set<string>;
  unkeyed: boolean;
}

function lookup<T>(index: IdIndex<T>, id: string): CataloguePresence {
  if (index.unkeyed || index.ambiguous.has(id)) return "unknown";
  return index.values.has(id) ? "present" : "missing";
}

function catalogue<T>(
  value: unknown,
  at: string,
  emit: Emit,
  parse: (row: ObjectRow, path: string) => T | undefined,
  anonymousAgency = false,
): IdIndex<T> {
  const result: IdIndex<T> = { values: new Map(), ambiguous: new Set(), unkeyed: false };
  if (!Array.isArray(value)) {
    failure(emit, "CAL_SHAPE", at);
    result.unkeyed = true;
    return result;
  }
  for (const [position, entry] of value.entries()) {
    const path = at + "/" + position;
    if (!objectRow(entry)) {
      failure(emit, "CAL_SHAPE", path);
      result.unkeyed = true;
      continue;
    }
    const item = parse(entry, path);
    const singleAgency = anonymousAgency && value.length === 1 && entry.id === "";
    if (!(singleAgency || identifier(entry.id))) {
      failure(emit, "CAL_ID", path + "/id");
      result.unkeyed = true;
      continue;
    }
    const id = entry.id as string;
    if (result.values.has(id) || result.ambiguous.has(id)) {
      failure(emit, "CAL_DUPLICATE_ID", path + "/id");
      result.ambiguous.add(id);
    } else if (item === undefined) {
      result.ambiguous.add(id);
    } else {
      result.values.set(id, item);
    }
  }
  return result;
}

function readRoute(row: ObjectRow, at: string, emit: Emit): true | undefined {
  const namesValid = typeof row.shortName === "string" && typeof row.longName === "string"
    && (row.shortName.trim() !== "" || row.longName.trim() !== "");
  if (!namesValid) failure(emit, "CAL_NAME", at);
  // The shard stores route_type as a string and may contain an extended numeric code.
  const typeValid = typeof row.type === "string" && /^\d+$/u.test(row.type);
  if (!typeValid) failure(emit, "CAL_ROUTE_TYPE", at + "/type");
  return namesValid && typeValid ? true : undefined;
}

function coordinate(value: unknown, limit: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function readStop(row: ObjectRow, at: string, emit: Emit): Boarding | undefined {
  const nameValid = typeof row.name === "string" && row.name.trim().length > 0;
  if (!nameValid) failure(emit, "CAL_NAME", at + "/name");
  const latValid = coordinate(row.lat, 90);
  const lonValid = coordinate(row.lon, 180);
  if (!latValid) failure(emit, "CAL_COORDINATE", at + "/lat");
  if (!lonValid) failure(emit, "CAL_COORDINATE", at + "/lon");
  const flag = row.wheelchairBoarding;
  if (flag !== "0" && flag !== "UNKNOWN" && flag !== "1" && flag !== "2") {
    failure(emit, "CAL_BOARDING", at + "/wheelchairBoarding");
    return undefined;
  }
  if (!nameValid || !latValid || !lonValid) return undefined;
  return flag === "1" || flag === "2" ? flag : "UNKNOWN";
}

interface Week {
  start: number;
  end: number;
  mask: number;
  daysPerWeek: number;
}
interface Service {
  week?: Week;
  hasWeekRow: boolean;
  ambiguousWeek: boolean;
  unplacedException: boolean;
  corrections: Map<number, Activity>;
}
interface ServiceTables {
  services: Map<string, Service>;
  unkeyedWeek: boolean;
  unkeyedException: boolean;
}
function readTables(body: ObjectRow, emit: Emit): ServiceTables {
  const tables: ServiceTables = { services: new Map(), unkeyedWeek: false, unkeyedException: false };
  function service(id: string): Service {
    let existing = tables.services.get(id);
    if (!existing) {
      existing = { hasWeekRow: false, ambiguousWeek: false, unplacedException: false, corrections: new Map() };
      tables.services.set(id, existing);
    }
    return existing;
  }
  function rows(
    key: "calendar" | "calendarDates",
    read: (entry: ObjectRow, path: string, target: Service) => void,
  ): boolean {
    const value = body[key];
    const base = "/" + key;
    if (!Array.isArray(value)) {
      failure(emit, "CAL_SHAPE", base);
      return false;
    }
    let allKeyed = true;
    for (const [position, entry] of value.entries()) {
      const path = base + "/" + position;
      if (!objectRow(entry)) {
        failure(emit, "CAL_SHAPE", path);
        allKeyed = false;
      } else if (!identifier(entry.serviceId)) {
        failure(emit, "CAL_ID", path + "/serviceId");
        allKeyed = false;
      } else {
        read(entry, path, service(entry.serviceId));
      }
    }
    return allKeyed;
  }
  tables.unkeyedWeek = !rows("calendar", (entry, path, target) => {
    if (target.hasWeekRow) {
      failure(emit, "CAL_DUPLICATE_RULE", path + "/serviceId");
      target.ambiguousWeek = true;
    }
    target.hasWeekRow = true;
    const start = checkedOrdinal(entry.startDate, path + "/startDate", emit);
    const end = checkedOrdinal(entry.endDate, path + "/endDate", emit);
    const reversed = start !== undefined && end !== undefined && end < start;
    if (reversed) failure(emit, "CAL_RANGE", path + "/endDate");
    const flags = entry.weekdays;
    if (!Array.isArray(flags) || flags.length !== 7 || !Array.from(flags).every(v => v === "0" || v === "1")) {
      failure(emit, "CAL_WEEKDAYS", path + "/weekdays");
      target.ambiguousWeek = true;
    } else if (start === undefined || end === undefined || reversed) {
      target.ambiguousWeek = true;
    } else {
      let mask = 0;
      let daysPerWeek = 0;
      for (const [index, flag] of flags.entries()) {
        if (flag === "1") {
          mask |= 1 << index;
          daysPerWeek++;
        }
      }
      target.week = { start, end, mask, daysPerWeek };
    }
  });
  tables.unkeyedException = !rows("calendarDates", (entry, path, target) => {
    const day = checkedOrdinal(entry.date, path + "/date", emit);
    const action = entry.exceptionType === "1" ? "active" : entry.exceptionType === "2" ? "inactive" : "unknown";
    if (action === "unknown") failure(emit, "CAL_EXCEPTION_TYPE", path + "/exceptionType");
    if (day === undefined) {
      target.unplacedException = true;
      return;
    }
    const prior = target.corrections.get(day);
    if (prior === undefined) {
      target.corrections.set(day, action);
    } else if (prior === action && action !== "unknown") {
      emit({ code: "CAL_DUPLICATE_EXCEPTION", at: path, severity: "warning" });
    } else {
      failure(emit, "CAL_CONFLICT_EXCEPTION", path);
      target.corrections.set(day, "unknown");
    }
  });
  return tables;
}

function activeDays(week: Week | undefined, start: number, end: number): number {
  if (!week) return 0;
  const first = Math.max(week.start, start);
  const length = Math.min(week.end, end) - first + 1;
  if (length <= 0) return 0;
  const sundayIndex = ((first + 4) % 7 + 7) % 7;
  let count = Math.floor(length / 7) * week.daysPerWeek;
  for (let i = 0; i < length % 7; i++) {
    if (week.mask & (1 << ((sundayIndex + i) % 7))) count++;
  }
  return count;
}

function lowerBound(values: number[], day: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (values[mid]! < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface ExceptionIndex {
  days: number[];
  activeDelta: number[];
  unknownDelta: number[];
}
function indexExceptions(service: Service, ambiguousWeek: boolean): ExceptionIndex {
  const days = [...service.corrections.keys()].sort((a, b) => a - b);
  const activeDelta = [0];
  const unknownDelta = [0];
  let active = 0;
  let unknown = 0;
  for (const day of days) {
    const correction = service.corrections.get(day)!;
    active += Number(correction === "active") - (ambiguousWeek ? 0 : activeDays(service.week, day, day));
    unknown += Number(correction === "unknown") - Number(ambiguousWeek);
    activeDelta.push(active);
    unknownDelta.push(unknown);
  }
  return { days, activeDelta, unknownDelta };
}

export function auditCalendar(input: unknown, scope: CalendarScope, emit: Emit): CalendarIndex {
  const body: ObjectRow = objectRow(input) ? input : {};
  if (input !== body) failure(emit, "CAL_SHAPE", "/");
  const sameId = identifier(body.sourceId) && body.sourceId === scope.sourceId;
  const named = identifier(body.sourceName);
  const sameName = scope.sourceName === undefined || body.sourceName === scope.sourceName;
  if (!sameId) failure(emit, "CAL_SOURCE", "/sourceId");
  if (!named) failure(emit, "CAL_NAME", "/sourceName");
  else if (!sameName) failure(emit, "CAL_SOURCE", "/sourceName");
  const trustedSource = sameId && named && sameName;
  catalogue(body.agency, "/agency", emit, (agency, path) => {
    if (!identifier(agency.name)) failure(emit, "CAL_NAME", path + "/name");
    return true;
  }, true);
  const routes = catalogue(body.routes, "/routes", emit, (row, path) => readRoute(row, path, emit));
  const stops = catalogue(body.stops, "/stops", emit, (row, path) => readStop(row, path, emit));
  const tables = readTables(body, emit);
  const feedStart = feedBound(scope.feedStart, "/feedStart", emit);
  const feedEnd = feedBound(scope.feedEnd, "/feedEnd", emit);
  if (feedStart !== undefined && feedEnd !== undefined && feedEnd < feedStart) failure(emit, "CAL_RANGE", "/feedEnd");
  const exceptions = new Map<string, ExceptionIndex>();

  function servicePresence(id: string): CataloguePresence {
    const service = tables.services.get(id);
    if (!trustedSource || tables.unkeyedException || tables.unkeyedWeek) return "unknown";
    if (!service) return "missing";
    return service.ambiguousWeek || service.unplacedException ? "unknown" : "present";
  }
  return {
    route: id => trustedSource ? lookup(routes, id) : "unknown",
    stop: id => trustedSource ? lookup(stops, id) : "unknown",
    service: servicePresence,
    stopBoarding: id => trustedSource && lookup(stops, id) === "present" ? stops.values.get(id)! : "UNKNOWN",
    serviceDays(id, from, through) {
      const start = scheduleDateOrdinal(from);
      const end = scheduleDateOrdinal(through);
      if (start === undefined || end === undefined || end < start) {
        throw new RangeError("Invalid inclusive schedule date window");
      }
      const length = end - start + 1;
      const unknown = { active: 0, inactive: 0, unknown: length };
      const service = tables.services.get(id);
      if (!trustedSource || !service || service.unplacedException || tables.unkeyedException
        || feedStart === undefined || feedEnd === undefined) return unknown;
      const left = Math.max(feedStart, start);
      const right = Math.min(feedEnd, end);
      const inside = right - left + 1;
      if (inside <= 0) return unknown;
      const ambiguous = service.ambiguousWeek || tables.unkeyedWeek;
      let corrections = exceptions.get(id);
      if (!corrections) {
        corrections = indexExceptions(service, ambiguous);
        exceptions.set(id, corrections);
      }
      const begin = lowerBound(corrections.days, left);
      const finish = lowerBound(corrections.days, right + 1);
      const active = (ambiguous ? 0 : activeDays(service.week, left, right))
        + corrections.activeDelta[finish]! - corrections.activeDelta[begin]!;
      const unresolved = (ambiguous ? inside : 0)
        + corrections.unknownDelta[finish]! - corrections.unknownDelta[begin]!;
      return { active, inactive: inside - active - unresolved, unknown: length - inside + unresolved };
    },
  };
}
