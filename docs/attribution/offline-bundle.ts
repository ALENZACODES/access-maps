/** Offline publication bundle contract. No I/O or network access. */
import type { ReleaseEvidence, EvidenceState } from "./evidence-contract.js";
import { parseReleaseEvidence } from "./evidence-contract.js";
import { auditRelease, type AuditResult } from "./evidence-audit.js";

export type BundleAssetKind = "html" | "css" | "js" | "json" | "image" | "font" | "binary";
export type BundleDisposition = "included" | "held" | "excluded";
export type BundleProblemLevel = "block" | "notice";

export interface BundleAsset {
  readonly path: string;
  readonly kind: BundleAssetKind;
  readonly bytes: number | "UNKNOWN";
  readonly sha256: string | "UNKNOWN";
  readonly dependencies: readonly string[];
  readonly sourceIds: readonly string[];
  readonly disposition: BundleDisposition;
}
export interface BundleRoute {
  readonly id: string;
  readonly path: string;
  readonly locale: "en" | "fr";
  readonly entry: string;
  readonly sourceIds: readonly string[];
  readonly offline: EvidenceState;
  readonly surfaceId: string;
}
export interface OfflineBundle {
  readonly schema: "attribution-offline-bundle/1";
  readonly release: ReleaseEvidence;
  readonly assets: readonly BundleAsset[];
  readonly routes: readonly BundleRoute[];
}
export interface BundleProblem {
  readonly code: string;
  readonly level: BundleProblemLevel;
  readonly location: string;
  readonly description: string;
}
export interface BundleAudit {
  readonly releaseId: string;
  readonly blocked: boolean;
  readonly assets: number;
  readonly routes: number;
  readonly totalBytes: number | "UNKNOWN";
  readonly problems: readonly BundleProblem[];
  readonly evidence: AuditResult;
  readonly reachable: Readonly<Record<string, readonly string[]>>;
}

export class BundleInputError extends Error {
  constructor(readonly at: string, message: string) {
    super(`${at}: ${message}`);
    this.name = "BundleInputError";
  }
}

const BUNDLE_KEYS = ["schema", "release", "assets", "routes"] as const;
const ASSET_KEYS = ["path", "kind", "bytes", "sha256", "dependencies", "sourceIds", "disposition"] as const;
const ROUTE_KEYS = ["id", "path", "locale", "entry", "sourceIds", "offline", "surfaceId"] as const;
const ASSET_KINDS: readonly BundleAssetKind[] = ["html", "css", "js", "json", "image", "font", "binary"];
const DISPOSITIONS: readonly BundleDisposition[] = ["included", "held", "excluded"];
const STATES: readonly EvidenceState[] = ["YES", "NO", "UNKNOWN"];
const MAX_ASSETS = 6000;
const MAX_ROUTES = 500;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

