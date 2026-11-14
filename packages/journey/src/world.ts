import type {
  BarrierReport,
  ElevatorAsset,
  JourneyDataSource,
  SeasonalNote,
} from "./catalog.js";
import { coordKey, haversineMetres, hoursBetween, type Coord } from "./geo.js";
import {
  isOsmField,
  OSM_ATTRIBUTION,
  parseInclinePercent,
  parseWidthMm,
  pathProvenance,
  readBoarding,
  readCoord,
  readGeometry,
  readNumber,
  readString,
  UNKNOWN,
  type FieldValue,
  type ImportedRecord,
} from "./records.js";
import { barrier, resolveStepFree, surveyComplete, unknownAssessment, type StepEvidenceInput } from "./stepfree.js";
import type { EquipmentProfile, Provenance, StepFreeAssessment } from "./types.js";
import type { PreparedSegment } from "./router.js";

export interface StopPoint {
  id: string;
  name: string;
  coord: Coord;
  record: ImportedRecord;
  boarding: "yes" | "no" | "unknown";
}

export interface RoutingWorld {
  source: JourneyDataSource;
  stops: Map<string, StopPoint>;
  venues: Map<string, ImportedRecord>;
  segments: PreparedSegment[];
}

const SNOW_MAX_HOURS = 72;
const WORKS_MAX_HOURS = 24 * 14;

/** A future-dated report is not current (see barrierIsFutureDated: it makes the access unknown). Snow expires after 72 hours. Other reports expire after 14 days. */
export function barrierIsCurrent(report: BarrierReport, nowIso: string): boolean {
  const age = hoursBetween(report.observedAt, nowIso);
  if (age === null || age < 0) return false;
  if (report.expiresAt) {
    const remaining = hoursBetween(nowIso, report.expiresAt);
    return remaining !== null && remaining >= 0;
  }
  const limit = report.kind === "snow" ? SNOW_MAX_HOURS : WORKS_MAX_HOURS;
  return age <= limit;
}

/**
 * A report dated after `now` cannot be confirmed as current, and it cannot be ignored either.
 * The access it names is unknown, the same way a future-dated elevator status is.
 */
export function barrierIsFutureDated(report: BarrierReport, nowIso: string): boolean {
  const age = hoursBetween(report.observedAt, nowIso);
  return age !== null && age < 0;
}

export function buildWorld(
  source: JourneyDataSource,
  options: { winter: boolean; profile: EquipmentProfile; now: string },
): RoutingWorld {
  const stops = new Map<string, StopPoint>();
  for (const record of source.stops) {
    const coord = readCoord(record);
    if (!coord) continue;
    stops.set(record.id, {
      id: record.id,
      name: readString(record, "name"),
      coord,
      record,
      boarding: readBoarding(record, "wheelchair_boarding"),
    });
  }
  const venues = new Map(source.venues.map((venue) => [venue.id, venue]));
  const segments = source.paths.flatMap((path) =>
    prepareSegment(path, source, options.winter, options.profile, options.now),
  );
  return { source, stops, venues, segments };
}

function prepareSegment(
  path: ImportedRecord,
  source: JourneyDataSource,
  winter: boolean,
  profile: EquipmentProfile,
  nowIso: string,
): PreparedSegment[] {
  const geometry = readGeometry(path);
  if (!geometry || geometry.length < 2) return [];
  const start = geometry[0];
  const end = geometry[geometry.length - 1];
  if (!start || !end) return [];
  const lengthField = readNumber(path, "length_m");
  const lengthMetres = lengthField ?? haversineMetres(start, end);
  const surface = readString(path, "surface");
  const inclineToken = readString(path, "incline");
  const incline = parseInclinePercent(inclineToken);
  const gradient = inclineToken === UNKNOWN ? "UNKNOWN" : inclineToken;
  const barrierReport = (source.barriers ?? []).find(
    (report) => report.blocksPassage && report.pathId === path.id && barrierIsCurrent(report, nowIso),
  );
  const futureReport = barrierReport
    ? undefined
    : (source.barriers ?? []).find(
        (report) => report.blocksPassage && report.pathId === path.id && barrierIsFutureDated(report, nowIso),
      );
  const seasonal = (source.seasonal ?? []).find((note) => note.pathId === path.id);
  const winterDowngrade = winter && !seasonal?.winterChecked;
  const input: StepEvidenceInput = {
    stairs: stairCount(path),
    wheelchair: wheelchairTag(readString(path, "wheelchair")),
    boarding: "unknown",
    ramp: yesNo(readString(path, "ramp")),
    inclinePercent: incline,
    widthMm: parseWidthMm(readString(path, "width")),
    blocked: Boolean(barrierReport),
    blockReason: barrierReport ? barrierReport.kind === "snow" ? "snow-blocked" : "construction" : null,
    winterDowngrade,
    tier: path.fields.wheelchair?.tier ?? path.fields.surface?.tier ?? null,
    surveyed: surveyComplete(path.fields.wheelchair?.survey ?? path.fields.step_count?.survey),
    evidenceLabel: path.id,
  };
  let assessment = resolveStepFree(input);
  assessment = applyBodyLimits(assessment, incline, input.widthMm, profile, path);
  if (barrierReport) {
    const age = hoursBetween(barrierReport.observedAt, nowIso);
    assessment = {
      ...assessment,
      evidence: [
        ...assessment.evidence,
        `barrier-observed:${barrierReport.observedAt}`,
        `barrier-age-hours:${age === null ? UNKNOWN : String(Math.round(age))}`,
      ],
    };
  }
  if (futureReport && assessment.status !== "not-step-free") {
    assessment = unknownAssessment(
      "barrier-future",
      [...assessment.evidence, `barrier-future:${futureReport.observedAt}`],
      futureReport.provenance.tier,
    );
  }
  const reason = assessment.reasons[0] ?? "";
  let provenance: Provenance;
  if (barrierReport && (reason === "snow-blocked" || reason === "construction")) {
    provenance = barrierReport.provenance;
  } else if (futureReport && reason === "barrier-future") {
    provenance = futureReport.provenance;
  } else {
    provenance = pathProvenance(decidingField(path, reason), path.id);
  }
  const osmGeometry = path.fields.geometry
    ? isOsmField(path.fields.geometry)
    : Object.values(path.fields).some((item) => isOsmField(item));
  return [
    {
      id: path.id,
      fromKey: explicitKey(path, "from_ref") ?? coordKey(start),
      toKey: explicitKey(path, "to_ref") ?? coordKey(end),
      from: start,
      to: end,
      lengthMetres,
      assessment,
      surface,
      gradient,
      provenance,
      geometryAttribution: osmGeometry ? OSM_ATTRIBUTION : null,
    },
  ];
}

