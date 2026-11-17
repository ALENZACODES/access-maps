import { describe, expect, it } from "vitest";
import { classCompatibility, fineConflict, kindsConflict, nameKinds, placeClass } from "../../src/places/category.js";
import {
  cellEdges,
  DensityIndex,
  distanceM,
  matchRecords,
  neighbourCells,
  scorePair,
  toPlacePoint,
  type PlacePoint,
} from "../../src/places/match.js";
import { compareAddress, compareNames, nameTokens, splitAddress, stopNameConflict } from "../../src/places/normalize.js";
import { fixture, metresLat, metresLon, rng, shuffle } from "./helpers.js";

const LAT = 43.7;
const LON = -79.4;

function point(record: ReturnType<typeof fixture>): PlacePoint {
  const result = toPlacePoint(record);
  if (!result) throw new Error("fixture is not a place");
  return result;
}

describe("name normalisation", () => {
  it("ignores case, accents, punctuation, apostrophes and common suffixes", () => {
    expect(nameTokens("Café St-Jean Ltd.")).toEqual(nameTokens("CAFE SAINT JEAN"));
    expect(nameTokens("Tim Horton's")).toEqual(["tim", "hortons"]);
    expect(compareNames(nameTokens("Example Bakery Inc."), nameTokens("example bakery")).score).toBe(1);
  });

  it("reads English and French forms of the same name", () => {
    expect(compareNames(nameTokens("Parc Exemple"), nameTokens("Exemple Park")).score).toBe(1);
    expect(compareNames(nameTokens("Bibliothèque Exemple"), nameTokens("Exemple Library")).score).toBe(1);
    expect(compareNames(nameTokens("Centre communautaire Exemple"), nameTokens("Exemple Community Centre")).score).toBe(1);
  });

  it("does not call two parks similar because both say park", () => {
    expect(compareNames(nameTokens("Sentinel Park"), nameTokens("Riverdale Park")).score).toBeLessThan(0.4);
  });

  it("keeps a containing name close and a shared single word apart", () => {
    expect(compareNames(nameTokens("Sentinel Park"), nameTokens("Sentinel Park Washroom")).score).toBeGreaterThanOrEqual(0.85);
    expect(compareNames(nameTokens("Toronto Harbour Water Taxi"), nameTokens("Toronto Waterfront Park")).score).toBeLessThan(0.6);
  });

  it("reads street abbreviations", () => {
    expect(nameTokens("Main Street East")).toEqual(nameTokens("Main St. E"));
    expect(splitAddress("5 Example Rd, Toronto")).toEqual({ housenumber: ["5"], street: ["example", "rd"] });
    expect(compareAddress({ housenumber: ["12"], street: ["main", "st"] }, { housenumber: ["14"], street: ["main", "st"] })).toBe("different_number");
    expect(compareAddress({ housenumber: ["12"], street: ["main", "st"] }, { housenumber: ["12", "14"], street: ["main", "street"] })).toBe("same");
  });

  it("tells stops apart by side, street order, direction and platform", () => {
    expect(stopNameConflict("Aberdeen at Cottage", "Aberdeen opposite Cottage")).toBe("different");
    expect(stopNameConflict("Mohawk at Upper Kenilworth", "Upper Kenilworth at Mohawk")).toBe("different");
    expect(stopNameConflict("Plymouth at Tourangeau", "Plymouth / Tourangeau")).toBe("none");
    expect(stopNameConflict("Terminal Platform 5", "Terminal Platform 6")).toBe("different");
    expect(stopNameConflict("Example Station", "Example Station - Southbound")).toBe("platform_one_side");
    expect(stopNameConflict("Main Northbound @ King", "Main Southbound @ King")).toBe("different");
  });
});

