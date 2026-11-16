import type { ReleaseEvidence, SourceEvidence, SurfaceEvidence } from "./evidence-contract.js";

export function sampleSource(overrides: Partial<SourceEvidence> = {}): SourceEvidence {
  return {
    id: "osm-one", family: "osm", name: "OpenStreetMap extract",
    sourceUrl: "https://www.openstreetmap.org/copyright",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    licenceName: "Open Database License (ODbL) 1.0",
    licenceEvidence: "YES", redistributionPermission: "YES",
    acquisitionDate: "2026-01-04", datasetDate: "UNKNOWN",
    termsReviewedDate: "2026-01-03", attribution: "© OpenStreetMap contributors",
    notes: "", state: "included", ...overrides,
  };
}

export function sampleSurface(overrides: Partial<SurfaceEvidence> = {}): SurfaceEvidence {
  return {
    id: "public-map", name: "Public map", mode: "map",
    sourceIds: ["osm-one"], locale: "en", offline: "YES",
    creditedNearMap: "YES", keyboardAccessible: "YES",
    screenReaderLabelled: "YES", minimumTargetPx: 44,
    publicationDate: "2026-01-05", ...overrides,
  };
}

export function sampleRelease(
  sources: readonly SourceEvidence[] = [sampleSource()],
  surfaces: readonly SurfaceEvidence[] = [sampleSurface()],
): ReleaseEvidence {
  return {
    schema: "attribution-evidence/1", releaseId: "release-one", sources, surfaces,
  };
}