/** The path field that produced the status. Falls back to the first field the record has. */
function decidingField(path: ImportedRecord, reason: string): FieldValue | undefined {
  const fields = path.fields;
  const byReason: Record<string, Array<FieldValue | undefined>> = {
    stairs: [fields.step_count, fields.stair_count],
    "wheelchair-no": [fields.wheelchair],
    "ramp-no": [fields.ramp],
    "grade-over-limit": [fields.incline],
    "width-under-chair": [fields.width],
  };
  const candidates = [
    ...(byReason[reason] ?? []),
    fields.wheelchair,
    fields.ramp,
    fields.step_count,
    fields.stair_count,
    fields.surface,
    fields.incline,
    fields.width,
    fields.geometry,
  ];
  return candidates.find((item) => item !== undefined);
}

function explicitKey(path: ImportedRecord, key: string): string | null {
  const value = readString(path, key);
  return value === UNKNOWN ? null : value;
}

function stairCount(path: ImportedRecord): number | null {
  const steps = readNumber(path, "step_count");
  if (steps !== null) return steps;
  return readNumber(path, "stair_count");
}

function wheelchairTag(value: string): "yes" | "no" | "unknown" {
  const lower = value.toLowerCase();
  if (lower === "yes") return "yes";
  if (lower === "no") return "no";
  return "unknown";
}

function yesNo(value: string): "yes" | "no" | "unknown" {
  const lower = value.toLowerCase();
  if (lower === "yes") return "yes";
  if (lower === "no") return "no";
  return "unknown";
}

function applyBodyLimits(
  assessment: StepFreeAssessment,
  incline: number | null,
  widthMm: number | null,
  profile: EquipmentProfile,
  path: ImportedRecord,
): StepFreeAssessment {
  if (
    incline !== null &&
    profile.maxGradePercent !== null &&
    Math.abs(incline) > profile.maxGradePercent
  ) {
    return barrier("grade-over-limit", path.fields.incline?.tier ?? null, [
      ...assessment.evidence,
      `incline:${incline}`,
    ]);
  }
  if (widthMm !== null && profile.widthMm !== null && widthMm < profile.widthMm) {
    return barrier("width-under-chair", path.fields.width?.tier ?? null, [
      ...assessment.evidence,
      `width-mm:${widthMm}`,
    ]);
  }
  return assessment;
}

export function elevatorsForStop(source: JourneyDataSource, stopId: string): ElevatorAsset[] {
  return (source.elevators ?? []).filter((elevator) => elevator.stopId === stopId);
}

export function barriersForStop(source: JourneyDataSource, stopId: string, nowIso: string): BarrierReport[] {
  return (source.barriers ?? []).filter(
    (report) => report.blocksPassage && report.stopId === stopId && barrierIsCurrent(report, nowIso),
  );
}

export function futureBarriersForStop(source: JourneyDataSource, stopId: string, nowIso: string): BarrierReport[] {
  return (source.barriers ?? []).filter(
    (report) => report.blocksPassage && report.stopId === stopId && barrierIsFutureDated(report, nowIso),
  );
}

export function seasonalForPath(notes: SeasonalNote[] | undefined, pathId: string): SeasonalNote | undefined {
  return notes?.find((note) => note.pathId === pathId);
}

export function venueById(world: RoutingWorld, venueId: string | undefined): ImportedRecord | undefined {
  if (!venueId) return undefined;
  return world.venues.get(venueId);
}
