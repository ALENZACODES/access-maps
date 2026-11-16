import type { BBox, PackRegion } from "./regions.js";

export interface PackPart {
  path: string;
  bytes: number;
  sha256: string;
  count: number;
  sourceId: string;
}

export interface PackManifest {
  version: 1;
  builtAt: string;
  sourceCommit: string;
  sources: Array<{
    sourceId: string;
    name: string;
    licence: string;
    licenceUrl: string;
    attribution: string;
    retrieved: string;
    shareAlike: boolean;
    inWebPack: boolean;
    heldReason: string | null;
  }>;
  regions: PackRegion[];
  tranches: Record<string, { cells: Record<string, { bbox: BBox; parts: PackPart[] }> }>;
  search: Record<string, Omit<PackPart, "sourceId">>;
  tiles: Record<string, { path: string; bytes: number; licence: string }>;
  counts: { records: number; byTranche: Record<string, number>; bySource: Record<string, number> };
  /** Partitions left out of this build, with the reason. The app shows these places as unavailable. */
  withheld?: Array<{ path: string; sourceId: string | null; tranche: string | null; cell: string | null; reason: string }>;
}
