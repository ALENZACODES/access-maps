/** Release-scoped bilingual parity checks; no I/O and no inferred provider rights. */
import { auditOfflineBundle, traceAssets, type BundleRoute, type OfflineBundle } from "./offline-bundle.js";
import type { SourceEvidence, SurfaceEvidence } from "./evidence-contract.js";
import { METROLINX_AUA_SECTION_3_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR, METROLINX_OGL_LINE, OSM_ATTRIBUTION_LINE } from "./index.js";

export type ParityLevel = "block" | "notice";
export type ParityCode =
  | "BASE_BUNDLE_BLOCKED" | "EMPTY_PAIR_REGISTER" | "ROUTE_NOT_FOUND" | "ROUTE_REUSED"
  | "WRONG_LOCALE" | "SURFACE_MISSING" | "SURFACE_LOCALE_MISMATCH"
  | "SURFACE_MODE_MISMATCH" | "SURFACE_OFFLINE_MISMATCH" | "ROUTE_OFFLINE_UNKNOWN"
  | "ROUTE_OFFLINE_NO" | "OFFLINE_REGRESSION" | "SOURCE_SET_MISMATCH"
  | "EXPECTED_SOURCE_MISSING" | "UNKNOWN_SOURCE" | "SOURCE_NOT_INCLUDED"
  | "SOURCE_PERMISSION_UNKNOWN" | "SOURCE_PERMISSION_NO" | "SOURCE_LICENCE_UNKNOWN"
  | "SOURCE_LICENCE_NO" | "SOURCE_URL_UNKNOWN" | "SOURCE_TERMS_UNKNOWN"
  | "SOURCE_NOTICE_MISSING" | "OSM_NOTICE_MISSING" | "ODBL_NOTICE_MISSING"
  | "AUA_LEGEND_MISSING" | "AUA_LAWS_MISSING" | "OGL_NOTICE_MISSING"
  | "LTC_NOTICE_MISSING" | "ASSET_UNKNOWN" | "ASSET_NOT_INCLUDED"
  | "SHARED_ASSET_MISSING" | "ASSET_DEPENDENCY_MISMATCH" | "ASSET_NOT_SHARED"
  | "ASSET_SIZE_UNKNOWN" | "ASSET_HASH_UNKNOWN" | "TARGET_UNKNOWN"
  | "TARGET_TOO_SMALL" | "TARGET_MISMATCH" | "KEYBOARD_UNKNOWN"
  | "KEYBOARD_NO" | "SCREEN_READER_UNKNOWN" | "SCREEN_READER_NO"
  | "MAP_CREDIT_UNKNOWN" | "MAP_CREDIT_NO" | "DATASET_DATE_UNKNOWN"
  | "ACQUISITION_DATE_UNKNOWN" | "TERMS_REVIEW_DATE_UNKNOWN"
  | "PUBLICATION_DATE_UNKNOWN" | "DATE_MISMATCH" | "NO_RELEASE_SOURCES"
  | "ORPHAN_ROUTE" | "DUPLICATE_LANGUAGE_PATH" | "LOCALE_PATH_SAME"
  | "NOTICE_CROSSED" | "PAIR_READY";

export interface ParityPair {
  readonly id: string;
  readonly enRouteId: string;
  readonly frRouteId: string;
  readonly expectedSourceIds: readonly string[];
  readonly sharedAssetPaths: readonly string[];
  readonly requireOffline: boolean;
}
export interface ParityPlan {
  readonly schema: "attribution-bilingual-parity/1";
  readonly releaseId: string;
  readonly minimumTargetPx: number;
  readonly pairs: readonly ParityPair[];
}
export interface ParityFinding {
  readonly code: ParityCode;
  readonly level: ParityLevel;
  readonly pairId: string | null;
  readonly path: string;
  readonly detail: string;
}
export interface PairSummary {
  readonly id: string;
  readonly enRouteId: string;
  readonly frRouteId: string;
  readonly ready: boolean;
  readonly expectedSourceIds: readonly string[];
  readonly enAssetPaths: readonly string[];
  readonly frAssetPaths: readonly string[];
  readonly sharedAssetPaths: readonly string[];
  readonly blockingCount: number;
  readonly noticeCount: number;
}
export interface ParityResult {
  readonly schema: "attribution-bilingual-parity-report/1";
  readonly releaseId: string;
  readonly blocked: boolean;
  readonly findings: readonly ParityFinding[];
  readonly summaries: readonly PairSummary[];
  readonly blockingCount: number;
  readonly noticeCount: number;
  readonly pairedRoutes: number;
  readonly unpairedRoutes: readonly string[];
}
export class ParityInputError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ParityInputError";
  }
}

