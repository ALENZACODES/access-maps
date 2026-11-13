import { coordKey, formatMetres, haversineMetres, type Coord } from "./geo.js";
import { combineAssessments, unknownAssessment } from "./stepfree.js";
import type { StepFreeAssessment } from "./types.js";

export interface PreparedSegment {
  id: string;
  fromKey: string;
  toKey: string;
  from: Coord;
  to: Coord;
  lengthMetres: number;
  assessment: StepFreeAssessment;
  surface: string;
  gradient: string;
  provenanceNote: string;
}

export interface RouterRequest {
  from: Coord;
  to: Coord;
  /** When true, a barrier path is still returned so the closure stays visible. */
  reportBarriers: boolean;
}

export interface RouterResult {
  kind: "route" | "straight-line" | "none";
  distanceMetres: number | null;
  geometry: Coord[] | null;
  segmentIds: string[];
  assessment: StepFreeAssessment;
  surface: string;
  gradient: string;
  engine: string;
  note: string;
}

export interface RouterAdapter {
  readonly id: string;
  route(request: RouterRequest): RouterResult;
}

const REJECTED = new Set([
  "opentripplanner",
  "openrouteservice",
  "otp",
  "ors",
  "open-route-service",
]);

export function assertEngineAllowed(engine: string): void {
  const normalised = engine.trim().toLowerCase();
  if (REJECTED.has(normalised)) {
    throw new Error(
      `${engine} is not an allowed routing engine. Use a self-hosted Valhalla, OSRM, or GraphHopper service. Do not vendor OpenTripPlanner or OpenRouteService.`,
    );
  }
}

export class StraightLineRouter implements RouterAdapter {
  readonly id = "straight-line";

  route(request: RouterRequest): RouterResult {
    const metres = haversineMetres(request.from, request.to);
    return {
      kind: "straight-line",
      distanceMetres: metres,
      geometry: [request.from, request.to],
      segmentIds: [],
      assessment: unknownAssessment("straight-line-only"),
      surface: "UNKNOWN",
      gradient: "UNKNOWN",
      engine: this.id,
      note: `straight-line ${formatMetres(metres)}`,
    };
  }
}

export class GraphRouter implements RouterAdapter {
  readonly id = "graph";

  constructor(private readonly segments: PreparedSegment[]) {}

  route(request: RouterRequest): RouterResult {
    const avoided = this.search(request, true);
    if (avoided) return avoided;
    if (request.reportBarriers) {
      const withBarriers = this.search(request, false);
      if (withBarriers) return withBarriers;
    }
    return new StraightLineRouter().route(request);
  }

  private search(request: RouterRequest, avoidBarriers: boolean): RouterResult | null {
    const usable = avoidBarriers
      ? this.segments.filter((segment) => segment.assessment.status !== "not-step-free")
      : this.segments;
    if (usable.length === 0) return null;

    const nodes = new Map<string, Coord>();
    for (const segment of usable) {
      nodes.set(segment.fromKey, segment.from);
      nodes.set(segment.toKey, segment.to);
    }

    let startKey: string | null = null;
    let endKey: string | null = null;
    let startDistance = Infinity;
    let endDistance = Infinity;
    for (const [key, coord] of nodes) {
      const fromDistance = haversineMetres(request.from, coord);
      const toDistance = haversineMetres(request.to, coord);
      if (fromDistance < startDistance) {
        startDistance = fromDistance;
        startKey = key;
      }
      if (toDistance < endDistance) {
        endDistance = toDistance;
        endKey = key;
      }
    }
    if (!startKey || !endKey) return null;
    if (startDistance > 80 || endDistance > 80) return null;
    if (startKey === endKey) {
      return {
        kind: "route",
        distanceMetres: 0,
        geometry: [request.from, request.to],
        segmentIds: [],
        assessment: unknownAssessment("no-evidence"),
        surface: "UNKNOWN",
        gradient: "UNKNOWN",
        engine: this.id,
        note: "endpoints snap to one node",
      };
    }

    const adjacency = new Map<string, Array<{ to: string; segment: PreparedSegment }>>();
    for (const segment of usable) {
      const forward = adjacency.get(segment.fromKey) ?? [];
      forward.push({ to: segment.toKey, segment });
      adjacency.set(segment.fromKey, forward);
      const back = adjacency.get(segment.toKey) ?? [];
      back.push({
        to: segment.fromKey,
        segment: { ...segment, fromKey: segment.toKey, toKey: segment.fromKey, from: segment.to, to: segment.from },
      });
      adjacency.set(segment.toKey, back);
    }

    const dist = new Map<string, number>([[startKey, 0]]);
    const prev = new Map<string, { key: string; segment: PreparedSegment }>();
    const queue = new Set(nodes.keys());

    while (queue.size > 0) {
      let current: string | null = null;
      let best = Infinity;
      for (const key of queue) {
        const value = dist.get(key) ?? Infinity;
        if (value < best) {
          best = value;
          current = key;
        }
      }
      if (current === null || best === Infinity) break;
      queue.delete(current);
      if (current === endKey) break;
      for (const edge of adjacency.get(current) ?? []) {
        const next = (dist.get(current) ?? Infinity) + edge.segment.lengthMetres;
        if (next < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, next);
          prev.set(edge.to, { key: current, segment: edge.segment });
        }
      }
    }

