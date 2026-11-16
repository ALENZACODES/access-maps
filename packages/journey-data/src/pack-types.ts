/** Contract owner: @access-main/data-client (I3). Keep this local copy aligned until published. */
export type Tranche = "venue" | "washroom" | "transit" | "path";
export type FieldValue = {
  value: string | number | Array<[number, number]>;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: 0 | 1 | 2 | 3 | 4;
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
};
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
  attribution?: string;
  retrieved?: string;
  inWebPack?: boolean;
  heldReason?: string | null;
}
export interface PackManifest {
  version: number;
  regions: Array<{
    id: string;
    label: { en: string; fr: string };
    bbox: [number, number, number, number];
    cells: string[];
  }>;
  sources: PackSourceEntry[];
}
export interface RegionStatus {
  id: string;
  downloaded?: boolean;
  status?: string;
  state?: string;
}
export interface SearchHit { id: string; tranche: Tranche; name: string | null; lat: number; lon: number }
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