function object(value: unknown, at: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BundleInputError(at, "Expected an object");
  }
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], at: string): void {
  for (const name of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) throw new BundleInputError(`${at}.${name}`, "Missing field");
  }
  for (const name of Object.keys(value)) {
    if (!keys.includes(name)) throw new BundleInputError(`${at}.${name}`, "Unknown field");
  }
}
function string(value: unknown, at: string, max = 160): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new BundleInputError(at, "Expected bounded non-empty text");
  }
  if (value !== value.normalize("NFC") || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new BundleInputError(at, "Unexpected text encoding or controls");
  }
  return value;
}
function oneOf<T extends string>(value: unknown, accepted: readonly T[], at: string): T {
  if (typeof value !== "string" || !accepted.includes(value as T)) {
    throw new BundleInputError(at, `Expected one of ${accepted.join(", ")}`);
  }
  return value as T;
}
function identifier(value: unknown, at: string): string {
  const id = string(value, at, 72);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(id)) throw new BundleInputError(at, "Invalid identifier");
  return id;
}
/** Strict POSIX paths; no platform-specific path interpretation. */
export function bundlePath(value: unknown, at = "path"): string {
  const path = string(value, at, 320);
  if (path.includes("\\") || path.startsWith("/") || path.startsWith("~") || path.includes("?") || path.includes("#")) {
    throw new BundleInputError(at, "A relative POSIX path is required");
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(path) || path.startsWith("//")) {
    throw new BundleInputError(at, "Scheme or network path is not permitted");
  }
  const segments = path.split("/");
  if (segments.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    throw new BundleInputError(at, "Empty, hidden or traversing path segment");
  }
  for (const part of segments) {
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/u.test(part)) {
      throw new BundleInputError(at, "Unsupported path character");
    }
  }
  return path;
}
function list(value: unknown, at: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new BundleInputError(at, "Expected bounded array");
  return value as unknown[];
}
function unique<T>(values: readonly T[], at: string): T[] {
  if (new Set(values).size !== values.length) throw new BundleInputError(at, "Duplicate values");
  return [...values];
}
function sources(value: unknown, at: string): string[] {
  return unique(list(value, at, 500).map((entry, index) => identifier(entry, `${at}[${index}]`)), at);
}
function dependencies(value: unknown, at: string): string[] {
  return unique(list(value, at, 500).map((entry, index) => bundlePath(entry, `${at}[${index}]`)), at);
}
function parseAsset(value: unknown, at: string): BundleAsset {
  const item = object(value, at);
  exact(item, ASSET_KEYS, at);
  const bytes = item.bytes;
  if (bytes !== "UNKNOWN" && (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0)) {
    throw new BundleInputError(`${at}.bytes`, "Expected non-negative safe integer or UNKNOWN");
  }
  const hash = item.sha256;
  if (hash !== "UNKNOWN" && (typeof hash !== "string" || !/^[0-9a-f]{64}$/u.test(hash))) {
    throw new BundleInputError(`${at}.sha256`, "Expected lowercase SHA-256 or UNKNOWN");
  }
  return {
    path: bundlePath(item.path, `${at}.path`),
    kind: oneOf(item.kind, ASSET_KINDS, `${at}.kind`),
    bytes: bytes as number | "UNKNOWN",
    sha256: hash as string | "UNKNOWN",
    dependencies: dependencies(item.dependencies, `${at}.dependencies`),
    sourceIds: sources(item.sourceIds, `${at}.sourceIds`),
    disposition: oneOf(item.disposition, DISPOSITIONS, `${at}.disposition`),
  };
}
function parseRoute(value: unknown, at: string): BundleRoute {
  const item = object(value, at);
  exact(item, ROUTE_KEYS, at);
  return {
    id: identifier(item.id, `${at}.id`),
    path: bundlePath(item.path, `${at}.path`),
    locale: oneOf(item.locale, ["en", "fr"] as const, `${at}.locale`),
    entry: bundlePath(item.entry, `${at}.entry`),
    sourceIds: sources(item.sourceIds, `${at}.sourceIds`),
    offline: oneOf(item.offline, STATES, `${at}.offline`),
    surfaceId: identifier(item.surfaceId, `${at}.surfaceId`),
  };
}
function distinct<T>(values: readonly T[], at: string): void {
  if (new Set(values).size !== values.length) throw new BundleInputError(at, "Duplicate identity");
}
export function parseOfflineBundle(value: unknown): OfflineBundle {
  const root = object(value, "bundle");
  exact(root, BUNDLE_KEYS, "bundle");
  if (root.schema !== "attribution-offline-bundle/1") throw new BundleInputError("bundle.schema", "Unsupported schema");
  const assets = list(root.assets, "bundle.assets", MAX_ASSETS).map((asset, i) => parseAsset(asset, `bundle.assets[${i}]`));
  const routes = list(root.routes, "bundle.routes", MAX_ROUTES).map((route, i) => parseRoute(route, `bundle.routes[${i}]`));
  distinct(assets.map((asset) => asset.path), "bundle.assets");
  distinct(routes.map((route) => route.id), "bundle.routes.id");
  distinct(routes.map((route) => route.path), "bundle.routes.path");
  return {schema:"attribution-offline-bundle/1", release: parseReleaseEvidence(root.release), assets, routes};
}
export function parseOfflineBundleJson(json: string): OfflineBundle {
  if (new TextEncoder().encode(json).length > MAX_JSON_BYTES) throw new BundleInputError("bundle", "JSON exceeds size limit");
  let value: unknown;
  try { value = JSON.parse(json) as unknown; }
  catch { throw new BundleInputError("bundle", "Invalid JSON"); }
  return parseOfflineBundle(value);
}

