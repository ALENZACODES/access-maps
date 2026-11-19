/** Regression checks for bilingual route pairs and publication evidence. */
import type { OfflineBundle } from "./offline-bundle.js";
import { auditBilingualParity, type ParityFinding, type ParityPlan, type ParityResult } from "./offline-parity.js";

export type ParityChangeKind =
  | "PAIR_ADDED" | "PAIR_REMOVED" | "PAIR_ROUTE_CHANGED" | "PAIR_REQUIREMENT_CHANGED"
  | "PAIR_SOURCE_REMOVED" | "PAIR_SOURCE_ADDED" | "PAIR_SHARED_ASSET_REMOVED"
  | "PAIR_SHARED_ASSET_ADDED" | "PAIR_BLOCKED" | "PAIR_RECOVERED"
  | "ROUTE_LOST" | "ROUTE_ADDED" | "LOCALE_CHANGED" | "OFFLINE_LOST"
  | "OFFLINE_GAINED" | "SOURCE_CREDIT_LOST" | "SOURCE_CREDIT_ADDED"
  | "ASSET_LOST" | "ASSET_GAINED" | "ASSET_DIGEST_CHANGED"
  | "ASSET_SIZE_CHANGED" | "ASSET_DISPOSITION_CHANGED"
  | "SOURCE_REMOVED" | "SOURCE_ADDED" | "SOURCE_FAMILY_CHANGED"
  | "SOURCE_LICENCE_CHANGED" | "SOURCE_PERMISSION_CHANGED"
  | "SOURCE_ORIGIN_CHANGED" | "SOURCE_NOTICE_CHANGED" | "SOURCE_DATE_CHANGED"
  | "TARGET_REDUCED" | "TARGET_INCREASED" | "KEYBOARD_LOST"
  | "SCREEN_READER_LOST" | "MAP_CREDIT_LOST" | "SURFACE_LOST"
  | "SURFACE_ADDED" | "NEW_BLOCKING_FINDING" | "RESOLVED_BLOCKING_FINDING";
