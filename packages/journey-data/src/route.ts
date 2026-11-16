import { distance, geometry, gradePercent, text, widthMm, type Point } from "./geometry.js";
import type { PackRecord, PackSourceEntry } from "./pack-types.js";

export interface Evidence {
  recordId: string;
  field: string;
  sourceId: string;
  sourceName: string;
  licence: string;
  retrievedAt: string;
  tier: number | null;
  attribution?: string;
}
export interface RollProfile { stepFreeRequired: boolean; maxGradePercent?: number | null; widthMm?: number | null }
export interface RollRoute {
  status: "step-free" | "unknown" | "not-step-free";
  distanceMetres: number;
  path: Point[];
  recordIds: string[];
  unknownSurfaceCount: number;
  unknownAccessCount: number;
  evidence: Evidence[];
}
interface Edge {
  to: string;
  metres: number;
  record: PackRecord;
  unknownSurface: boolean;
  unknownAccess: boolean;
  cost: number;
}
function node(point: Point): string { return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`; }
function evidenceFor(record: PackRecord, sources: PackSourceEntry[]): Evidence[] {
  const sourceMap = new Map(sources.map((source) => [source.sourceId, source]));
  return Object.entries(record.fields).filter(([, field]) => field !== undefined).map(([fieldName, field]) => {
    const entry = sourceMap.get(field!.source_id);
    return {
      recordId: record.id, field: fieldName, sourceId: field!.source_id,
      sourceName: entry?.name ?? field!.source_id, licence: field!.licence,
      retrievedAt: field!.retrieved_at, tier: field!.tier ?? null,
      ...(field!.licence.toLowerCase().includes("odbl") ? { attribution: "© OpenStreetMap contributors, ODbL" } : {}),
    };
  });
}
function access(record: PackRecord, profile: RollProfile): { blocked: boolean; unknownSurface: boolean; unknownAccess: boolean } {
  const steps = text(record, "steps") ?? text(record, "step_count");
  const highway = text(record, "highway");
  const kerb = text(record, "kerb")?.toLowerCase();
  const incline = gradePercent(text(record, "incline"));
  const width = widthMm(text(record, "width"));
  const stairs = highway === "steps" || (steps !== undefined && Number(steps) > 0);
  const blocked = profile.stepFreeRequired && (stairs || kerb === "raised") ||
    (profile.maxGradePercent != null && incline !== null && Math.abs(incline) > profile.maxGradePercent) ||
    (profile.widthMm != null && width !== null && width < profile.widthMm);
  return {
    blocked,
    unknownSurface: text(record, "surface") === undefined,
    unknownAccess: (profile.stepFreeRequired && steps === undefined && highway === undefined) ||
      (profile.stepFreeRequired && kerb === undefined) ||
      (profile.maxGradePercent != null && incline === null) ||
      (profile.widthMm != null && width === null),
  };
}
/** Local A*: edges only exist where source geometry joins; never draw a fictional connector. */
export function routeRolling(
  paths: PackRecord[], origin: Point, destination: Point, profile: RollProfile,
  sources: PackSourceEntry[] = [],
): RollRoute | null {
  if (distance(origin, destination) > 3000) return null;
  const graph = new Map<string, Edge[]>();
  const points = new Map<string, Point>();
  const append = (from: string, edge: Edge) => graph.set(from, [...(graph.get(from) ?? []), edge]);
  for (const record of paths) {
    const line = geometry(record);
    if (!line) continue;
    const flags = access(record, profile);
    if (flags.blocked) continue;
    for (let i = 1; i < line.length; i++) {
      const first = line[i - 1]; const second = line[i];
      if (!first || !second) continue;
      const a = node(first); const b = node(second);
      points.set(a, first); points.set(b, second);
      const metres = distance(first, second);
      if (metres <= 0 || metres > 3000) continue;
      const edge: Edge = { to: b, metres, record, unknownSurface: flags.unknownSurface,
        unknownAccess: flags.unknownAccess, cost: metres * (1 + (flags.unknownSurface ? 0.15 : 0) + (flags.unknownAccess ? 0.25 : 0)) };
      append(a, edge); append(b, { ...edge, to: a });
    }
  }
  const nearest = (point: Point): string | null => {
    let best: string | null = null; let metres = Infinity;
    for (const [id, candidate] of points) {
      const d = distance(point, candidate);
      if (d < metres) { metres = d; best = id; }
    }
    // A path graph can be used only when the endpoint is genuinely on/near it.
    return metres <= 50 ? best : null;
  };
  const start = nearest(origin); const end = nearest(destination);
  if (!start || !end) return null;
  const open = new Set([start]); const score = new Map([[start, 0]]);
  const previous = new Map<string, { from: string; edge: Edge }>();
  while (open.size) {
    let current = ""; let lowest = Infinity;
    for (const id of open) {
      const candidate = (score.get(id) ?? Infinity) + distance(points.get(id)!, points.get(end)!);
      if (candidate < lowest) { current = id; lowest = candidate; }
    }
    if (current === end) break;
    open.delete(current);
    for (const edge of graph.get(current) ?? []) {
      const candidate = (score.get(current) ?? Infinity) + edge.cost;
      if (candidate >= (score.get(edge.to) ?? Infinity)) continue;
      score.set(edge.to, candidate); previous.set(edge.to, { from: current, edge }); open.add(edge.to);
    }
  }
  if (start !== end && !previous.has(end)) return null;
  const edges: Edge[] = []; const line = [points.get(end)!];
  let cursor = end;
  while (cursor !== start) {
    const item = previous.get(cursor);
    if (!item) return null;
    edges.unshift(item.edge); cursor = item.from; line.unshift(points.get(cursor)!);
  }
  const records = [...new Map(edges.map((edge) => [edge.record.id, edge.record])).values()];
  const unknownSurfaceCount = edges.filter((edge) => edge.unknownSurface).length;
  const unknownAccessCount = edges.filter((edge) => edge.unknownAccess).length;
  return {
    status: unknownSurfaceCount || unknownAccessCount ? "unknown" : "step-free",
    distanceMetres: edges.reduce((sum, edge) => sum + edge.metres, 0),
    path: line, recordIds: records.map((record) => record.id),
    unknownSurfaceCount, unknownAccessCount,
    evidence: records.flatMap((record) => evidenceFor(record, sources)),
  };
}