describe("classes", () => {
  it("reads classes from different taxonomies", () => {
    expect(placeClass("venue", ["parking_space", "amenity"])).toBe("parking");
    expect(placeClass("venue", ["Benches", "park_feature"])).toBe("street_furniture");
    expect(placeClass("venue", ["Park", "park_or_recreation_facility"])).toBe("park");
    expect(placeClass("venue", ["Active Recreation", "park"])).toBe("park");
    expect(placeClass("washroom", ["anything"])).toBe("washroom");
    expect(placeClass("venue", ["something new", "unheard of"])).toBe("unknown");
  });

  it("never links a point feature to an unknown category", () => {
    expect(classCompatibility("crossing", "unknown")).toBe(0);
    expect(classCompatibility("food", "unknown")).toBe(0.5);
    expect(classCompatibility("community", "sport_venue")).toBe(0.6);
    expect(classCompatibility("park", "playground")).toBe(0);
  });

  it("reads the kind a name states", () => {
    expect(nameKinds("Bedford Park Community Centre")).toEqual(["community"]);
    expect(nameKinds("Riverdale Park")).toEqual(["park"]);
    expect(nameKinds("Cornell Community Centre and Library")).toEqual(["community", "library"]);
    expect(nameKinds("Parc des Pionniers")).toEqual(["park"]);
    expect(kindsConflict(nameKinds("Example Curling Club"), nameKinds("Example Community Centre"))).toBe(true);
    expect(kindsConflict(nameKinds("Example Community Arena"), nameKinds("Example Arena"))).toBe(false);
    expect(kindsConflict(nameKinds("Example Lounge"), nameKinds("Example Community Centre"))).toBe(false);
    expect(fineConflict("bench", "picnic_table")).toBe(true);
    expect(fineConflict("parking", "parking_space")).toBe(true);
    expect(fineConflict("playground", "splash_pad")).toBe(false);
  });
});

describe("pair scoring", () => {
  const park = (source: string, id: string, metres: number, name = "Example Park", extra: Record<string, string> = {}) =>
    point(fixture({ source, id, lat: LAT + metresLat(metres), lon: LON, name, category: "park", ...extra }));

  it("matches the same named park from two sources", () => {
    const evidence = scorePair(park("fixture-a", "1", 0), park("fixture-b", "1", 40, "EXAMPLE PARK"));
    expect(evidence.decision).toBe("match");
    expect(evidence.distance_m).toBeCloseTo(40, 0);
  });

  it("never links two records of one source", () => {
    expect(scorePair(park("fixture-a", "1", 0), park("fixture-a", "2", 0)).decision).toBe("none");
  });

  it("does not link records farther apart than the radius", () => {
    expect(scorePair(park("fixture-a", "1", 0), park("fixture-b", "1", 400)).decision).toBe("none");
  });

  it("keeps a park and its community centre apart", () => {
    const centre = point(fixture({ source: "fixture-b", id: "c", lat: LAT, lon: LON, name: "Example Park Community Centre", category: "community_centre" }));
    expect(scorePair(park("fixture-a", "1", 0), centre).decision).toBe("none");
  });

  it("lists a pair with the same name but different house numbers as possible, not a match", () => {
    const a = park("fixture-a", "1", 0, "Example Hall", { housenumber: "10", street: "Main St", category: "community_centre" });
    const b = park("fixture-b", "1", 10, "Example Hall", { housenumber: "90", street: "Main Street", category: "community_centre" });
    const evidence = scorePair(a, b);
    expect(evidence.address).toBe("different_number");
    expect(evidence.decision).toBe("possible");
  });

  it("uses a shared identifier when names are missing", () => {
    const a = point(fixture({ source: "fixture-a", id: "1", lat: LAT, lon: LON, category: "parking", ref: "25115" }));
    const b = point(fixture({ source: "fixture-b", id: "1", lat: LAT + metresLat(30), lon: LON, name: "Example Park", category: "parking lot", ref: "25115" }));
    expect(scorePair(a, b).decision).toBe("match");
  });

  it("matches two unnamed benches at the same spot and not a bench and a table", () => {
    const bench = (source: string, metres: number, category = "bench") =>
      point(fixture({ source, id: `${metres}`, lat: LAT + metresLat(metres), lon: LON, category }));
    expect(scorePair(bench("fixture-a", 0), bench("fixture-b", 1, "Benches")).decision).toBe("match");
    expect(scorePair(bench("fixture-a", 0), bench("fixture-b", 1, "picnic_table")).decision).toBe("none");
    expect(scorePair(bench("fixture-a", 0), bench("fixture-b", 30, "Benches")).decision).toBe("none");
  });

  it("does not match opposite-side stops", () => {
    const stop = (source: string, name: string, metres: number) =>
      point(fixture({ source, id: name, tranche: "transit", lat: LAT + metresLat(metres), lon: LON, name }));
    expect(scorePair(stop("fixture-a", "Aberdeen at Cottage", 0), stop("fixture-b", "ABERDEEN AT COTTAGE", 1)).decision).toBe("match");
    expect(scorePair(stop("fixture-a", "Aberdeen at Cottage", 0), stop("fixture-b", "Aberdeen opposite Cottage", 1)).decision).toBe("none");
    expect(scorePair(stop("fixture-a", "Aberdeen at Cottage", 0), stop("fixture-b", "Aberdeen at Cottage", 60)).decision).toBe("none");
  });
});

