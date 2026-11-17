/**
 * Point-in-polygon test against a published boundary polygon (GeoJSON Polygon
 * or MultiPolygon in WGS84 degrees). Even-odd rule: a point is inside when a
 * ray to the east crosses the rings an odd number of times, so holes are
 * handled. Edges are bucketed by latitude band so each test only looks at
 * the edges near the point's latitude.
 */

type Ring = number[][];

export interface BoundaryGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

export class Boundary {
  private readonly x1: Float64Array;
  private readonly y1: Float64Array;
  private readonly x2: Float64Array;
  private readonly y2: Float64Array;
  private readonly bands = new Map<number, number[]>();
  readonly edges: number;

  constructor(geometry: BoundaryGeometry, private readonly bandDegrees = 0.02) {
    const rings: Ring[] = geometry.type === "Polygon"
      ? (geometry.coordinates as Ring[])
      : (geometry.coordinates as Ring[][]).flat();
    if (rings.length === 0) throw new Error("boundary has no rings");
    const edges: Array<[number, number, number, number]> = [];
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const a = ring[i] as number[];
        const b = ring[i + 1] as number[];
        const [ax, ay, bx, by] = [Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1])];
        if (![ax, ay, bx, by].every(Number.isFinite)) throw new Error("boundary has a non-numeric vertex");
        edges.push([ax, ay, bx, by]);
      }
    }
    this.edges = edges.length;
    this.x1 = new Float64Array(edges.map((e) => e[0]));
    this.y1 = new Float64Array(edges.map((e) => e[1]));
    this.x2 = new Float64Array(edges.map((e) => e[2]));
    this.y2 = new Float64Array(edges.map((e) => e[3]));
    edges.forEach(([, ay, , by], index) => {
      const low = Math.floor(Math.min(ay, by) / bandDegrees);
      const high = Math.floor(Math.max(ay, by) / bandDegrees);
      for (let band = low; band <= high; band += 1) {
        const list = this.bands.get(band) ?? [];
        list.push(index);
        this.bands.set(band, list);
      }
    });
  }

  contains(lon: number, lat: number): boolean {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    const candidates = this.bands.get(Math.floor(lat / this.bandDegrees));
    if (!candidates) return false;
    let inside = false;
    for (const i of candidates) {
      const ay = this.y1[i] as number;
      const by = this.y2[i] as number;
      if ((ay > lat) === (by > lat)) continue;
      const ax = this.x1[i] as number;
      const bx = this.x2[i] as number;
      const crossX = ax + ((lat - ay) * (bx - ax)) / (by - ay);
      if (lon < crossX) inside = !inside;
    }
    return inside;
  }
}

/** Reads the first feature of a GeoJSON FeatureCollection (or a bare geometry) as a boundary. */
export function boundaryFromGeoJson(text: string): Boundary {
  const parsed = JSON.parse(text) as { type?: string; features?: Array<{ geometry?: BoundaryGeometry }>; coordinates?: unknown };
  const geometry = parsed.type === "FeatureCollection" ? parsed.features?.[0]?.geometry : (parsed as unknown as BoundaryGeometry);
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    throw new Error("boundary file has no Polygon or MultiPolygon geometry");
  }
  return new Boundary(geometry);
}