    if (!prev.has(endKey) && startKey !== endKey) return null;

    const segmentIds: string[] = [];
    const assessments: StepFreeAssessment[] = [];
    const geometry: Coord[] = [];
    let cursor: string | undefined = endKey;
    const surfaces = new Set<string>();
    const gradients = new Set<string>();
    while (cursor && cursor !== startKey) {
      const step = prev.get(cursor);
      if (!step) return null;
      segmentIds.push(step.segment.id);
      assessments.push(step.segment.assessment);
      geometry.push(step.segment.to);
      if (step.segment.surface !== "UNKNOWN") surfaces.add(step.segment.surface);
      if (step.segment.gradient !== "UNKNOWN") gradients.add(step.segment.gradient);
      cursor = step.key;
    }
    geometry.push(nodes.get(startKey) ?? request.from);
    geometry.reverse();
    segmentIds.reverse();

    const assessment = combineAssessments(assessments);
    return {
      kind: "route",
      distanceMetres: dist.get(endKey) ?? null,
      geometry,
      segmentIds,
      assessment,
      surface: surfaces.size > 0 ? [...surfaces].join(", ") : "UNKNOWN",
      gradient: gradients.size > 0 ? [...gradients].join(", ") : "UNKNOWN",
      engine: this.id,
      note: segmentIds.join(","),
    };
  }
}

export interface NormalizedEngineResponse {
  distanceMetres?: number;
  durationSeconds?: number;
  geometry?: Array<[number, number]>;
}

/**
 * Calls a self-hosted Valhalla, OSRM, or GraphHopper HTTP service.
 * The response is not treated as step-free. Stock wheelchair profiles were not verified.
 * OpenTripPlanner and OpenRouteService are rejected by name and are not imported.
 */
export function createHttpRouter(options: {
  engine: "valhalla" | "osrm" | "graphhopper";
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): RouterAdapter {
  assertEngineAllowed(options.engine);
  const base = new URL(options.baseUrl);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("Router base URL must be http or https.");
  }
  return {
    id: options.engine,
    route(request: RouterRequest): RouterResult {
      const fallback = new StraightLineRouter().route(request);
      const fetchImpl = options.fetchImpl;
      if (!fetchImpl) {
        return {
          ...fallback,
          engine: options.engine,
          assessment: unknownAssessment("external-engine-unconfigured"),
          note: "No fetch implementation was provided. Distance is straight-line only.",
        };
      }
      // Synchronous adapter contract: callers that need HTTP pass a pre-resolved payload
      // through `fetchImpl` only from async tests via `routeWithFetch`.
      return {
        ...fallback,
        engine: options.engine,
        assessment: unknownAssessment("external-engine-does-not-prove-step-free"),
        note: "HTTP routing is async. Use routeWithFetch.",
      };
    },
  };
}

export async function routeWithFetch(
  options: {
    engine: "valhalla" | "osrm" | "graphhopper";
    baseUrl: string;
    fetchImpl: typeof fetch;
  },
  request: RouterRequest,
): Promise<RouterResult> {
  assertEngineAllowed(options.engine);
  const base = new URL(options.baseUrl);
  const endpoint = new URL("/access-route", base);
  const response = await options.fetchImpl(endpoint.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      engine: options.engine,
      costing: "pedestrian",
      from: request.from,
      to: request.to,
    }),
  });
  if (!response.ok) {
    const straight = new StraightLineRouter().route(request);
    return {
      ...straight,
      engine: options.engine,
      assessment: unknownAssessment("external-engine-failed"),
      note: `Router HTTP ${response.status}. Distance is straight-line only.`,
    };
  }
  const payload = (await response.json()) as NormalizedEngineResponse;
  const geometry = Array.isArray(payload.geometry)
    ? payload.geometry
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => ({ lon: Number(pair[0]), lat: Number(pair[1]) }))
    : null;
  return {
    kind: geometry && geometry.length >= 2 ? "route" : "straight-line",
    distanceMetres: typeof payload.distanceMetres === "number" ? payload.distanceMetres : null,
    geometry,
    segmentIds: [],
    assessment: unknownAssessment("external-engine-does-not-prove-step-free", [
      `${options.engine}:pedestrian`,
    ]),
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    engine: options.engine,
    note: "External pedestrian geometry is not step-free evidence.",
  };
}

export function segmentNodeKey(coord: Coord): string {
  return coordKey(coord);
}