describe("clusters", () => {
  it("joins three sources into one cluster and records the evidence", () => {
    const records = [
      fixture({ source: "fixture-a", id: "1", lat: LAT, lon: LON, name: "Example Library", category: "library" }),
      fixture({ source: "fixture-b", id: "1", lat: LAT + metresLat(10), lon: LON, name: "EXAMPLE LIBRARY", category: "library" }),
      fixture({ source: "fixture-c", id: "1", lat: LAT + metresLat(20), lon: LON, name: "Bibliothèque Example", category: "library" }),
    ];
    const result = matchRecords(records);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.members).toHaveLength(3);
    expect(result.clusters[0]!.edges.length).toBeGreaterThanOrEqual(2);
    expect(result.clusters[0]!.id).toBe(result.clusters[0]!.members[0]);
  });

  it("does not merge when a record matches two records of one other source equally (ambiguous)", () => {
    const records = [
      fixture({ source: "fixture-a", id: "1", lat: LAT, lon: LON, name: "Example Cafe", category: "cafe" }),
      fixture({ source: "fixture-b", id: "1", lat: LAT + metresLat(10), lon: LON, name: "Example Cafe", category: "cafe" }),
      fixture({ source: "fixture-b", id: "2", lat: LAT - metresLat(10), lon: LON, name: "Example Cafe", category: "cafe" }),
    ];
    const result = matchRecords(records);
    expect(result.clusters).toHaveLength(0);
    expect(result.possible.length).toBeGreaterThanOrEqual(2);
    expect(result.possible.every((item) => item.why.startsWith("ambiguous"))).toBe(true);
  });

  it("does not chain two records that do not match each other", () => {
    // A matches B and B matches C, but A and C give different house numbers on one street.
    const records = [
      fixture({ source: "fixture-a", id: "1", lat: LAT, lon: LON, name: "Example Grocery", category: "supermarket", housenumber: "10", street: "Main St" }),
      fixture({ source: "fixture-b", id: "1", lat: LAT + metresLat(10), lon: LON, name: "Example Grocery", category: "supermarket" }),
      fixture({ source: "fixture-c", id: "1", lat: LAT + metresLat(20), lon: LON, name: "Example Grocery", category: "supermarket", housenumber: "20", street: "Main Street" }),
    ];
    const result = matchRecords(records);
    expect(result.clusters).toHaveLength(1);
    for (const cluster of result.clusters) {
      expect(cluster.members.some((key) => key.includes("fixture-a")) && cluster.members.some((key) => key.includes("fixture-c"))).toBe(false);
    }
    expect(result.possible.some((item) => item.why.startsWith("would join records") || item.why.includes("addresses differ"))).toBe(true);
  });

  it("links records on both sides of a cell edge exactly once", () => {
    // 43.5 is a cell edge: the two records sit in different 0.5-degree cells.
    const records = [
      fixture({ source: "fixture-a", id: "1", lat: 43.5 - metresLat(5), lon: LON, name: "Example Arena", category: "arena" }),
      fixture({ source: "fixture-b", id: "1", lat: 43.5 + metresLat(5), lon: LON, name: "Example Arena", category: "arena" }),
    ];
    expect(records[0]!.region).not.toBe(records[1]!.region);
    const result = matchRecords(records);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.edges).toHaveLength(1);
  });

  it("does not change the input records", () => {
    const records = [
      fixture({ source: "fixture-a", id: "1", lat: LAT, lon: LON, name: "Example Park", category: "park" }),
      fixture({ source: "fixture-b", id: "1", lat: LAT, lon: LON, name: "Example Park", category: "park" }),
    ];
    const before = JSON.stringify(records);
    matchRecords(records.map((record) => Object.freeze(record)));
    expect(JSON.stringify(records)).toBe(before);
  });

  it("lists the eight neighbours of a cell", () => {
    expect(neighbourCells("n43.5_w079.5")).toEqual([
      "n43.0_w079.0", "n43.0_w079.5", "n43.0_w080.0", "n43.5_w079.0", "n43.5_w080.0", "n44.0_w079.0", "n44.0_w079.5", "n44.0_w080.0",
    ]);
  });
});

