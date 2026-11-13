import { readFileSync } from "node:fs";
import path from "node:path";
import type { Tier } from "./model/provenance.js";

export interface SourceEntry {
  id: string;
  name: string;
  kind: "osm" | "gtfs" | "municipal";
  url: string;
  download_url: string;
  licence_name: string;
  licence_url: string;
  licence_id: string;
  attribution: string;
  retrieved_at: string;
  tier: Tier;
  tier_note?: string;
  notes?: string;
}

export interface SourceRegistry {
  sources: SourceEntry[];
}

export function readRegistry(repoRoot: string): SourceRegistry {
  const file = path.join(repoRoot, "sources", "registry.json");
  return JSON.parse(readFileSync(file, "utf8")) as SourceRegistry;
}

export function requireSource(registry: SourceRegistry, id: string): SourceEntry {
  const source = registry.sources.find((entry) => entry.id === id);
  if (!source) throw new Error(`source ${id} is not in sources/registry.json`);
  return source;
}
