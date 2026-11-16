/** Strict, pure parsing of user-supplied source-evidence records. */
export type EvidenceState = "YES" | "NO" | "UNKNOWN";
export type SourceFamily = "osm" | "metrolinx-aua" | "metrolinx-ogl" | "ltc" | "other";
export type PublicationState = "included" | "held" | "excluded";
export type DisplayMode = "map" | "journey" | "list" | "download" | "other";
export type DateEvidence = string | "UNKNOWN";

export interface SourceEvidence {
  readonly id: string;
  readonly family: SourceFamily;
  readonly name: string;
  readonly sourceUrl: string;
  readonly licenceUrl: string;
  readonly licenceName: string;
  readonly licenceEvidence: EvidenceState;
  readonly redistributionPermission: EvidenceState;
  readonly acquisitionDate: DateEvidence;
  readonly datasetDate: DateEvidence;
  readonly termsReviewedDate: DateEvidence;
  readonly attribution: string;
  readonly notes: string;
  readonly state: PublicationState;
}

export interface SurfaceEvidence {
  readonly id: string;
  readonly name: string;
  readonly mode: DisplayMode;
  readonly sourceIds: readonly string[];
  readonly locale: "en" | "fr";
  readonly offline: EvidenceState;
  readonly creditedNearMap: EvidenceState;
  readonly keyboardAccessible: EvidenceState;
  readonly screenReaderLabelled: EvidenceState;
  readonly minimumTargetPx: number | "UNKNOWN";
  readonly publicationDate: DateEvidence;
}

export interface ReleaseEvidence {
  readonly schema: "attribution-evidence/1";
  readonly releaseId: string;
  readonly sources: readonly SourceEvidence[];
  readonly surfaces: readonly SurfaceEvidence[];
}

export class EvidenceInputError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "EvidenceInputError";
    this.path = path;
  }
}

const SOURCE_FIELDS = [
  "id", "family", "name", "sourceUrl", "licenceUrl", "licenceName",
  "licenceEvidence", "redistributionPermission", "acquisitionDate",
  "datasetDate", "termsReviewedDate", "attribution", "notes", "state",
] as const;
const SURFACE_FIELDS = [
  "id", "name", "mode", "sourceIds", "locale", "offline",
  "creditedNearMap", "keyboardAccessible", "screenReaderLabelled",
  "minimumTargetPx", "publicationDate",
] as const;
const RELEASE_FIELDS = ["schema", "releaseId", "sources", "surfaces"] as const;
const STATES = ["YES", "NO", "UNKNOWN"] as const;
const FAMILIES = ["osm", "metrolinx-aua", "metrolinx-ogl", "ltc", "other"] as const;
const MODES = ["map", "journey", "list", "download", "other"] as const;
const PUBLICATION_STATES = ["included", "held", "excluded"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new EvidenceInputError(path, "Expected an object");
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new EvidenceInputError(`${path}.${key}`, "Unknown field");
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new EvidenceInputError(`${path}.${key}`, "Missing field");
    }
  }
}

function boundedText(
  value: unknown,
  path: string,
  max: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") throw new EvidenceInputError(path, "Expected text");
  if (value.length > max) throw new EvidenceInputError(path, "Too long");
  if (!allowEmpty && value.trim().length === 0) {
    throw new EvidenceInputError(path, "Required text is empty");
  }
  if (value !== value.normalize("NFC")) {
    throw new EvidenceInputError(path, "Text must use NFC normalization");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new EvidenceInputError(path, "Control character is not allowed");
  }
  return value;
}

function identifier(value: unknown, path: string): string {
  const text = boundedText(value, path, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(text)) {
    throw new EvidenceInputError(path, "Use lowercase letters, numbers and hyphens");
  }
  return text;
}

function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new EvidenceInputError(path, `Expected ${options.join(", ")}`);
  }
  return value as T;
}

function evidenceState(value: unknown, path: string): EvidenceState {
  return choice(value, STATES, path);
}

