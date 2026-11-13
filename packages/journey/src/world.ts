import type {
  BarrierReport,
  ElevatorAsset,
  JourneyDataSource,
  SeasonalNote,
} from "./catalog.js";
import { coordKey, haversineMetres, type Coord } from "./geo.js";
import {
  parseInclinePercent,
  parseWidthMm,
  readBoarding,
  readCoord,
  readGeometry,
  readNumber,
  readString,
  UNKNOWN,
  type ImportedRecord,
} from "./records.js";
import { barrier, resolveStepFree, type StepEvidenceInput } from "./stepfree.js";
import type { EquipmentProfile, StepFreeAssessment } from "./types.js";
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

export function buildWorld(
  source: JourneyDataSource,
  options: { winter: boolean; profile: EquipmentProfile },
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
    prepareSegment(path, source, options.winter, options.profile),
  );
  return { source, stops, venues, segments };
}

function prepareSegment(
  path: ImportedRecord,
  source: JourneyDataSource,
  winter: boolean,
  profile: EquipmentProfile,
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
  const barrierReport = blockingBarrier(source.barriers ?? [], path.id);
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
    tier: path.fields.wheelchair?.tier ?? path.fields.surface?.tier ?? 0,
    evidenceLabel: path.id,
  };
  let assessment = resolveStepFree(input);
  assessment = applyBodyLimits(assessment, incline, input.widthMm, profile, path);
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
      provenanceNote: path.fields.wheelchair?.source_id ?? path.fields.surface?.source_id ?? "none",
    },
  ];
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

function blockingBarrier(reports: BarrierReport[], pathId: string): BarrierReport | undefined {
  return reports.find((report) => report.blocksPassage && report.pathId === pathId);
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
    return barrier("grade-over-limit", path.fields.incline?.tier ?? 0, [
      ...assessment.evidence,
      `incline:${incline}`,
    ]);
  }
  if (widthMm !== null && profile.widthMm !== null && widthMm < profile.widthMm) {
    return barrier("width-under-chair", path.fields.width?.tier ?? 0, [
      ...assessment.evidence,
      `width-mm:${widthMm}`,
    ]);
  }
  return assessment;
}

export function elevatorsForStop(source: JourneyDataSource, stopId: string): ElevatorAsset[] {
  return (source.elevators ?? []).filter((elevator) => elevator.stopId === stopId);
}

export function barriersForStop(source: JourneyDataSource, stopId: string): BarrierReport[] {
  return (source.barriers ?? []).filter((report) => report.blocksPassage && report.stopId === stopId);
}

export function seasonalForPath(notes: SeasonalNote[] | undefined, pathId: string): SeasonalNote | undefined {
  return notes?.find((note) => note.pathId === pathId);
}

export function venueById(world: RoutingWorld, venueId: string | undefined): ImportedRecord | undefined {
  if (!venueId) return undefined;
  return world.venues.get(venueId);
}
