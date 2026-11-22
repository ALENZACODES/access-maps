import { Buffer } from "node:buffer";
import { scheduleDateOrdinal, type CalendarIndex } from "./calendar.ts";
import type { Issue } from "./common.ts";

export const tripIssueText = {
  "trip.count": ["Decoded row count differs from the manifest.", "Le nombre de lignes décodées diffère du manifeste."],
  "trip.row": ["Expected a trip object.", "Un objet de trajet est attendu."],
  "trip.id": ["The identifier is missing or malformed.", "L’identifiant est absent ou mal formé."],
  "trip.duplicate-id": ["This trip identifier already occurred in this source and region.", "Cet identifiant de trajet figure déjà dans cette source et cette région."],
  "trip.id-budget": ["Identifier tracking reached its limit. Uniqueness is unknown for this row.", "Le suivi des identifiants a atteint sa limite. L’unicité de cette ligne est inconnue."],
  "trip.headsign": ["The headsign must be text. An empty headsign is allowed.", "La destination affichée doit être du texte. Elle peut être vide."],
  "trip.wheelchair-flag": ["The trip’s wheelchair field has an unrecognized value.", "La valeur du champ d’accès en fauteuil roulant du trajet est inconnue du format."],
  "trip.catalog-unavailable": ["The calendar catalogue is unavailable for checking references.", "Le catalogue des horaires est indisponible pour le contrôle des références."],
  "trip.route-missing": ["The route is absent from the calendar catalogue.", "La ligne est absente du catalogue des horaires."],
  "trip.route-unknown": ["The calendar catalogue cannot resolve this route uniquely.", "Le catalogue des horaires ne permet pas d’identifier cette ligne de façon unique."],
  "trip.stop-missing": ["The stop is absent from the calendar catalogue.", "L’arrêt est absent du catalogue des horaires."],
  "trip.stop-unknown": ["The calendar catalogue cannot resolve this stop uniquely.", "Le catalogue des horaires ne permet pas d’identifier cet arrêt de façon unique."],
  "trip.service-missing": ["The service is absent from the calendar and its date exceptions.", "Le service est absent du calendrier et de ses exceptions datées."],
  "trip.service-unknown": ["The calendar cannot resolve this service.", "Le calendrier ne permet pas d’identifier ce service."],
  "trip.no-service-days": ["The calendar has no active day for this trip in the declared feed period.", "Le calendrier ne prévoit aucun jour actif pour ce trajet durant la période déclarée du flux."],
  "trip.service-days-unknown": ["No active day could be established throughout the declared feed period.", "Aucun jour actif n’a pu être établi pour la période déclarée du flux."],
  "trip.stop-list": ["A timetabled trip needs a nonempty list of stop times.", "Un trajet avec horaire nécessite une liste non vide d’heures d’arrêt."],
  "trip.stop-row": ["Expected a stop-time object.", "Un objet d’horaire d’arrêt est attendu."],
  "trip.sequence": ["A stop sequence must be a nonnegative integer.", "Le numéro de séquence de l’arrêt doit être un entier positif ou nul."],
  "trip.sequence-order": ["Stop sequence numbers must increase in published order.", "Les numéros de séquence des arrêts doivent augmenter dans l’ordre publié."],
  "trip.clock": ["Expected an hour, minute and second on the service-day clock.", "L’heure, les minutes et les secondes du jour de service sont attendues."],
  "trip.dwell": ["The trip departs before it arrives at this stop.", "Le trajet repart avant son arrivée à cet arrêt."],
  "trip.time-backwards": ["This stop time precedes a known time at an earlier stop.", "Cet horaire précède une heure connue à un arrêt antérieur."],
  "trip.lookup-window": ["A stop time falls beyond the offline lookup’s service-day lookback.", "Une heure d’arrêt dépasse le nombre de jours de service antérieurs consultés hors ligne."],
} as const;

export type TripIssueCode = keyof typeof tripIssueText;
export const tripIssueCodes = Object.freeze(Object.keys(tripIssueText) as TripIssueCode[]);
export type TripCatalog = Pick<CalendarIndex, "route" | "service" | "stop" | "serviceDays">;

export interface TripPart {
  partIndex: number;
  tripCount: number;
  feedStart: string;
  feedEnd: string;
}

export interface TripMetrics {
  declaredTrips: number;
  parsedRows: number;
  tripRows: number;
  rowsWithErrors: number;
  rowsWithWarnings: number;
  stopTimes: number;
  unknownWheelchairTrips: number;
  afterMidnightTrips: number;
  duplicateTripIds: number;
  untrackedTripIds: number;
  errors: number;
  warnings: number;
}

export interface TripPartReport extends TripMetrics {
  partIndex: number;
}

export interface TripAuditReport extends TripMetrics {
  parts: number;
  issues: Issue[];
  omittedIssues: number;
}

export interface TripAuditOptions {
  maxIssues?: number;
  maxTripIds?: number;
  maxIdCodeUnits?: number;
  onIssue?: (issue: Issue) => void;
}

