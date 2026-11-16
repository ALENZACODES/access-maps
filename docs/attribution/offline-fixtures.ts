/** Programmatic test fixtures, never published as a provider dataset. */
import { createHash } from "node:crypto";
import type { BundleAsset, BundleRoute, OfflineBundle } from "./offline-bundle.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import type { ReleaseEvidence } from "./evidence-contract.js";

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
export function fixtureAsset(overrides: Partial<BundleAsset> = {}): BundleAsset {
  return {
    path: "index.html", kind: "html", bytes: 12, sha256: sha256("hello world!"),
    dependencies: ["assets/main.js"], sourceIds: ["osm-one"], disposition: "included",
    ...overrides,
  };
}
export function fixtureRoute(overrides: Partial<BundleRoute> = {}): BundleRoute {
  return {
    id: "home", path: "index.html", entry: "index.html", locale: "en",
    sourceIds: ["osm-one"], offline: "YES", surfaceId: "public-map", ...overrides,
  };
}
export function fixtureBundle(overrides: Partial<OfflineBundle> = {}): OfflineBundle {
  return {
    schema: "attribution-offline-bundle/1",
    release: sampleRelease(),
    assets: [
      fixtureAsset(),
      fixtureAsset({path:"assets/main.js",kind:"js",bytes:4,sha256:sha256("test"),dependencies:[],sourceIds:[]}),
    ],
    routes: [fixtureRoute()],
    ...overrides,
  };
}
export function withAssets(bundle: OfflineBundle, assets: readonly BundleAsset[]): OfflineBundle {
  return {...bundle, assets};
}
export function withRoutes(bundle: OfflineBundle, routes: readonly BundleRoute[]): OfflineBundle {
  return {...bundle, routes};
}
export function withRelease(bundle: OfflineBundle, release: ReleaseEvidence): OfflineBundle {
  return {...bundle, release};
}
export function withSourceFamily(bundle: OfflineBundle, family: "osm" | "metrolinx-aua" | "metrolinx-ogl" | "ltc" | "other"): OfflineBundle {
  const source = sampleSource({family});
  const surface = sampleSurface();
  return withRelease(bundle, sampleRelease([source], [surface]));
}