const MAX_JSON_BYTES = 1_048_576;
const MAX_PAIRS = 1000;
const MAX_PATHS = 512;
const PAIR_FIELDS = ["id", "enRouteId", "frRouteId", "expectedSourceIds", "sharedAssetPaths", "requireOffline"] as const;
const ROOT_FIELDS = ["schema", "releaseId", "minimumTargetPx", "pairs"] as const;
function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ParityInputError(path, "Expected object");
  return value as Record<string, unknown>;
}
function exactFields(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) throw new ParityInputError(`${path}.${key}`, "Missing field");
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new ParityInputError(`${path}.${key}`, "Unexpected field");
}
function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > 72 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new ParityInputError(path, "Expected lowercase hyphenated identifier");
  }
  return value;
}
function assetPath(value: unknown, path: string): string {
  if (typeof value !== "string" || !value || value.length > 320 || !/^[a-z0-9_@.-]+(?:\/[a-z0-9_@.-]+)*$/iu.test(value)) {
    throw new ParityInputError(path, "Expected relative POSIX asset path");
  }
  if (value.split("/").some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) {
    throw new ParityInputError(path, "Traversal or hidden segment forbidden");
  }
  return value;
}
function arrayOf(value: unknown, path: string, max: number, parse: (item: unknown, path: string) => string): string[] {
  if (!Array.isArray(value) || value.length > max) throw new ParityInputError(path, "Expected bounded list");
  const result = value.map((item: unknown, index: number) => parse(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) throw new ParityInputError(path, "Duplicate value");
  return result;
}
export function parseParityPlan(value: unknown): ParityPlan {
  const root = record(value, "plan");
  exactFields(root, ROOT_FIELDS, "plan");
  if (root.schema !== "attribution-bilingual-parity/1") throw new ParityInputError("plan.schema", "Unsupported schema");
  const releaseId = identifier(root.releaseId, "plan.releaseId");
  const minimumTargetPx = root.minimumTargetPx;
  if (typeof minimumTargetPx !== "number" || !Number.isSafeInteger(minimumTargetPx) || minimumTargetPx < 44 || minimumTargetPx > 512) {
    throw new ParityInputError("plan.minimumTargetPx", "Target size must be at least 44 pixels");
  }
  if (!Array.isArray(root.pairs) || root.pairs.length > MAX_PAIRS) throw new ParityInputError("plan.pairs", "Expected bounded list");
  const pairs = root.pairs.map((entry: unknown, index: number): ParityPair => {
    const path = `plan.pairs[${index}]`;
    const pair = record(entry, path);
    exactFields(pair, PAIR_FIELDS, path);
    const enRouteId = identifier(pair.enRouteId, `${path}.enRouteId`);
    const frRouteId = identifier(pair.frRouteId, `${path}.frRouteId`);
    if (enRouteId === frRouteId) throw new ParityInputError(path, "Both locales must use distinct routes");
    if (typeof pair.requireOffline !== "boolean") throw new ParityInputError(`${path}.requireOffline`, "Expected boolean");
    return {
      id: identifier(pair.id, `${path}.id`), enRouteId, frRouteId,
      expectedSourceIds: arrayOf(pair.expectedSourceIds, `${path}.expectedSourceIds`, MAX_PATHS, identifier),
      sharedAssetPaths: arrayOf(pair.sharedAssetPaths, `${path}.sharedAssetPaths`, MAX_PATHS, assetPath),
      requireOffline: pair.requireOffline,
    };
  });
  const ids = pairs.map((pair) => pair.id);
  if (new Set(ids).size !== ids.length) throw new ParityInputError("plan.pairs", "Duplicate pair identifier");
  const routes = pairs.flatMap((pair) => [pair.enRouteId, pair.frRouteId]);
  if (new Set(routes).size !== routes.length) throw new ParityInputError("plan.pairs", "Route assigned to multiple language pairs");
  return { schema: "attribution-bilingual-parity/1", releaseId, minimumTargetPx, pairs };
}
export function parseParityPlanJson(json: string): ParityPlan {
  if (Buffer.byteLength(json, "utf8") > MAX_JSON_BYTES) throw new ParityInputError("plan", "JSON too large");
  let value: unknown;
  try { value = JSON.parse(json) as unknown; }
  catch { throw new ParityInputError("plan", "Invalid JSON"); }
  return parseParityPlan(value);
}

function normalize(value: string): string { return value.normalize("NFC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim(); }
function containsNotice(value: string, notice: string): boolean { return normalize(value).includes(normalize(notice)); }
function containsBoth(value: string, a: string, b: string): boolean { return containsNotice(value, a) && containsNotice(value, b); }
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}
function sorted(items: Iterable<string>): string[] { return [...items].sort((a, b) => a.localeCompare(b)); }
function collectSources(bundle: OfflineBundle, route: BundleRoute): string[] {
  const assetByPath = new Map(bundle.assets.map((item) => [item.path, item]));
  const found = new Set(route.sourceIds);
  for (const path of traceAssets(bundle, route.entry)) for (const id of assetByPath.get(path)?.sourceIds ?? []) found.add(id);
  return sorted(found);
}
function sourceNoticeProblems(source: SourceEvidence): ParityCode[] {
  const text = source.attribution;
  if (!text.trim()) return ["SOURCE_NOTICE_MISSING"];
  switch (source.family) {
    case "osm": return [
      ...(!containsNotice(text, OSM_ATTRIBUTION_LINE) ? ["OSM_NOTICE_MISSING" as const] : []),
      ...(!containsNotice(text, "ODbL") ? ["ODBL_NOTICE_MISSING" as const] : []),
    ];
    case "metrolinx-aua": return [
      ...(!containsNotice(text, METROLINX_AUA_SECTION_3_LEGEND) ? ["AUA_LEGEND_MISSING" as const] : []),
      ...(!containsBoth(text, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR) ? ["AUA_LAWS_MISSING" as const] : []),
      ...(containsNotice(text, METROLINX_OGL_LINE) ? ["NOTICE_CROSSED" as const] : []),
    ];
    case "metrolinx-ogl": return [
      ...(!containsNotice(text, METROLINX_OGL_LINE) ? ["OGL_NOTICE_MISSING" as const] : []),
      ...(containsNotice(text, METROLINX_AUA_SECTION_3_LEGEND) ? ["NOTICE_CROSSED" as const] : []),
    ];
    case "ltc": return !normalize(text).includes("london transit") && !normalize(text).includes("ltc") ? ["LTC_NOTICE_MISSING"] : [];
    default: return [];
  }
}
function safeSources(bundle: OfflineBundle): Map<string, SourceEvidence> { return new Map(bundle.release.sources.map((s) => [s.id, s])); }
function safeSurfaces(bundle: OfflineBundle): Map<string, SurfaceEvidence> { return new Map(bundle.release.surfaces.map((s) => [s.id, s])); }

/**
 * Only declared pairs are compared. There is no guessing that routes with
 * similar paths, place names, or dataset labels are equivalent.
 */
export function auditBilingualParity(bundle: OfflineBundle, plan: ParityPlan): ParityResult {
  const findings: ParityFinding[] = [];
  const add = (code: ParityCode, level: ParityLevel, pairId: string | null, path: string, detail: string): void => {
    findings.push({ code, level, pairId, path, detail });
  };
  const base = auditOfflineBundle(bundle, false);
  if (base.blocked) add("BASE_BUNDLE_BLOCKED", "block", null, "bundle", "Offline bundle release audit blocks publication");
  if (plan.releaseId !== bundle.release.releaseId) throw new ParityInputError("plan.releaseId", "Release IDs differ");
  if (plan.pairs.length === 0) add("EMPTY_PAIR_REGISTER", "block", null, "plan.pairs", "At least one declared language pair is required");
  const routes = new Map(bundle.routes.map((r) => [r.id, r]));
  const assets = new Map(bundle.assets.map((a) => [a.path, a]));
  const sources = safeSources(bundle);
  const surfaces = safeSurfaces(bundle);
  const paired = new Set<string>();
  const summaries: PairSummary[] = [];
  for (const pair of plan.pairs) {
    const start = findings.length;
    const prefix = `pairs.${pair.id}`;
    const en = routes.get(pair.enRouteId);
    const fr = routes.get(pair.frRouteId);
    if (!en) add("ROUTE_NOT_FOUND", "block", pair.id, `${prefix}.enRouteId`, pair.enRouteId);
    if (!fr) add("ROUTE_NOT_FOUND", "block", pair.id, `${prefix}.frRouteId`, pair.frRouteId);
    if (en) paired.add(en.id);
    if (fr) paired.add(fr.id);
    if (en && en.locale !== "en") add("WRONG_LOCALE", "block", pair.id, `${prefix}.enRouteId`, en.locale);
    if (fr && fr.locale !== "fr") add("WRONG_LOCALE", "block", pair.id, `${prefix}.frRouteId`, fr.locale);
    if (en && fr && en.path === fr.path) add("LOCALE_PATH_SAME", "block", pair.id, `${prefix}.path`, en.path);
    const enSurface = en ? surfaces.get(en.surfaceId) : undefined;
    const frSurface = fr ? surfaces.get(fr.surfaceId) : undefined;
    for (const [tag, route, surface] of [["en", en, enSurface], ["fr", fr, frSurface]] as const) {
      if (!route) continue;
      if (!surface) add("SURFACE_MISSING", "block", pair.id, `${prefix}.${tag}.surface`, route.surfaceId);
      else {
        if (surface.locale !== tag) add("SURFACE_LOCALE_MISMATCH", "block", pair.id, `${prefix}.${tag}.locale`, surface.locale);
        if (surface.minimumTargetPx === "UNKNOWN") add("TARGET_UNKNOWN", "block", pair.id, `${prefix}.${tag}.minimumTargetPx`, "UNKNOWN");
        else if (surface.minimumTargetPx < plan.minimumTargetPx) add("TARGET_TOO_SMALL", "block", pair.id, `${prefix}.${tag}.minimumTargetPx`, String(surface.minimumTargetPx));
        if (surface.keyboardAccessible !== "YES") add(surface.keyboardAccessible === "UNKNOWN" ? "KEYBOARD_UNKNOWN" : "KEYBOARD_NO", "block", pair.id, `${prefix}.${tag}.keyboard`, surface.keyboardAccessible);
        if (surface.screenReaderLabelled !== "YES") add(surface.screenReaderLabelled === "UNKNOWN" ? "SCREEN_READER_UNKNOWN" : "SCREEN_READER_NO", "block", pair.id, `${prefix}.${tag}.screenReader`, surface.screenReaderLabelled);
        if (surface.mode === "map" && surface.creditedNearMap !== "YES") add(surface.creditedNearMap === "UNKNOWN" ? "MAP_CREDIT_UNKNOWN" : "MAP_CREDIT_NO", "block", pair.id, `${prefix}.${tag}.mapCredit`, surface.creditedNearMap);
        if (surface.publicationDate === "UNKNOWN") add("PUBLICATION_DATE_UNKNOWN", "notice", pair.id, `${prefix}.${tag}.publicationDate`, "UNKNOWN");
      }
      if (pair.requireOffline) {
        if (route.offline === "UNKNOWN") add("ROUTE_OFFLINE_UNKNOWN", "block", pair.id, `${prefix}.${tag}.offline`, "UNKNOWN");
        else if (route.offline === "NO") add("ROUTE_OFFLINE_NO", "block", pair.id, `${prefix}.${tag}.offline`, "NO");
      }
    }
    if (en && fr) {
      if (en.offline !== fr.offline) add("SURFACE_OFFLINE_MISMATCH", "block", pair.id, `${prefix}.offline`, `${en.offline} / ${fr.offline}`);
      if (enSurface && frSurface && enSurface.mode !== frSurface.mode) add("SURFACE_MODE_MISMATCH", "block", pair.id, `${prefix}.mode`, `${enSurface.mode} / ${frSurface.mode}`);
      if (enSurface && frSurface && enSurface.minimumTargetPx !== frSurface.minimumTargetPx) add("TARGET_MISMATCH", "notice", pair.id, `${prefix}.targets`, `${enSurface.minimumTargetPx} / ${frSurface.minimumTargetPx}`);
      if (!sameSet(en.sourceIds, fr.sourceIds)) add("SOURCE_SET_MISMATCH", "block", pair.id, `${prefix}.sourceIds`, "Language routes declare different sources");
      if (enSurface && frSurface && enSurface.publicationDate !== "UNKNOWN" && frSurface.publicationDate !== "UNKNOWN" && enSurface.publicationDate !== frSurface.publicationDate) add("DATE_MISMATCH", "notice", pair.id, `${prefix}.publicationDate`, `${enSurface.publicationDate} / ${frSurface.publicationDate}`);
    }
    const enPaths = en ? traceAssets(bundle, en.entry) : [];
    const frPaths = fr ? traceAssets(bundle, fr.entry) : [];
    const common = enPaths.filter((p) => frPaths.includes(p));
    for (const path of pair.sharedAssetPaths) {
      if (!enPaths.includes(path) || !frPaths.includes(path)) add("SHARED_ASSET_MISSING", "block", pair.id, `${prefix}.sharedAssetPaths`, path);
    }
    for (const [lang, paths] of [["en", enPaths], ["fr", frPaths]] as const) {
      for (const path of paths) {
        const asset = assets.get(path);
        if (!asset) { add("ASSET_UNKNOWN", "block", pair.id, `${prefix}.${lang}.asset`, path); continue; }
        if (asset.disposition !== "included") add("ASSET_NOT_INCLUDED", "block", pair.id, `${prefix}.${lang}.asset`, path);
        if (asset.bytes === "UNKNOWN") add("ASSET_SIZE_UNKNOWN", "block", pair.id, `${prefix}.${lang}.asset`, path);
        if (asset.sha256 === "UNKNOWN") add("ASSET_HASH_UNKNOWN", "block", pair.id, `${prefix}.${lang}.asset`, path);
      }
    }
    const enSources = en ? collectSources(bundle, en) : [];
    const frSources = fr ? collectSources(bundle, fr) : [];
    for (const id of pair.expectedSourceIds) {
      if (!enSources.includes(id) || !frSources.includes(id)) add("EXPECTED_SOURCE_MISSING", "block", pair.id, `${prefix}.expectedSourceIds`, id);
    }
    for (const id of sorted(new Set([...enSources, ...frSources, ...pair.expectedSourceIds]))) {
      const source = sources.get(id);
      if (!source) { add("UNKNOWN_SOURCE", "block", pair.id, `${prefix}.source.${id}`, id); continue; }
      if (source.state !== "included") add("SOURCE_NOT_INCLUDED", "block", pair.id, `${prefix}.source.${id}.state`, source.state);
      if (source.redistributionPermission !== "YES") add(source.redistributionPermission === "UNKNOWN" ? "SOURCE_PERMISSION_UNKNOWN" : "SOURCE_PERMISSION_NO", "block", pair.id, `${prefix}.source.${id}.permission`, source.redistributionPermission);
      if (source.licenceEvidence !== "YES") add(source.licenceEvidence === "UNKNOWN" ? "SOURCE_LICENCE_UNKNOWN" : "SOURCE_LICENCE_NO", "block", pair.id, `${prefix}.source.${id}.licence`, source.licenceEvidence);
      if (source.sourceUrl === "UNKNOWN") add("SOURCE_URL_UNKNOWN", "block", pair.id, `${prefix}.source.${id}.url`, "UNKNOWN");
      if (source.licenceUrl === "UNKNOWN") add("SOURCE_TERMS_UNKNOWN", "block", pair.id, `${prefix}.source.${id}.licenceUrl`, "UNKNOWN");
      if (source.datasetDate === "UNKNOWN") add("DATASET_DATE_UNKNOWN", "notice", pair.id, `${prefix}.source.${id}.datasetDate`, "UNKNOWN");
      if (source.acquisitionDate === "UNKNOWN") add("ACQUISITION_DATE_UNKNOWN", "block", pair.id, `${prefix}.source.${id}.acquisitionDate`, "UNKNOWN");
      if (source.termsReviewedDate === "UNKNOWN") add("TERMS_REVIEW_DATE_UNKNOWN", "block", pair.id, `${prefix}.source.${id}.termsReviewedDate`, "UNKNOWN");
      for (const code of sourceNoticeProblems(source)) add(code, "block", pair.id, `${prefix}.source.${id}.attribution`, code);
    }
    const pairFindings = findings.slice(start);
    const blockingCount = pairFindings.filter((f) => f.level === "block").length;
    const noticeCount = pairFindings.length - blockingCount;
    summaries.push({ id: pair.id, enRouteId: pair.enRouteId, frRouteId: pair.frRouteId, ready: blockingCount === 0,
      expectedSourceIds: [...pair.expectedSourceIds], enAssetPaths: sorted(enPaths), frAssetPaths: sorted(frPaths),
      sharedAssetPaths: sorted(common), blockingCount, noticeCount });
  }
  const unpaired = sorted(bundle.routes.filter((route) => !paired.has(route.id)).map((route) => route.id));
  for (const id of unpaired) add("ORPHAN_ROUTE", "notice", null, `routes.${id}`, id);
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail));
  return { schema: "attribution-bilingual-parity-report/1", releaseId: bundle.release.releaseId,
    blocked: findings.some((f) => f.level === "block"), findings, summaries,
    blockingCount: findings.filter((f) => f.level === "block").length,
    noticeCount: findings.filter((f) => f.level === "notice").length,
    pairedRoutes: paired.size, unpairedRoutes: unpaired };
}