const SECONDS_PER_DAY = 86_400;
// The offline runtime queries the local service date and the two preceding dates.
const LOOKBACK_END = 3 * SECONDS_PER_DAY;

function emptyMetrics(): TripMetrics {
  return {
    declaredTrips: 0, parsedRows: 0, tripRows: 0, rowsWithErrors: 0,
    rowsWithWarnings: 0, stopTimes: 0, unknownWheelchairTrips: 0,
    afterMidnightTrips: 0, duplicateTripIds: 0, untrackedTripIds: 0, errors: 0, warnings: 0,
  };
}

function bound(value: number, upper: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > upper) {
    throw new RangeError("Invalid trip audit limit or count.");
  }
  return value;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !/[\u0000-\u001f\u007f]/u.test(value);
}

function serviceClock(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 9) return null;
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/u.exec(value);
  if (!match || match[0] !== value) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

type Emit = (code: TripIssueCode, at: string, severity?: Issue["severity"]) => void;

interface PartContext {
  part: TripPart;
  catalog: TripCatalog | null;
  serviceChecks: Map<string, TripIssueCode | null>;
  hasDateWindow: boolean;
  metrics: TripMetrics;
  emit: Emit;
}

function checkReference(kind: "route" | "stop", value: unknown, at: string, context: PartContext): void {
  if (!identifier(value)) {
    context.emit("trip.id", at);
    return;
  }
  if (!context.catalog) return;
  const state = context.catalog[kind](value);
  if (state === "missing") context.emit(`trip.${kind}-missing`, at);
  if (state === "unknown") context.emit(`trip.${kind}-unknown`, at, "warning");
}

function serviceFinding(id: string, catalog: TripCatalog, part: TripPart, hasDateWindow: boolean): TripIssueCode | null {
  const reference = catalog.service(id);
  if (reference === "missing") return "trip.service-missing";
  if (reference === "unknown") return "trip.service-unknown";
  if (!hasDateWindow) return "trip.service-days-unknown";
  const days = catalog.serviceDays(id, part.feedStart, part.feedEnd);
  if (days.active > 0) return null;
  return days.unknown > 0 ? "trip.service-days-unknown" : "trip.no-service-days";
}

function checkService(value: unknown, at: string, context: PartContext): void {
  if (!identifier(value)) {
    context.emit("trip.id", at);
    return;
  }
  if (!context.catalog) return;
  let code = context.serviceChecks.get(value);
  if (code === undefined) {
    code = serviceFinding(value, context.catalog, context.part, context.hasDateWindow);
    // A bounded per-shard cache covers repeated service patterns without retaining
    // identifiers from old parts. Each shard can declare a different feed period.
    if (context.serviceChecks.size < 4096) context.serviceChecks.set(value, code);
  }
  if (code) context.emit(code, at, code === "trip.service-missing" ? "error" : "warning");
}

function checkStops(value: unknown, at: string, context: PartContext): void {
  const { metrics, emit } = context;
  if (!Array.isArray(value) || value.length === 0) {
    emit("trip.stop-list", at);
    return;
  }
  metrics.stopTimes += value.length;
  let greatestSequence = -1;
  let latestTime = -1;
  let afterMidnight = false;
  let outsideLookup = false;
  for (const [index, stop] of value.entries()) {
    const where = `${at}[${index}]`;
    if (!object(stop)) {
      emit("trip.stop-row", where);
      continue;
    }
    checkReference("stop", stop.stopId, where + ".stopId", context);
    const sequence = stop.sequence;
    if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) {
      emit("trip.sequence", where + ".sequence");
    } else {
      if (sequence <= greatestSequence) emit("trip.sequence-order", where + ".sequence");
      greatestSequence = Math.max(greatestSequence, sequence);
    }

    const arrival = serviceClock(stop.arrival);
    const departure = serviceClock(stop.departure);
    if (arrival === null) emit("trip.clock", where + ".arrival");
    if (departure === null) emit("trip.clock", where + ".departure");
    if (departure !== null && arrival !== null && departure < arrival) {
      emit("trip.dwell", where + ".departure");
    }
    // Keep the greatest known time even when an intervening stop is malformed.
    // A bad cell must not make a backwards jump at the next stop look valid.
    const firstTime = arrival ?? departure;
    if (firstTime !== null && firstTime < latestTime) {
      emit("trip.time-backwards", where + (arrival === null ? ".departure" : ".arrival"));
    }
    latestTime = Math.max(latestTime, arrival ?? -1, departure ?? -1);
    if (latestTime >= SECONDS_PER_DAY) afterMidnight = true;
    if (!outsideLookup && latestTime >= LOOKBACK_END) {
      outsideLookup = true;
      const field = arrival !== null && arrival >= LOOKBACK_END ? ".arrival" : ".departure";
      emit("trip.lookup-window", where + field, "warning");
    }
  }
  if (afterMidnight) metrics.afterMidnightTrips++;
}