function httpsUrl(value: unknown, path: string): string {
  if (value === "UNKNOWN") return "UNKNOWN";
  const text = boundedText(value, path, 2048);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new EvidenceInputError(path, "Invalid URL");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    /^(?:127\.|10\.|192\.168\.|169\.254\.)/u.test(url.hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./u.test(url.hostname) ||
    url.hostname === "[::1]" ||
    url.hostname.endsWith(".local")
  ) {
    throw new EvidenceInputError(path, "Only public HTTPS source URLs are accepted");
  }
  return text;
}

function isoDate(value: unknown, path: string): DateEvidence {
  if (value === "UNKNOWN") return value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new EvidenceInputError(path, "Expected ISO date or UNKNOWN");
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1900 || year > 9999 || month < 1 || month > 12) {
    throw new EvidenceInputError(path, "Invalid calendar date");
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > (days[month - 1] ?? 0)) {
    throw new EvidenceInputError(path, "Invalid calendar date");
  }
  return value;
}

function uniqueStrings(value: unknown, path: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new EvidenceInputError(path, "Expected bounded list");
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const text = identifier(value[i], `${path}[${i}]`);
    if (seen.has(text)) throw new EvidenceInputError(`${path}[${i}]`, "Duplicate ID");
    seen.add(text);
    result.push(text);
  }
  return result;
}

function positiveTarget(value: unknown, path: string): number | "UNKNOWN" {
  if (value === "UNKNOWN") return value;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
    throw new EvidenceInputError(path, "Expected integer pixels or UNKNOWN");
  }
  return value;
}

export function parseSourceEvidence(value: unknown, path = "source"): SourceEvidence {
  const entry = record(value, path);
  exactKeys(entry, SOURCE_FIELDS, path);
  return {
    id: identifier(entry.id, `${path}.id`),
    family: choice(entry.family, FAMILIES, `${path}.family`),
    name: boundedText(entry.name, `${path}.name`, 160),
    sourceUrl: httpsUrl(entry.sourceUrl, `${path}.sourceUrl`),
    licenceUrl: httpsUrl(entry.licenceUrl, `${path}.licenceUrl`),
    licenceName: boundedText(entry.licenceName, `${path}.licenceName`, 180),
    licenceEvidence: evidenceState(entry.licenceEvidence, `${path}.licenceEvidence`),
    redistributionPermission: evidenceState(entry.redistributionPermission, `${path}.redistributionPermission`),
    acquisitionDate: isoDate(entry.acquisitionDate, `${path}.acquisitionDate`),
    datasetDate: isoDate(entry.datasetDate, `${path}.datasetDate`),
    termsReviewedDate: isoDate(entry.termsReviewedDate, `${path}.termsReviewedDate`),
    attribution: boundedText(entry.attribution, `${path}.attribution`, 4000, true),
    notes: boundedText(entry.notes, `${path}.notes`, 2000, true),
    state: choice(entry.state, PUBLICATION_STATES, `${path}.state`),
  };
}

export function parseSurfaceEvidence(value: unknown, path = "surface"): SurfaceEvidence {
  const entry = record(value, path);
  exactKeys(entry, SURFACE_FIELDS, path);
  return {
    id: identifier(entry.id, `${path}.id`),
    name: boundedText(entry.name, `${path}.name`, 160),
    mode: choice(entry.mode, MODES, `${path}.mode`),
    sourceIds: uniqueStrings(entry.sourceIds, `${path}.sourceIds`, 128),
    locale: choice(entry.locale, ["en", "fr"] as const, `${path}.locale`),
    offline: evidenceState(entry.offline, `${path}.offline`),
    creditedNearMap: evidenceState(entry.creditedNearMap, `${path}.creditedNearMap`),
    keyboardAccessible: evidenceState(entry.keyboardAccessible, `${path}.keyboardAccessible`),
    screenReaderLabelled: evidenceState(entry.screenReaderLabelled, `${path}.screenReaderLabelled`),
    minimumTargetPx: positiveTarget(entry.minimumTargetPx, `${path}.minimumTargetPx`),
    publicationDate: isoDate(entry.publicationDate, `${path}.publicationDate`),
  };
}

