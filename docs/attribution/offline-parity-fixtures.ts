/** Constructed test-only evidence. No third-party feed data is bundled. */
import { sha256 } from "./offline-fixtures.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import type { BundleAsset, BundleRoute, OfflineBundle } from "./offline-bundle.js";
import type { SourceEvidence, SurfaceEvidence } from "./evidence-contract.js";
import type { ParityPair, ParityPlan } from "./offline-parity.js";
import { OSM_ATTRIBUTION_LINE } from "./index.js";

export function paritySource(overrides: Partial<SourceEvidence> = {}): SourceEvidence {
  return sampleSource({ attribution: `${OSM_ATTRIBUTION_LINE}; Open Database License (ODbL) 1.0`, ...overrides });
}
export function paritySurface(locale: "en" | "fr", overrides: Partial<SurfaceEvidence> = {}): SurfaceEvidence {
  return sampleSurface({ id: `map-${locale}`, name: `Map ${locale}`, locale, ...overrides });
}
export function parityAsset(path: string, overrides: Partial<BundleAsset> = {}): BundleAsset {
  const kind = path.endsWith(".html") ? "html" : path.endsWith(".css") ? "css" : "js";
  const content = `asset:${path}`;
  return { path, kind, bytes: Buffer.byteLength(content), sha256: sha256(content),
    dependencies: [], sourceIds: [], disposition: "included", ...overrides };
}
export function parityRoute(locale: "en" | "fr", overrides: Partial<BundleRoute> = {}): BundleRoute {
  return { id: `map-${locale}`, path: `map-${locale}.html`, locale, entry: `map-${locale}.html`,
    sourceIds: ["osm-one"], offline: "YES", surfaceId: `map-${locale}`, ...overrides };
}
export function parityBundle(overrides: Partial<OfflineBundle> = {}): OfflineBundle {
  const shared = parityAsset("assets/map.js", { sourceIds: ["osm-one"] });
  return {
    schema: "attribution-offline-bundle/1",
    release: sampleRelease([paritySource()], [paritySurface("en"), paritySurface("fr")]),
    assets: [
      parityAsset("map-en.html", { dependencies: ["assets/map.js"] }),
      parityAsset("map-fr.html", { dependencies: ["assets/map.js"] }), shared,
    ],
    routes: [parityRoute("en"), parityRoute("fr")],
    ...overrides,
  };
}
export function parityPair(overrides: Partial<ParityPair> = {}): ParityPair {
  return { id: "map-pair", enRouteId: "map-en", frRouteId: "map-fr",
    expectedSourceIds: ["osm-one"], sharedAssetPaths: ["assets/map.js"], requireOffline: true,
    ...overrides };
}
export function parityPlan(overrides: Partial<ParityPlan> = {}): ParityPlan {
  return { schema: "attribution-bilingual-parity/1", releaseId: "release-one", minimumTargetPx: 44,
    pairs: [parityPair()], ...overrides };
}
export function setSource(bundle: OfflineBundle, source: SourceEvidence): OfflineBundle {
  return { ...bundle, release: { ...bundle.release, sources: [source] } };
}
export function setSurfaces(bundle: OfflineBundle, surfaces: readonly SurfaceEvidence[]): OfflineBundle {
  return { ...bundle, release: { ...bundle.release, surfaces } };
}
export function setAssets(bundle: OfflineBundle, assets: readonly BundleAsset[]): OfflineBundle {
  return { ...bundle, assets };
}
export function setRoutes(bundle: OfflineBundle, routes: readonly BundleRoute[]): OfflineBundle {
  return { ...bundle, routes };
}
export function renameRelease(bundle: OfflineBundle, releaseId: string): OfflineBundle {
  return { ...bundle, release: { ...bundle.release, releaseId } };
}
export function renamePlan(plan: ParityPlan, releaseId: string): ParityPlan {
  return { ...plan, releaseId };
}
