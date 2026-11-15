/**
 * Contract-owned types: @access-main/data-client (I3), version 1.2.0.
 * This is a structural copy for packages that cannot import the client.
 * It is deliberately not a second implementation of the data client.
 */
export type Tranche = "venue" | "washroom" | "transit" | "path";
export type Tier = 0 | 1 | 2 | 3 | 4;

export interface FieldValue {
  value: string | number | boolean | Array<[number, number]> | null;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: Tier;
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
}

export interface PackRecord {
  id: string;
  tranche: Tranche;
  region: string;
  fields: Record<string, FieldValue | undefined>;
}

export interface PackSourceEntry {
  sourceId: string;
  name: string;
  licence: string;
  licenceUrl?: string;
  attribution: string;
  retrieved: string;
  shareAlike?: boolean;
  inWebPack: boolean;
  heldReason?: string | null;
  url?: string;
}

export interface PackManifest {
  version: number;
  builtAt: string;
  sourceCommit: string;
  sources: PackSourceEntry[];
  regions: Array<{ id: string; label: { en: string; fr: string }; bbox: [number, number, number, number]; cells: string[] }>;
  tranches: Record<string, unknown>;
  search: Record<string, unknown>;
  tiles: Record<string, unknown>;
  counts: Record<string, unknown>;
}

export interface SearchHit {
  id: string;
  tranche: Tranche;
  name: string | null;
  nameNorm?: string;
  lat?: number | null;
  lon?: number | null;
}

export interface RegionStatus {
  id: string;
  [key: string]: unknown;
}

export interface PackSource {
  manifest(): Promise<PackManifest>;
  cellsFor(area: { bbox: [number, number, number, number] } | { lat: number; lon: number; radiusM: number }): Promise<string[]>;
  records(tranche: Tranche, cell: string, signal?: AbortSignal): AsyncIterable<PackRecord>;
  search(text: string, opts: { near?: { lat: number; lon: number }; tranches?: Tranche[]; limit?: number }): Promise<SearchHit[]>;
  get(id: string): Promise<PackRecord | null>;
  sourcesFor(record: PackRecord): PackSourceEntry[];
  regions(): Promise<RegionStatus[]>;
  downloadRegion(id: string, onProgress?: (done: number, total: number) => void): Promise<RegionStatus>;
  deleteRegion(id: string): Promise<void>;
}

export interface PlaceDetail {
  id: string;
  name: string;
  record: PackRecord;
  sources: PackSourceEntry[];
}
