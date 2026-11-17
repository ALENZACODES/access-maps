/**
 * Labelled test fixtures for the same-place matcher. These records are
 * invented for tests (source ids start with "fixture-"); they are not data.
 */
import { regionId } from "../../src/model/records.js";

export interface FixtureOptions {
  source: string;
  tranche?: "venue" | "washroom" | "transit";
  id: string;
  lat: number;
  lon: number;
  name?: string;
  category?: string;
  group?: string;
  housenumber?: string;
  street?: string;
  stopCode?: string;
  ref?: string;
  wheelchair?: string;
}

const field = (value: string | number, source: string) => ({
  value,
  source_id: source,
  licence: "fixture-licence",
  retrieved_at: "2026-11-16",
  tier: 0,
});

export function fixture(options: FixtureOptions) {
  const tranche = options.tranche ?? "venue";
  const s = options.source;
  const fields: Record<string, ReturnType<typeof field>> = {
    name: field(options.name ?? "UNKNOWN", s),
    lat: field(options.lat, s),
    lon: field(options.lon, s),
  };
  if (tranche === "venue") {
    fields.category = field(options.category ?? "UNKNOWN", s);
    fields.category_group = field(options.group ?? "UNKNOWN", s);
    fields.addr_housenumber = field(options.housenumber ?? "UNKNOWN", s);
    fields.addr_street = field(options.street ?? "UNKNOWN", s);
    fields.ref = field(options.ref ?? "UNKNOWN", s);
  }
  if (tranche === "transit") fields.stop_code = field(options.stopCode ?? "UNKNOWN", s);
  if (tranche === "transit") fields.wheelchair_boarding = field(options.wheelchair ?? "UNKNOWN", s);
  else fields.wheelchair = field(options.wheelchair ?? "UNKNOWN", s);
  return { id: `${s}:${options.id}`, tranche, region: regionId(options.lat, options.lon), fields };
}

/** Deterministic pseudo-random numbers (mulberry32). */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Metres to degrees of latitude / longitude near a latitude. */
export const metresLat = (m: number) => m / 111_000;
export const metresLon = (m: number, lat: number) => m / (111_320 * Math.cos((lat * Math.PI) / 180));