function checkRow(row: unknown, at: string, context: PartContext, register: (id: string, at: string) => void): void {
  const { metrics, emit } = context;
  if (!object(row)) {
    emit("trip.row", at);
    return;
  }
  metrics.tripRows++;
  if (identifier(row.id)) register(row.id, at + ".id");
  else emit("trip.id", at + ".id");
  if (!context.catalog) emit("trip.catalog-unavailable", at, "warning");
  checkReference("route", row.routeId, at + ".routeId", context);
  checkService(row.serviceId, at + ".serviceId", context);
  if (typeof row.headsign !== "string") emit("trip.headsign", at + ".headsign");
  // Both GTFS 0 and the builder's UNKNOWN normalize to unknown in the reader.
  // Neither the trip's stops nor another trip supplies a wheelchair value.
  if (row.wheelchairAccessible !== "1" && row.wheelchairAccessible !== "2") {
    metrics.unknownWheelchairTrips++;
    if (row.wheelchairAccessible !== "UNKNOWN" && row.wheelchairAccessible !== "0") {
      emit("trip.wheelchair-flag", at + ".wheelchairAccessible");
    }
  }
  checkStops(row.stopTimes, at + ".stopTimes", context);
}

/** One forward pass per source and region, using only parts already authenticated by the reader. */
export class TripAudit {
  private readonly catalog: TripCatalog | null;
  private readonly sampleLimit: number;
  private readonly idLimit: number;
  private readonly textLimit: number;
  private readonly onIssue?: (issue: Issue) => void;
  private readonly seenIds = new Set<string>();
  private readonly totals = emptyMetrics();
  private readonly samples: Issue[] = [];
  private idUnits = 0;
  private partCount = 0;

  constructor(catalog: TripCatalog | null, options: TripAuditOptions = {}) {
    this.catalog = catalog;
    this.sampleLimit = bound(options.maxIssues ?? 100, 10_000);
    this.idLimit = bound(options.maxTripIds ?? 200_000, 1_000_000);
    this.textLimit = bound(options.maxIdCodeUnits ?? 8_000_000, 64_000_000);
    this.onIssue = options.onIssue;
  }

  auditPart(part: TripPart, rows: readonly unknown[]): TripPartReport {
    bound(part.partIndex, Number.MAX_SAFE_INTEGER);
    bound(part.tripCount, Number.MAX_SAFE_INTEGER - this.totals.declaredTrips);
    const metrics = emptyMetrics();
    metrics.parsedRows = rows.length;
    metrics.declaredTrips = part.tripCount;
    // Stage the per-part contribution. A failing lookup or evidence sink cannot
    // consume IDs or counters and then cause false duplicates on a fresh attempt.
    const newIds = new Set<string>();
    let newUnits = 0;
    const samples: Issue[] = [];
    const emit: Emit = (code, at, severity = "error") => {
      if (severity === "error") metrics.errors++;
      else metrics.warnings++;
      const issue = { code, at, severity };
      if (this.samples.length + samples.length < this.sampleLimit) samples.push(issue);
      this.onIssue?.({ ...issue });
    };
    const register = (id: string, at: string) => {
      if (this.seenIds.has(id) || newIds.has(id)) {
        metrics.duplicateTripIds++;
        emit("trip.duplicate-id", at);
      } else if (this.seenIds.size + newIds.size >= this.idLimit ||
          this.idUnits + newUnits + id.length > this.textLimit) {
        metrics.untrackedTripIds++;
        emit("trip.id-budget", at, "warning");
      } else {
        // A parsed string may be a slice backed by the complete decoded shard.
        // Detach the retained key, preserving even unpaired UTF-16 code units.
        newIds.add(Buffer.from(id, "utf16le").toString("utf16le"));
        newUnits += id.length;
      }
    };
    const from = scheduleDateOrdinal(part.feedStart);
    const through = scheduleDateOrdinal(part.feedEnd);
    const context: PartContext = {
      part, catalog: this.catalog, metrics, serviceChecks: new Map(), emit,
      hasDateWindow: from !== undefined && through !== undefined && from <= through,
    };
    const path = `parts[${part.partIndex}]`;
    if (metrics.declaredTrips !== rows.length) emit("trip.count", path + ".tripCount");
    for (const [index, row] of rows.entries()) {
      const errorsBefore = metrics.errors;
      const warningsBefore = metrics.warnings;
      checkRow(row, `${path}.rows[${index}]`, context, register);
      if (metrics.errors > errorsBefore) metrics.rowsWithErrors++;
      if (metrics.warnings > warningsBefore) metrics.rowsWithWarnings++;
    }
    for (const id of newIds) this.seenIds.add(id);
    this.idUnits += newUnits;
    this.samples.push(...samples);
    this.partCount++;
    for (const field of Object.keys(metrics) as (keyof TripMetrics)[]) this.totals[field] += metrics[field];
    return { partIndex: part.partIndex, ...metrics };
  }

  summary(): TripAuditReport {
    return {
      ...this.totals,
      parts: this.partCount,
      issues: this.samples.map(issue => ({ ...issue })),
      omittedIssues: this.totals.errors + this.totals.warnings - this.samples.length,
    };
  }
}