export type ParityChangeLevel = "block" | "notice";
export interface ParityChange {
  readonly kind: ParityChangeKind;
  readonly level: ParityChangeLevel;
  readonly entity: string;
  readonly before: string;
  readonly after: string;
}
export interface ParityComparison {
  readonly schema: "attribution-bilingual-parity-comparison/1";
  readonly previousRelease: string;
  readonly nextRelease: string;
  readonly blocked: boolean;
  readonly changes: readonly ParityChange[];
  readonly beforeResult: ParityResult;
  readonly afterResult: ParityResult;
  readonly blockingChanges: number;
  readonly noticeChanges: number;
}
function indexed<T>(items: readonly T[], key: (value: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}
function difference(a: readonly string[], b: readonly string[]): string[] { return a.filter((item) => !b.includes(item)).sort(); }
function findingKey(f: ParityFinding): string { return `${f.pairId ?? "root"}|${f.code}|${f.path}|${f.detail}`; }
function serialize(value: unknown): string { return value === undefined ? "UNKNOWN" : typeof value === "string" ? value : JSON.stringify(value); }

/**
 * Missing a previously declared language pair is a release blocker even
 * when the new plan's own audit passes. Both snapshots must be explicit.
 */
export function compareBilingualReleases(
  previous: OfflineBundle,
  previousPlan: ParityPlan,
  next: OfflineBundle,
  nextPlan: ParityPlan,
): ParityComparison {
  const beforeResult = auditBilingualParity(previous, previousPlan);
  const afterResult = auditBilingualParity(next, nextPlan);
  const changes: ParityChange[] = [];
  const add = (kind: ParityChangeKind, level: ParityChangeLevel, entity: string, before: unknown, after: unknown): void => {
    changes.push({ kind, level, entity, before: serialize(before), after: serialize(after) });
  };
  const beforePairs = indexed(previousPlan.pairs, (pair) => pair.id);
  const afterPairs = indexed(nextPlan.pairs, (pair) => pair.id);
  for (const [id, pair] of beforePairs) {
    const newer = afterPairs.get(id);
    if (!newer) { add("PAIR_REMOVED", "block", id, pair.id, "UNKNOWN"); continue; }
    if (pair.enRouteId !== newer.enRouteId || pair.frRouteId !== newer.frRouteId) {
      add("PAIR_ROUTE_CHANGED", "block", id, `${pair.enRouteId}/${pair.frRouteId}`, `${newer.enRouteId}/${newer.frRouteId}`);
    }
    if (pair.requireOffline && !newer.requireOffline) add("PAIR_REQUIREMENT_CHANGED", "block", id, "offline", "not required");
    if (nextPlan.minimumTargetPx < previousPlan.minimumTargetPx) add("PAIR_REQUIREMENT_CHANGED", "block", id, previousPlan.minimumTargetPx, nextPlan.minimumTargetPx);
    for (const source of difference(pair.expectedSourceIds, newer.expectedSourceIds)) add("PAIR_SOURCE_REMOVED", "block", id, source, "UNKNOWN");
    for (const source of difference(newer.expectedSourceIds, pair.expectedSourceIds)) add("PAIR_SOURCE_ADDED", "notice", id, "UNKNOWN", source);
    for (const asset of difference(pair.sharedAssetPaths, newer.sharedAssetPaths)) add("PAIR_SHARED_ASSET_REMOVED", "block", id, asset, "UNKNOWN");
    for (const asset of difference(newer.sharedAssetPaths, pair.sharedAssetPaths)) add("PAIR_SHARED_ASSET_ADDED", "notice", id, "UNKNOWN", asset);
    const beforeSummary = beforeResult.summaries.find((summary) => summary.id === id);
    const afterSummary = afterResult.summaries.find((summary) => summary.id === id);
    if (beforeSummary?.ready && afterSummary && !afterSummary.ready) add("PAIR_BLOCKED", "block", id, "ready", "blocked");
    if (beforeSummary && !beforeSummary.ready && afterSummary?.ready) add("PAIR_RECOVERED", "notice", id, "blocked", "ready");
  }
  for (const [id] of afterPairs) if (!beforePairs.has(id)) add("PAIR_ADDED", "notice", id, "UNKNOWN", id);
  const oldRoutes = indexed(previous.routes, (route) => route.id);
  const newRoutes = indexed(next.routes, (route) => route.id);
  for (const [id, route] of oldRoutes) {
    const newer = newRoutes.get(id);
    if (!newer) { add("ROUTE_LOST", "block", id, route.path, "UNKNOWN"); continue; }
    if (route.locale !== newer.locale) add("LOCALE_CHANGED", "block", id, route.locale, newer.locale);
    if (route.offline === "YES" && newer.offline !== "YES") add("OFFLINE_LOST", "block", id, route.offline, newer.offline);
    if (route.offline !== "YES" && newer.offline === "YES") add("OFFLINE_GAINED", "notice", id, route.offline, newer.offline);
    for (const source of difference(route.sourceIds, newer.sourceIds)) add("SOURCE_CREDIT_LOST", "block", id, source, "UNKNOWN");
    for (const source of difference(newer.sourceIds, route.sourceIds)) add("SOURCE_CREDIT_ADDED", "notice", id, "UNKNOWN", source);
  }
  for (const [id, route] of newRoutes) if (!oldRoutes.has(id)) add("ROUTE_ADDED", "notice", id, "UNKNOWN", route.path);
  const oldAssets = indexed(previous.assets, (asset) => asset.path);
  const newAssets = indexed(next.assets, (asset) => asset.path);
  for (const [path, asset] of oldAssets) {
    const newer = newAssets.get(path);
    if (!newer) { add("ASSET_LOST", "block", path, asset.path, "UNKNOWN"); continue; }
    if (asset.sha256 !== newer.sha256) add("ASSET_DIGEST_CHANGED", "notice", path, asset.sha256, newer.sha256);
    if (asset.bytes !== newer.bytes) add("ASSET_SIZE_CHANGED", "notice", path, asset.bytes, newer.bytes);
    if (asset.disposition === "included" && newer.disposition !== "included") add("ASSET_DISPOSITION_CHANGED", "block", path, asset.disposition, newer.disposition);
  }
  for (const [path] of newAssets) if (!oldAssets.has(path)) add("ASSET_GAINED", "notice", path, "UNKNOWN", path);
  const oldSources = indexed(previous.release.sources, (source) => source.id);
  const newSources = indexed(next.release.sources, (source) => source.id);
  for (const [id, source] of oldSources) {
    const newer = newSources.get(id);
    if (!newer) { add("SOURCE_REMOVED", "block", id, source.name, "UNKNOWN"); continue; }
    if (source.family !== newer.family) add("SOURCE_FAMILY_CHANGED", "block", id, source.family, newer.family);
    if (source.licenceUrl !== newer.licenceUrl || source.licenceName !== newer.licenceName || source.licenceEvidence !== newer.licenceEvidence) {
      add("SOURCE_LICENCE_CHANGED", "block", id, `${source.licenceName}|${source.licenceEvidence}|${source.licenceUrl}`, `${newer.licenceName}|${newer.licenceEvidence}|${newer.licenceUrl}`);
    }
    if (source.redistributionPermission !== newer.redistributionPermission) add("SOURCE_PERMISSION_CHANGED", newer.redistributionPermission === "YES" ? "notice" : "block", id, source.redistributionPermission, newer.redistributionPermission);
    if (source.sourceUrl !== newer.sourceUrl) add("SOURCE_ORIGIN_CHANGED", "block", id, source.sourceUrl, newer.sourceUrl);
    if (source.attribution !== newer.attribution) add("SOURCE_NOTICE_CHANGED", "block", id, source.attribution, newer.attribution);
    if (source.datasetDate !== newer.datasetDate || source.acquisitionDate !== newer.acquisitionDate || source.termsReviewedDate !== newer.termsReviewedDate) add("SOURCE_DATE_CHANGED", "notice", id,
      `${source.datasetDate}|${source.acquisitionDate}|${source.termsReviewedDate}`, `${newer.datasetDate}|${newer.acquisitionDate}|${newer.termsReviewedDate}`);
  }
  for (const [id] of newSources) if (!oldSources.has(id)) add("SOURCE_ADDED", "notice", id, "UNKNOWN", id);
  const oldSurfaces = indexed(previous.release.surfaces, (surface) => surface.id);
  const newSurfaces = indexed(next.release.surfaces, (surface) => surface.id);
  for (const [id, surface] of oldSurfaces) {
    const newer = newSurfaces.get(id);
    if (!newer) { add("SURFACE_LOST", "block", id, surface.name, "UNKNOWN"); continue; }
    if (typeof surface.minimumTargetPx === "number" && (newer.minimumTargetPx === "UNKNOWN" || newer.minimumTargetPx < surface.minimumTargetPx)) add("TARGET_REDUCED", "block", id, surface.minimumTargetPx, newer.minimumTargetPx);
    if (typeof newer.minimumTargetPx === "number" && (surface.minimumTargetPx === "UNKNOWN" || newer.minimumTargetPx > surface.minimumTargetPx)) add("TARGET_INCREASED", "notice", id, surface.minimumTargetPx, newer.minimumTargetPx);
    if (surface.keyboardAccessible === "YES" && newer.keyboardAccessible !== "YES") add("KEYBOARD_LOST", "block", id, surface.keyboardAccessible, newer.keyboardAccessible);
    if (surface.screenReaderLabelled === "YES" && newer.screenReaderLabelled !== "YES") add("SCREEN_READER_LOST", "block", id, surface.screenReaderLabelled, newer.screenReaderLabelled);
    if (surface.creditedNearMap === "YES" && newer.creditedNearMap !== "YES") add("MAP_CREDIT_LOST", "block", id, surface.creditedNearMap, newer.creditedNearMap);
  }
  for (const [id] of newSurfaces) if (!oldSurfaces.has(id)) add("SURFACE_ADDED", "notice", id, "UNKNOWN", id);
  const beforeBlocks = new Set(beforeResult.findings.filter((f) => f.level === "block").map(findingKey));
  const afterBlocks = new Set(afterResult.findings.filter((f) => f.level === "block").map(findingKey));
  for (const id of afterBlocks) if (!beforeBlocks.has(id)) add("NEW_BLOCKING_FINDING", "block", id, "UNKNOWN", id);
  for (const id of beforeBlocks) if (!afterBlocks.has(id)) add("RESOLVED_BLOCKING_FINDING", "notice", id, id, "UNKNOWN");
  changes.sort((a, b) => a.entity.localeCompare(b.entity) || a.kind.localeCompare(b.kind));
  return {
    schema: "attribution-bilingual-parity-comparison/1", previousRelease: previous.release.releaseId,
    nextRelease: next.release.releaseId, blocked: afterResult.blocked || changes.some((c) => c.level === "block"),
    changes, beforeResult, afterResult, blockingChanges: changes.filter((c) => c.level === "block").length,
    noticeChanges: changes.filter((c) => c.level === "notice").length,
  };
}