export function parseReleaseEvidence(value: unknown): ReleaseEvidence {
  const root = record(value, "release");
  exactKeys(root, RELEASE_FIELDS, "release");
  if (root.schema !== "attribution-evidence/1") {
    throw new EvidenceInputError("release.schema", "Unsupported schema");
  }
  if (!Array.isArray(root.sources) || root.sources.length > 512) {
    throw new EvidenceInputError("release.sources", "Expected up to 512 sources");
  }
  if (!Array.isArray(root.surfaces) || root.surfaces.length > 512) {
    throw new EvidenceInputError("release.surfaces", "Expected up to 512 surfaces");
  }
  const sources = root.sources.map((entry: unknown, i: number) =>
    parseSourceEvidence(entry, `release.sources[${i}]`));
  const surfaces = root.surfaces.map((entry: unknown, i: number) =>
    parseSurfaceEvidence(entry, `release.surfaces[${i}]`));
  for (const [label, items] of [["sources", sources], ["surfaces", surfaces]] as const) {
    const ids = new Set<string>();
    for (const item of items) {
      if (ids.has(item.id)) throw new EvidenceInputError(`release.${label}`, `Duplicate ID ${item.id}`);
      ids.add(item.id);
    }
  }
  return {
    schema: "attribution-evidence/1",
    releaseId: identifier(root.releaseId, "release.releaseId"),
    sources,
    surfaces,
  };
}

export function parseReleaseJson(input: string): ReleaseEvidence {
  if (typeof input !== "string" || BufferByteLength(input) > 2_097_152) {
    throw new EvidenceInputError("release", "Input exceeds 2 MiB");
  }
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    throw new EvidenceInputError("release", "Invalid JSON");
  }
  return parseReleaseEvidence(value);
}

/** No Node or browser global dependency: compute UTF-8 size deterministically. */
function BufferByteLength(input: string): number {
  let length = 0;
  for (const character of input) {
    const cp = character.codePointAt(0) ?? 0;
    length += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return length;
}

export function canonicalReleaseJson(release: ReleaseEvidence): string {
  const parsed = parseReleaseEvidence(release);
  const sources = [...parsed.sources].sort((a, b) => a.id.localeCompare(b.id));
  const surfaces = [...parsed.surfaces]
    .map((s) => ({ ...s, sourceIds: [...s.sourceIds].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ ...parsed, sources, surfaces }, null, 2) + "\n";
}

export function createEmptyRelease(releaseId: string): ReleaseEvidence {
  return parseReleaseEvidence({
    schema: "attribution-evidence/1", releaseId, sources: [], surfaces: [],
  });
}

export function updateSource(
  release: ReleaseEvidence,
  candidate: SourceEvidence,
): ReleaseEvidence {
  const source = parseSourceEvidence(candidate);
  const next = release.sources.filter((entry) => entry.id !== source.id);
  return parseReleaseEvidence({ ...release, sources: [...next, source] });
}

export function updateSurface(
  release: ReleaseEvidence,
  candidate: SurfaceEvidence,
): ReleaseEvidence {
  const surface = parseSurfaceEvidence(candidate);
  const next = release.surfaces.filter((entry) => entry.id !== surface.id);
  return parseReleaseEvidence({ ...release, surfaces: [...next, surface] });
}

export function removeSource(release: ReleaseEvidence, id: string): ReleaseEvidence {
  return parseReleaseEvidence({
    ...release,
    sources: release.sources.filter((source) => source.id !== id),
  });
}

export function removeSurface(release: ReleaseEvidence, id: string): ReleaseEvidence {
  return parseReleaseEvidence({
    ...release,
    surfaces: release.surfaces.filter((surface) => surface.id !== id),
  });
}

export function sourceUsage(release: ReleaseEvidence, id: string): readonly string[] {
  return release.surfaces.filter((surface) => surface.sourceIds.includes(id)).map((s) => s.id);
}

export function unusedSources(release: ReleaseEvidence): readonly string[] {
  return release.sources.filter((source) => sourceUsage(release, source.id).length === 0)
    .map((source) => source.id);
}

export function unknownDates(release: ReleaseEvidence): readonly string[] {
  const result: string[] = [];
  for (const source of release.sources) {
    if (source.datasetDate === "UNKNOWN") result.push(source.id);
  }
  return result;
}
