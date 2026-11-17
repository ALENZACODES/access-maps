/**
 * Cross-source place matcher.
 *
 * Links records from different sources that describe the same real place.
 * It reads records and writes link data only; it never edits a record.
 *
 * Steps (all deterministic; ties are broken by record key):
 *  1. Candidates: records from different sources within a small distance,
 *     found with a spatial grid. 100 m in general, 50 m in dense blocks,
 *     30 m for transit stops, 250 m when both records are large-area places
 *     (parks, schools, sports grounds, campgrounds), whose points two
 *     sources often put far apart.
 *  2. Score: name similarity on normalised tokens, distance, class
 *     compatibility, and house number / street and stop code when both
 *     records have them. Each candidate is "match", "possible" or dropped.
 *  3. Ambiguity: if a record matches two records of the same other source
 *     with close scores, none of those matches is used; they are listed as
 *     possible duplicates. A match must be the best for both records.
 *  4. Clusters: matches are merged strongest first. Two groups merge only if
 *     no source appears twice and every cross pair is at least a possible
 *     duplicate with no address conflict. Otherwise the edge is listed as a
 *     possible duplicate. Possible duplicates are never merged.
 */
import { AREA_CLASSES, classCompatibility, fineConflict, fineType, kindsConflict, nameKinds, placeClass, type PlaceClass } from "./category.js";
import {
  compareAddress,
  compareNames,
  houseNumbers,
  nameTokens,
  splitAddress,
  stopNameConflict,
  type AddressAgreement,
} from "./normalize.js";

export const MATCH_METHOD = "same-place-v1";

export const PLACE_TRANCHES = ["venue", "washroom", "transit"] as const;
export type PlaceTranche = (typeof PLACE_TRANCHES)[number];

export interface MatchParams {
  radiusM: number;
  denseRadiusM: number;
  transitRadiusM: number;
  areaRadiusM: number;
  /** Records in one grid bucket (about 110 m by 110 m) at or above which the block is dense. */
  denseBucketRecords: number;
  matchScore: number;
  matchNameMin: number;
  possibleScore: number;
  possibleNameMin: number;
  /** A record's best and second-best match from the same other source must differ by at least this. */
  ambiguityMargin: number;
  /** Largest distance for a possible duplicate when one side has no name. */
  unnamedPossibleM: number;
  /** Largest distance for a possible duplicate when neither side has a name. */
  bothUnnamedPossibleM: number;
  /** Two features of the same type with no distinctive name this close are one feature. */
  sameSpotM: number;
  /** Source pairs whose identifiers agree on at least this share of close pairs use the identifier as evidence both ways. */
  codeComparableShare: number;
  codeComparableMin: number;
}

export const DEFAULT_PARAMS: MatchParams = {
  radiusM: 100,
  denseRadiusM: 50,
  transitRadiusM: 30,
  areaRadiusM: 250,
  denseBucketRecords: 120,
  matchScore: 0.72,
  matchNameMin: 0.6,
  possibleScore: 0.5,
  possibleNameMin: 0.4,
  ambiguityMargin: 0.08,
  unnamedPossibleM: 25,
  bothUnnamedPossibleM: 8,
  sameSpotM: 5,
  codeComparableShare: 0.5,
  codeComparableMin: 10,
};

/** The parts of a record the matcher reads. */
export interface PlacePoint {
  key: string;
  tranche: PlaceTranche;
  id: string;
  sourceId: string;
  cell: string;
  lat: number;
  lon: number;
  name: string[];
  klass: PlaceClass;
  /** Finer type for benches, tables, parking spaces and splash pads; the class otherwise. */
  fine: string;
  kinds: PlaceClass[];
  housenumber: string[];
  street: string[];
  /** Published identifiers (GTFS stop_code, a layer's ref), lower case, three characters or more. */
  codes: string[];
  /** The name as published, for stop-name structure only. Not written to link files. */
  rawName: string | null;
  dense?: boolean;
}

interface RawField { value?: unknown; source_id?: string; derived?: boolean }
interface RawRecord { id?: unknown; tranche?: unknown; region?: unknown; fields?: Record<string, RawField | undefined> }