describe("properties (seeded)", () => {
  const NAMES = ["Example Park", "Sample Cafe", "Test Library", "Demo Arena", "Trial Pharmacy", "Mock Community Centre"];
  const CATEGORIES = ["park", "cafe", "library", "arena", "pharmacy", "community_centre", "bench", "parking"];

  function randomRecords(seed: number, count: number) {
    const random = rng(seed);
    const records = [];
    for (let index = 0; index < count; index += 1) {
      const lat = 43.49 + random() * 0.02; // straddles the 43.5 cell edge
      const lon = -79.41 + random() * 0.02;
      const named = random() < 0.8;
      records.push(fixture({
        source: `fixture-${"abc"[Math.floor(random() * 3)]}`,
        id: String(index),
        lat,
        lon,
        name: named ? NAMES[Math.floor(random() * NAMES.length)] : undefined,
        category: CATEGORIES[Math.floor(random() * CATEGORIES.length)],
        housenumber: random() < 0.3 ? String(1 + Math.floor(random() * 3)) : undefined,
        street: "Example Street",
      }));
    }
    return records;
  }

  it("scores pairs symmetrically", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const points = randomRecords(seed, 12).map(point);
      for (const a of points) for (const b of points) {
        if (a === b) continue;
        const ab = scorePair(a, b);
        const ba = scorePair(b, a);
        expect([ab.decision, ab.score, ab.address, ab.code]).toEqual([ba.decision, ba.score, ba.address, ba.code]);
      }
    }
  });

  it("gives the same clusters for any input order", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const records = randomRecords(seed, 60);
      const first = matchRecords(records);
      const second = matchRecords(shuffle(records, rng(seed + 1000)));
      expect(second.clusters).toEqual(first.clusters);
      expect(second.possible).toEqual(first.possible);
    }
  });

  it("never puts two records of one source in a cluster, and every cluster edge is within its radius", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const result = matchRecords(randomRecords(seed, 80));
      for (const cluster of result.clusters) {
        const sources = cluster.members.map((key) => result.points.get(key)!.sourceId);
        expect(new Set(sources).size).toBe(sources.length);
        for (const edge of cluster.edges) expect(edge.evidence.distance_m).toBeLessThanOrEqual(edge.evidence.radius_m);
        // Every pair inside a cluster is at least a possible duplicate.
        for (const x of cluster.members) for (const y of cluster.members) {
          if (x < y) expect(scorePair(result.points.get(x)!, result.points.get(y)!).decision).not.toBe("none");
        }
      }
    }
  });

  it("finds each pair once whether it is inside a cell or across cells", () => {
    for (let seed = 1; seed <= 15; seed += 1) {
      const points = randomRecords(seed, 50).map(point);
      const density = new DensityIndex();
      for (const p of points) density.add(p.lat, p.lon);
      const cells = new Map<string, PlacePoint[]>();
      for (const p of points) cells.set(p.cell, [...(cells.get(p.cell) ?? []), p]);
      const seen = new Set<string>();
      for (const [cell, own] of cells) {
        const margin = points.filter((p) => p.cell !== cell);
        for (const edge of cellEdges(own, margin, density, undefined, () => true)) {
          const key = `${edge.a}|${edge.b}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      // Every cross-source pair within 100 m was evaluated.
      for (const a of points) for (const b of points) {
        if (a.key < b.key && a.sourceId !== b.sourceId && distanceM(a, b) <= 100) expect(seen.has(`${a.key}|${b.key}`)).toBe(true);
      }
    }
  });
});

void metresLon;
