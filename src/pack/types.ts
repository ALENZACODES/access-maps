import type { BBox, PackRegion } from "./regions.js";
import type { PackLinksEntry } from "./links.js";

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
  /**
   * Overlay files, keyed by family ("open", "odbl") or, when a family is split
   * to stay under the file limit, by family and band ("odbl/n43",
   * "odbl/n43-w080"). bbox is [west, south, east, north] from the file header.
   */
  tiles: Record<string, { path: string; bytes: number; sha256: string; licence: string; bbox: BBox }>;
  counts: { records: number; byTranche: Record<string, number>; bySource: Record<string, number> };
  /**
   * Same-place links: per cell, the clusters of records from different sources that are one real
   * place, and possible duplicates that were not merged. Absent when there are no trustworthy links.
   */
  links?: PackLinksEntry;
  /** Partitions left out of this build, with the reason. The app shows these places as unavailable. */
  withheld?: Array<{ path: string; sourceId: string | null; tranche: string | null; cell: string | null; reason: string }>;
}