function text(record: RawRecord, name: string): string | null {
  const value = record.fields?.[name]?.value;
  if (typeof value === "string" && value !== "UNKNOWN" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(record: RawRecord, name: string): number | null {
  const value = record.fields?.[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function recordKey(tranche: string, id: string): string {
  return `${tranche}|${id}`;
}

/** The record's source: the source of its coordinate (every field of an import record carries the same source). */
export function recordSource(record: RawRecord): string | null {
  const fields = record.fields ?? {};
  const fromLat = fields.lat?.source_id;
  if (typeof fromLat === "string") return fromLat;
  for (const field of Object.values(fields)) if (field && typeof field.source_id === "string") return field.source_id;
  return null;
}

/** Reads the matcher's view of a record, or null when it is not a place with a usable point. */
export function toPlacePoint(input: unknown): PlacePoint | null {
  if (!input || typeof input !== "object") return null;
  const record = input as RawRecord;
  const tranche = record.tranche;
  if (tranche !== "venue" && tranche !== "washroom" && tranche !== "transit") return null;
  if (typeof record.id !== "string" || typeof record.region !== "string") return null;
  const lat = num(record, "lat");
  const lon = num(record, "lon");
  const sourceId = recordSource(record);
  if (lat === null || lon === null || !sourceId) return null;
  const name = nameTokens(text(record, "name"));
  let housenumber = houseNumbers(text(record, "addr_housenumber"));
  let street = nameTokens(text(record, "addr_street"));
  if (housenumber.length === 0 && street.length === 0) {
    const split = splitAddress(text(record, "address"));
    housenumber = split.housenumber;
    street = split.street;
  }
  const words = [text(record, "category"), text(record, "category_group"), text(record, "facility_type")];
  const klass = placeClass(tranche, words);
  const rawName = text(record, "name");
  const codes = [text(record, "stop_code"), text(record, "ref")]
    .filter((code): code is string => code !== null)
    .map((code) => code.trim().toLowerCase())
    .filter((code) => code.length >= 3);
  return {
    key: recordKey(tranche, record.id),
    tranche,
    id: record.id,
    sourceId,
    cell: record.region,
    lat,
    lon,
    name,
    klass,
    fine: fineType(klass, words),
    kinds: nameKinds(rawName),
    housenumber,
    street,
    codes: [...new Set(codes)].sort(),
    rawName,
  };
}

const EARTH_M = 6_371_008.8;
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Decision = "match" | "possible" | "none";

export interface PairEvidence {
  decision: Decision;
  score: number;
  distance_m: number;
  radius_m: number;
  /** Name similarity 0..1, or null when a side has no name. */
  name: number | null;
  class_compat: number;
  address: AddressAgreement;
  /** A published identifier (stop code or ref) on both records: shared, or none shared. */
  code: "same" | "different" | "unknown";
  reason: string;
}

export function pairRadius(a: PlacePoint, b: PlacePoint, params: MatchParams = DEFAULT_PARAMS): number {
  if (a.klass === "transit" || b.klass === "transit") return params.transitRadiusM;
  if (AREA_CLASSES.has(a.klass) && AREA_CLASSES.has(b.klass)) return params.areaRadiusM;
  return a.dense || b.dense ? params.denseRadiusM : params.radiusM;
}

/** Largest radius any pair that has this record as its first member can use. */
export function searchRadius(a: PlacePoint, params: MatchParams = DEFAULT_PARAMS): number {
  if (AREA_CLASSES.has(a.klass)) return params.areaRadiusM;
  return Math.max(params.radiusM, params.transitRadiusM);
}

const round = (value: number, digits = 3): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** Scores one pair. Symmetric: scorePair(a, b) and scorePair(b, a) agree. */
export function scorePair(a: PlacePoint, b: PlacePoint, params: MatchParams = DEFAULT_PARAMS): PairEvidence {
  const distance = distanceM(a, b);
  const radius = pairRadius(a, b, params);
  const compat = classCompatibility(a.klass, b.klass);
  const base = {
    distance_m: round(distance, 1),
    radius_m: radius,
    class_compat: compat,
  };
  const none = (reason: string): PairEvidence => ({
    ...base, decision: "none", score: 0, name: null, address: "unknown", code: "unknown", reason,
  });
  if (a.sourceId === b.sourceId) return none("same source");
  if (compat === 0) return none("classes cannot be the same place");
  if (distance > radius) return none("too far apart");
  if (kindsConflict(a.kinds, b.kinds)) return none("names say different kinds of place");
  if (fineConflict(a.fine, b.fine)) return none("different kinds of feature");
  const transit = a.klass === "transit" || b.klass === "transit";
  const stopConflict = transit ? stopNameConflict(a.rawName, b.rawName) : "none";
  if (stopConflict === "different") return none("stop names say a different side, street or platform");
  const address = compareAddress(a, b);
  const code = a.codes.length === 0 || b.codes.length === 0
    ? "unknown"
    : a.codes.some((item) => b.codes.includes(item)) ? "same" : "different";
  const near = 1 - distance / radius;
  const named = a.name.length > 0 && b.name.length > 0;
  const comparison = named ? compareNames(a.name, b.name) : null;
  // A name made only of generic words ("Splash Pad", "play structure") says what, not which.
  const nameScore = comparison && comparison.distinctiveA > 0 && comparison.distinctiveB > 0 ? comparison.score : null;
  let score: number;
  if (nameScore !== null) {
    score = 0.55 * nameScore + 0.25 * near + 0.2 * compat;
  } else {
    score = 0.35 * near + 0.15 * compat;
  }
  if (address === "same") score += nameScore === null ? 0.4 : 0.1;
  if (address === "different_number") score -= 0.25;
  if (address === "different_street") score -= 0.15;
  if (code === "same") score += nameScore === null ? 0.45 : 0.2;
  score = round(Math.max(0, Math.min(1, score)));
  const evidence = { ...base, score, name: nameScore, address, code } as const;
  const addressConflict = address === "different_number" || address === "different_street";
  const capped = stopConflict === "platform_one_side";
  if (nameScore !== null) {
    if (!addressConflict && !capped && score >= params.matchScore && nameScore >= params.matchNameMin) {
      return { ...evidence, decision: "match", reason: "name, distance and class agree" };
    }
    if (score >= params.possibleScore && nameScore >= params.possibleNameMin) {
      return {
        ...evidence,
        decision: "possible",
        reason: addressConflict ? "names agree but addresses differ" : capped ? "a platform and a stop or station" : "below the match score",
      };
    }
    return { ...evidence, decision: "none", reason: "names differ" };
  }
  // No distinctive name on a side: an address, a shared identifier, or the same small feature at
  // the same spot can make a match.
  const sameFeature = a.fine === b.fine && compat === 1;
  if (!addressConflict && compat >= 0.6 && (address === "same" || code === "same") && score >= params.matchScore) {
    return { ...evidence, decision: "match", reason: code === "same" ? "no distinctive name; identifier agrees" : "no distinctive name; address agrees" };
  }
  if (!addressConflict && sameFeature && POINT_SAME_SPOT.has(a.klass) && distance <= params.sameSpotM) {
    // Scored on the same-spot scale, so the nearest of two candidates stands out.
    const spot = round(0.5 + 0.35 * (1 - distance / params.sameSpotM));
    return { ...evidence, score: spot, decision: "match", reason: "no distinctive name; the same kind of feature at the same spot" };
  }
  const limit = a.name.length === 0 && b.name.length === 0 ? params.bothUnnamedPossibleM : params.unnamedPossibleM;
  if (!addressConflict && sameFeature && distance <= limit) {
    return { ...evidence, decision: "possible", reason: "no distinctive name; the same kind of feature close by" };
  }
  return { ...evidence, decision: "none", reason: "no distinctive name" };
}

/** Small features matched by position alone when they are the same type and within sameSpotM. */
const POINT_SAME_SPOT: ReadonlySet<PlaceClass> = new Set(["street_furniture", "playground", "sport_field", "drinking_water", "washroom", "parking"]);

export interface Edge {
  a: string;
  b: string;
  evidence: PairEvidence;
}

/** Grid of points for neighbour search. Bucket edge is about 110 m. */
export class PointGrid {
  static readonly LAT_STEP = 0.001;
  static readonly LON_STEP = 0.0014;
  private readonly buckets = new Map<string, PlacePoint[]>();

  static bucketOf(lat: number, lon: number): [number, number] {
    return [Math.floor(lat / PointGrid.LAT_STEP), Math.floor(lon / PointGrid.LON_STEP)];
  }

  add(point: PlacePoint): void {
    const [y, x] = PointGrid.bucketOf(point.lat, point.lon);
    const key = `${y}:${x}`;
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(point);
    else this.buckets.set(key, [point]);
  }

  *near(point: { lat: number; lon: number }, radiusM: number): Generator<PlacePoint> {
    const [y, x] = PointGrid.bucketOf(point.lat, point.lon);
    const dy = Math.ceil(radiusM / 111_000 / PointGrid.LAT_STEP);
    const lonMetres = 111_320 * Math.cos((point.lat * Math.PI) / 180);
    const dx = Math.ceil(radiusM / Math.max(1, lonMetres) / PointGrid.LON_STEP);
    for (let i = y - dy; i <= y + dy; i += 1) {
      for (let j = x - dx; j <= x + dx; j += 1) {
        const bucket = this.buckets.get(`${i}:${j}`);
        if (bucket) yield* bucket;
      }
    }
  }
}

/** Records per grid bucket over the whole run, so a record is dense or not whatever cell is being read. */
export class DensityIndex {
  private readonly counts = new Map<string, number>();
  add(lat: number, lon: number): void {
    const [y, x] = PointGrid.bucketOf(lat, lon);
    const key = `${y}:${x}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  count(lat: number, lon: number): number {
    const [y, x] = PointGrid.bucketOf(lat, lon);
    return this.counts.get(`${y}:${x}`) ?? 0;
  }
}

/** Degrees of margin read from neighbouring cells, enough for the largest radius. */
export const CELL_MARGIN_DEG = 0.004;

/**
 * Candidate edges for the records of one cell. `margin` holds records of
 * neighbouring cells near the edge. Each pair is evaluated exactly once over
 * the whole run: inside a cell, by the record with the smaller key; across
 * cells, by the record in the cell whose id sorts first.
 */
export function cellEdges(
  own: readonly PlacePoint[],
  margin: readonly PlacePoint[],
  density: DensityIndex,
  params: MatchParams = DEFAULT_PARAMS,
  keep?: (evidence: PairEvidence) => boolean,
): Edge[] {
  const grid = new PointGrid();
  for (const point of own) grid.add(point);
  const marginGrid = new PointGrid();
  for (const point of margin) marginGrid.add(point);
  for (const point of [...own, ...margin]) point.dense = density.count(point.lat, point.lon) >= params.denseBucketRecords;
  const edges: Edge[] = [];
  const sorted = [...own].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  for (const a of sorted) {
    const radius = searchRadius(a, params);
    const candidates: PlacePoint[] = [];
    for (const b of grid.near(a, radius)) if (b.key > a.key) candidates.push(b);
    for (const b of marginGrid.near(a, radius)) if (b.cell > a.cell) candidates.push(b);
    candidates.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    for (const b of candidates) {
      if (b.sourceId === a.sourceId) continue;
      const evidence = scorePair(a, b, params);
      if (evidence.decision !== "none" || keep?.(evidence)) {
        const [x, y] = a.key < b.key ? [a.key, b.key] : [b.key, a.key];
        edges.push({ a: x, b: y, evidence });
      }
    }
  }
  return edges;
}

export interface Cluster {
  id: string;
  members: string[];
  edges: Edge[];
}

export interface PossibleDuplicate {
  a: string;
  b: string;
  evidence: PairEvidence;
  why: string;
}

export interface ClusterResult {
  clusters: Cluster[];
  possible: PossibleDuplicate[];
}

function compareEdges(x: Edge, y: Edge): number {
  if (x.evidence.score !== y.evidence.score) return y.evidence.score - x.evidence.score;
  if (x.a !== y.a) return x.a < y.a ? -1 : 1;
  return x.b < y.b ? -1 : x.b > y.b ? 1 : 0;
}

/**
 * Turns scored edges into clusters and possible duplicates. `points` must
 * hold every record named by an edge (used for the cross-pair check).
 */
export function clusterEdges(
  edges: readonly Edge[],
  points: ReadonlyMap<string, PlacePoint>,
  params: MatchParams = DEFAULT_PARAMS,
): ClusterResult {
  const possible: PossibleDuplicate[] = [];
  const demoted = new Map<Edge, string>();
  // Identifiers: some source pairs share a numbering (a stop code in two layers), others do not.
  // A pair of sources whose identifiers agree on enough linked pairs uses a disagreement as evidence.
  const codeStats = new Map<string, { same: number; different: number }>();
  const pairOf = (edge: Edge): string => {
    const pa = points.get(edge.a);
    const pb = points.get(edge.b);
    if (!pa || !pb) throw new Error(`edge names a record that is not loaded: ${edge.a} ${edge.b}`);
    return [pa.sourceId, pb.sourceId].sort().join("\u0000");
  };
  for (const edge of edges) {
    if (edge.evidence.code === "unknown" || edge.evidence.decision === "none") continue;
    const key = pairOf(edge);
    const stats = codeStats.get(key) ?? { same: 0, different: 0 };
    if (edge.evidence.code === "same") stats.same += 1;
    else stats.different += 1;
    codeStats.set(key, stats);
  }
  const comparable = (edge: Edge): boolean => {
    const stats = codeStats.get(pairOf(edge));
    return !!stats && stats.same >= params.codeComparableMin && stats.same / (stats.same + stats.different) >= params.codeComparableShare;
  };
  const matches = edges.filter((edge) => edge.evidence.decision === "match");
  for (const edge of matches) {
    if (edge.evidence.code === "different" && comparable(edge)) demoted.set(edge, "identifiers differ for two sources that usually share them");
  }
  for (const edge of edges) {
    if (edge.evidence.decision === "possible") possible.push({ ...edge, why: edge.evidence.reason });
  }
  // Ambiguity and mutual best: per record and other source, the best match must stand out.
  const byRecordSource = new Map<string, Edge[]>();
  for (const edge of matches) {
    if (demoted.has(edge)) continue;
    const pa = points.get(edge.a);
    const pb = points.get(edge.b);
    if (!pa || !pb) throw new Error(`edge names a record that is not loaded: ${edge.a} ${edge.b}`);
    for (const [self, other] of [[pa, pb], [pb, pa]] as const) {
      const key = `${self.key}\u0000${other.sourceId}`;
      const list = byRecordSource.get(key);
      if (list) list.push(edge);
      else byRecordSource.set(key, [edge]);
    }
  }
  for (const [key, list] of [...byRecordSource.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (list.length < 2) continue;
    list.sort(compareEdges);
    const [best, second] = list;
    if (!best || !second) continue;
    const source = key.split("\u0000")[1];
    if (best.evidence.score - second.evidence.score < params.ambiguityMargin) {
      for (const edge of list) if (!demoted.has(edge)) demoted.set(edge, `ambiguous: two or more records from ${source} match with close scores`);
    } else {
      for (const edge of list.slice(1)) if (!demoted.has(edge)) demoted.set(edge, `not the best match: another record from ${source} matches better`);
    }
  }
  const usable = matches.filter((edge) => !demoted.has(edge)).sort(compareEdges);
  for (const [edge, why] of demoted) possible.push({ ...edge, why });
  // Greedy merge, strongest first.
  const parent = new Map<string, string>();
  const groups = new Map<string, { members: string[]; sources: Set<string>; edges: Edge[] }>();
  const find = (key: string): string => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    let node = key;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const groupOf = (key: string) => {
    const root = find(key);
    let group = groups.get(root);
    if (!group) {
      const point = points.get(key)!;
      parent.set(key, key);
      group = { members: [key], sources: new Set([point.sourceId]), edges: [] };
      groups.set(key, group);
    }
    return { root, group };
  };
  for (const edge of usable) {
    const left = groupOf(edge.a);
    const right = groupOf(edge.b);
    if (left.root === right.root) {
      left.group.edges.push(edge);
      continue;
    }
    let why: string | null = null;
    for (const source of right.group.sources) if (left.group.sources.has(source)) why = `would put two records from ${source} in one place`;
    if (!why) {
      outer: for (const x of left.group.members) {
        for (const y of right.group.members) {
          const evidence = scorePair(points.get(x)!, points.get(y)!, params);
          if (evidence.decision === "none" || evidence.address === "different_number" || evidence.address === "different_street") {
            why = `would join records that do not match each other (${x} and ${y}: ${evidence.reason})`;
            break outer;
          }
        }
      }
    }
    if (why) {
      possible.push({ ...edge, why });
      continue;
    }
    const [keep, drop] = left.root < right.root ? [left, right] : [right, left];
    parent.set(drop.root, keep.root);
    keep.group.members.push(...drop.group.members);
    for (const source of drop.group.sources) keep.group.sources.add(source);
    keep.group.edges.push(...drop.group.edges, edge);
    groups.delete(drop.root);
  }
  const clusters: Cluster[] = [...groups.values()]
    .filter((group) => group.members.length > 1)
    .map((group) => {
      const members = [...group.members].sort();
      return { id: members[0]!, members, edges: [...group.edges].sort(compareEdges) };
    })
    .sort((x, y) => (x.id < y.id ? -1 : 1));
  possible.sort((x, y) => (x.a !== y.a ? (x.a < y.a ? -1 : 1) : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
  return { clusters, possible };
}

/** In-memory matcher over a list of records (tests and small inputs). Same code path as the streaming run. */
export function matchRecords(records: readonly unknown[], params: MatchParams = DEFAULT_PARAMS): ClusterResult & { points: Map<string, PlacePoint> } {
  const points = new Map<string, PlacePoint>();
  const byCell = new Map<string, PlacePoint[]>();
  for (const record of records) {
    const point = toPlacePoint(record);
    if (!point) continue;
    if (points.has(point.key)) throw new Error(`duplicate record ${point.key}`);
    points.set(point.key, point);
    const list = byCell.get(point.cell);
    if (list) list.push(point);
    else byCell.set(point.cell, [point]);
  }
  const density = new DensityIndex();
  for (const point of points.values()) density.add(point.lat, point.lon);
  const edges: Edge[] = [];
  for (const cell of [...byCell.keys()].sort()) {
    const own = byCell.get(cell)!;
    const margin = neighbourMargin(cell, byCell);
    edges.push(...cellEdges(own, margin, density, params));
  }
  return { ...clusterEdges(edges, points, params), points };
}

/** Records of the eight neighbouring cells that lie within CELL_MARGIN_DEG of `cell`. */
export function neighbourMargin(cell: string, byCell: ReadonlyMap<string, readonly PlacePoint[]>): PlacePoint[] {
  const out: PlacePoint[] = [];
  const box = cellBox(cell);
  for (const neighbour of neighbourCells(cell)) {
    for (const point of byCell.get(neighbour) ?? []) if (inMargin(point, box)) out.push(point);
  }
  return out;
}

export function cellBox(cell: string): { south: number; west: number; north: number; east: number } {
  const match = /^([ns])(\d{2,3}\.\d)_([ew])(\d{3}\.\d)$/.exec(cell);
  if (!match) throw new Error(`not a cell id: ${cell}`);
  const south = Number(match[2]) * (match[1] === "s" ? -1 : 1);
  const west = Number(match[4]) * (match[3] === "w" ? -1 : 1);
  return { south, west, north: south + 0.5, east: west + 0.5 };
}

export function cellId(south: number, west: number): string {
  const ns = south < 0 ? "s" : "n";
  const ew = west < 0 ? "w" : "e";
  const lat = Math.abs(south).toFixed(1).padStart(4, "0");
  const lon = Math.abs(west).toFixed(1).padStart(5, "0");
  return `${ns}${lat}_${ew}${lon}`;
}

export function neighbourCells(cell: string): string[] {
  const box = cellBox(cell);
  const out: string[] = [];
  for (const dy of [-0.5, 0, 0.5]) {
    for (const dx of [-0.5, 0, 0.5]) {
      if (dy === 0 && dx === 0) continue;
      out.push(cellId(box.south + dy, box.west + dx));
    }
  }
  return out.sort();
}

export function inMargin(point: { lat: number; lon: number }, box: { south: number; west: number; north: number; east: number }): boolean {
  return (
    point.lat >= box.south - CELL_MARGIN_DEG && point.lat <= box.north + CELL_MARGIN_DEG &&
    point.lon >= box.west - CELL_MARGIN_DEG && point.lon <= box.east + CELL_MARGIN_DEG
  );
}