export function traceAssets(bundle: OfflineBundle, entry: string): readonly string[] {
  const assets = new Map(bundle.assets.map((asset) => [asset.path, asset]));
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const dependency of assets.get(path)?.dependencies ?? []) visit(dependency);
  };
  visit(entry);
  return [...seen].sort();
}
export function auditOfflineBundle(bundle: OfflineBundle, requireOffline = true): BundleAudit {
  const evidence = auditRelease(bundle.release);
  const problems: BundleProblem[] = [];
  const add = (code: string, level: BundleProblemLevel, location: string, description: string): void => {
    problems.push({code, level, location, description});
  };
  const assets = new Map(bundle.assets.map((asset) => [asset.path, asset]));
  const sourcesById = new Map(bundle.release.sources.map((source) => [source.id, source]));
  const surfacesById = new Map(bundle.release.surfaces.map((surface) => [surface.id, surface]));
  const routeSet = new Set(bundle.routes.map((route) => route.surfaceId));
  const reached = new Set<string>();
  const reachable: Record<string, readonly string[]> = {};
  let totalBytes = 0;
  let knownBytes = true;
  for (const asset of bundle.assets) {
    const location = `assets.${asset.path}`;
    if (asset.bytes === "UNKNOWN") { knownBytes = false; if (asset.disposition === "included") add("ASSET_SIZE_UNKNOWN", "block", location, "Size absent"); }
    else if (asset.disposition === "included") {
      totalBytes += asset.bytes;
      if (!Number.isSafeInteger(totalBytes)) { knownBytes = false; add("TOTAL_SIZE_OVERFLOW", "block", location, "Total is not safely representable"); }
    }
    if (asset.sha256 === "UNKNOWN" && asset.disposition === "included") add("ASSET_DIGEST_UNKNOWN", "block", location, "Digest absent");
    for (const dependency of asset.dependencies) {
      if (!assets.has(dependency)) add("DEPENDENCY_MISSING", "block", location, dependency);
      else if (asset.disposition === "included" && assets.get(dependency)?.disposition !== "included") add("DEPENDENCY_NOT_INCLUDED", "block", location, dependency);
    }
    for (const sourceId of asset.sourceIds) {
      if (!sourcesById.has(sourceId)) add("ASSET_SOURCE_MISSING", "block", location, sourceId);
      else if (asset.disposition === "included" && sourcesById.get(sourceId)?.state !== "included") add("ASSET_SOURCE_NOT_INCLUDED", "block", location, sourceId);
    }
  }
  for (const route of bundle.routes) {
    const location = `routes.${route.id}`;
    const surface = surfacesById.get(route.surfaceId);
    if (!surface) add("ROUTE_SURFACE_MISSING", "block", location, route.surfaceId);
    else {
      if (surface.locale !== route.locale) add("ROUTE_LANGUAGE_MISMATCH", "block", location, route.locale);
      if (surface.offline !== route.offline) add("ROUTE_OFFLINE_MISMATCH", "block", location, route.offline);
      if (!sameSet(surface.sourceIds, route.sourceIds)) add("ROUTE_SOURCES_MISMATCH", "block", location, route.id);
    }
    if (route.offline !== "YES" && requireOffline) add("ROUTE_NOT_OFFLINE", "block", location, "Offline capability is not recorded as YES");
    const entry = assets.get(route.entry);
    if (!entry) add("ENTRY_MISSING", "block", location, route.entry);
    else {
      if (entry.kind !== "html") add("ENTRY_NOT_HTML", "block", location, route.entry);
      if (entry.disposition !== "included") add("ENTRY_NOT_INCLUDED", "block", location, route.entry);
    }
    const paths = traceAssets(bundle, route.entry);
    reachable[route.id] = paths;
    for (const path of paths) {
      reached.add(path);
      const asset = assets.get(path);
      if (!asset) continue;
      if (asset.disposition !== "included") add("ROUTE_ASSET_NOT_INCLUDED", "block", location, path);
      for (const sourceId of asset.sourceIds) {
        if (!route.sourceIds.includes(sourceId)) add("ROUTE_SOURCE_UNDECLARED", "block", location, `${path}: ${sourceId}`);
      }
    }
    for (const sourceId of route.sourceIds) {
      if (!sourcesById.has(sourceId)) add("ROUTE_SOURCE_MISSING", "block", location, sourceId);
      else if (!paths.some((path) => assets.get(path)?.sourceIds.includes(sourceId))) {
        add("ROUTE_SOURCE_UNLINKED", "block", location, sourceId);
      }
    }
  }
  for (const surface of bundle.release.surfaces) {
    if (!routeSet.has(surface.id)) add("SURFACE_WITHOUT_ROUTE", "block", `surfaces.${surface.id}`, "Published surface has no route");
  }
  for (const asset of bundle.assets) {
    if (asset.disposition === "included" && !reached.has(asset.path)) add("UNUSED_INCLUDED_ASSET", "notice", `assets.${asset.path}`, "Not reachable from a route");
  }
  const circles = findCycles(bundle.assets.filter((asset) => asset.disposition === "included"));
  for (const circle of circles) add("DEPENDENCY_CYCLE", "block", `assets.${circle[0] ?? "UNKNOWN"}`, circle.join(" → "));
  problems.sort((a,b) => a.location.localeCompare(b.location) || a.code.localeCompare(b.code));
  return {
    releaseId: bundle.release.releaseId, blocked: evidence.blocked || problems.some((problem) => problem.level === "block"),
    assets: bundle.assets.length, routes: bundle.routes.length, totalBytes: knownBytes ? totalBytes : "UNKNOWN", problems,
    evidence, reachable,
  };
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
/** Iterative cycle enumeration, one finding per strongly connected component. */
export function findCycles(assets: readonly BundleAsset[]): readonly (readonly string[])[] {
  const links = new Map(assets.map((asset) => [asset.path, asset.dependencies]));
  const stack: string[] = [];
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const inStack = new Set<string>();
  const output: string[][] = [];
  let next = 0;
  const visit = (node: string): void => {
    index.set(node, next); low.set(node, next); next += 1;
    stack.push(node); inStack.add(node);
    for (const child of links.get(node) ?? []) {
      if (!links.has(child)) continue;
      if (!index.has(child)) { visit(child); low.set(node, Math.min(low.get(node) ?? 0, low.get(child) ?? 0)); }
      else if (inStack.has(child)) low.set(node, Math.min(low.get(node) ?? 0, index.get(child) ?? 0));
    }
    if (low.get(node) === index.get(node)) {
      const group: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (current !== undefined) { inStack.delete(current); group.push(current); }
      } while (current !== node && current !== undefined);
      if (group.length > 1 || (group.length === 1 && (links.get(node) ?? []).includes(node))) output.push(group.sort());
    }
  };
  for (const node of [...links.keys()].sort()) if (!index.has(node)) visit(node);
  return output.sort((a,b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
}
