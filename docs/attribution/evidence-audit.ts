import type {
  EvidenceState,
  ReleaseEvidence,
  SourceEvidence,
  SurfaceEvidence,
} from "./evidence-contract.js";
import {
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_AUA_SECTION_3_LEGEND,
  METROLINX_OGL_LINE,
  OSM_ATTRIBUTION_LINE,
} from "./index.js";

export type AuditLevel = "block" | "attention" | "info";
export type AuditCode =
  | "NO_SOURCES" | "NO_SURFACES" | "SOURCE_UNUSED" | "SURFACE_EMPTY"
  | "MISSING_SOURCE" | "SOURCE_HELD" | "SOURCE_EXCLUDED"
  | "SOURCE_UNKNOWN" | "LICENCE_URL_UNKNOWN" | "LICENCE_UNKNOWN"
  | "LICENCE_DENIED" | "REDISTRIBUTION_UNKNOWN" | "REDISTRIBUTION_DENIED"
  | "ACQUISITION_UNKNOWN" | "TERMS_DATE_UNKNOWN" | "DATASET_DATE_UNKNOWN"
  | "ATTRIBUTION_MISSING" | "OSM_CREDIT_MISSING" | "ODBL_MISSING"
  | "AUA_LEGEND_MISSING" | "AUA_LAWS_MISSING" | "OGL_LINE_MISSING"
  | "LTC_NOTICE_MISSING" | "INCOMPATIBLE_NOTICE" | "MIXED_METROLINX_TERMS"
  | "OFFLINE_UNKNOWN" | "OFFLINE_DENIED" | "MAP_CREDIT_UNKNOWN"
  | "MAP_CREDIT_MISSING" | "KEYBOARD_UNKNOWN" | "KEYBOARD_MISSING"
  | "SCREEN_READER_UNKNOWN" | "SCREEN_READER_MISSING"
  | "TARGET_UNKNOWN" | "TARGET_TOO_SMALL" | "FUTURE_DATE"
  | "SURFACE_DATE_UNKNOWN" | "DATE_ORDER" | "DUPLICATE_CONTENT";

export interface AuditFinding {
  readonly code: AuditCode;
  readonly level: AuditLevel;
  readonly path: string;
  readonly sourceId: string | null;
  readonly surfaceId: string | null;
  readonly detail: string;
}

export interface AuditResult {
  readonly releaseId: string;
  readonly blocked: boolean;
  readonly findings: readonly AuditFinding[];
  readonly blockingCount: number;
  readonly attentionCount: number;
  readonly informationCount: number;
  readonly sourceCount: number;
  readonly surfaceCount: number;
  readonly sourceIdsBySurface: Readonly<Record<string, readonly string[]>>;
}

export interface AuditOptions {
  readonly today?: string | "UNKNOWN";
  readonly requireOffline?: boolean;
  readonly requireMapCredit?: boolean;
  readonly requireKeyboardEvidence?: boolean;
  readonly requireScreenReaderEvidence?: boolean;
  readonly minimumTargetPx?: number;
}

const DEFAULT_OPTIONS: Required<AuditOptions> = {
  today: "UNKNOWN",
  requireOffline: false,
  requireMapCredit: true,
  requireKeyboardEvidence: true,
  requireScreenReaderEvidence: true,
  minimumTargetPx: 44,
};

function finding(
  code: AuditCode,
  level: AuditLevel,
  path: string,
  detail: string,
  sourceId: string | null = null,
  surfaceId: string | null = null,
): AuditFinding {
  return { code, level, path, detail, sourceId, surfaceId };
}

function normalized(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function hasNotice(haystack: string, needle: string): boolean {
  return normalized(haystack).includes(normalized(needle));
}

function missingEvidence(
  value: EvidenceState,
  unknown: AuditCode,
  denied: AuditCode,
  path: string,
  sourceId: string | null,
  surfaceId: string | null,
): AuditFinding[] {
  if (value === "YES") return [];
  const code = value === "UNKNOWN" ? unknown : denied;
  return [finding(code, "block", path,
    value === "UNKNOWN" ? "Evidence is UNKNOWN" : "Evidence records NO",
    sourceId, surfaceId)];
}

function dateFindings(
  date: string,
  path: string,
  unknownCode: AuditCode,
  today: string,
  sourceId: string | null,
  surfaceId: string | null,
  unknownLevel: AuditLevel = "block",
): AuditFinding[] {
  if (date === "UNKNOWN") {
    return [finding(unknownCode, unknownLevel, path, "Date is UNKNOWN", sourceId, surfaceId)];
  }
  if (today !== "UNKNOWN" && date > today) {
    return [finding("FUTURE_DATE", "block", path, "Date is later than the supplied reference date", sourceId, surfaceId)];
  }
  return [];
}

function findSourceIssues(source: SourceEvidence, today: string): AuditFinding[] {
  if (source.state !== "included") return [];
  const base = `sources.${source.id}`;
  const result: AuditFinding[] = [];
  const add = (code: AuditCode, level: AuditLevel, key: string, detail: string): void => {
    result.push(finding(code, level, `${base}.${key}`, detail, source.id));
  };

  if (source.sourceUrl === "UNKNOWN") {
    add("SOURCE_UNKNOWN", "block", "sourceUrl", "The source URL is UNKNOWN");
  }
  if (source.licenceUrl === "UNKNOWN") {
    add("LICENCE_URL_UNKNOWN", "block", "licenceUrl", "The licence URL is UNKNOWN");
  }
  result.push(...missingEvidence(
    source.licenceEvidence, "LICENCE_UNKNOWN", "LICENCE_DENIED",
    `${base}.licenceEvidence`, source.id, null));
  result.push(...missingEvidence(
    source.redistributionPermission, "REDISTRIBUTION_UNKNOWN", "REDISTRIBUTION_DENIED",
    `${base}.redistributionPermission`, source.id, null));
  result.push(...dateFindings(
    source.acquisitionDate, `${base}.acquisitionDate`, "ACQUISITION_UNKNOWN",
    today, source.id, null));
  result.push(...dateFindings(
    source.termsReviewedDate, `${base}.termsReviewedDate`, "TERMS_DATE_UNKNOWN",
    today, source.id, null));
  result.push(...dateFindings(
    source.datasetDate, `${base}.datasetDate`, "DATASET_DATE_UNKNOWN",
    today, source.id, null, "info"));

  if (source.acquisitionDate !== "UNKNOWN" &&
      source.datasetDate !== "UNKNOWN" && source.datasetDate > source.acquisitionDate) {
    add("DATE_ORDER", "attention", "datasetDate", "Dataset date is after the acquisition date");
  }
  if (source.attribution.trim() === "") {
    add("ATTRIBUTION_MISSING", "block", "attribution", "Attribution is empty");
  }
  switch (source.family) {
    case "osm": {
      if (!hasNotice(source.attribution, OSM_ATTRIBUTION_LINE)) {
        add("OSM_CREDIT_MISSING", "block", "attribution", "Map credit is missing");
      }
      if (!/ODbL|Open Database Licen[sc]e/iu.test(source.licenceName)) {
        add("ODBL_MISSING", "block", "licenceName", "ODbL licence is not recorded");
      }
      if (hasNotice(source.attribution, METROLINX_AUA_SECTION_3_LEGEND) ||
          hasNotice(source.attribution, METROLINX_OGL_LINE)) {
        add("INCOMPATIBLE_NOTICE", "block", "attribution", "Another provider notice is attached to OSM");
      }
      break;
    }
    case "metrolinx-aua": {
      if (!hasNotice(source.attribution, METROLINX_AUA_SECTION_3_LEGEND)) {
        add("AUA_LEGEND_MISSING", "block", "attribution", "Section 3 legend is missing");
      }
      if (!hasNotice(source.attribution, METROLINX_AUA_END_USER_LAWS_EN) ||
          !hasNotice(source.attribution, METROLINX_AUA_END_USER_LAWS_FR)) {
        add("AUA_LAWS_MISSING", "block", "attribution", "Applicable-laws lines are missing");
      }
      if (hasNotice(source.attribution, METROLINX_OGL_LINE)) {
        add("MIXED_METROLINX_TERMS", "block", "attribution", "Separate OGL notice is mixed into AUA evidence");
      }
      break;
    }
    case "metrolinx-ogl": {
      if (!hasNotice(source.attribution, METROLINX_OGL_LINE)) {
        add("OGL_LINE_MISSING", "block", "attribution", "OGL notice is missing");
      }
      if (hasNotice(source.attribution, METROLINX_AUA_SECTION_3_LEGEND)) {
        add("MIXED_METROLINX_TERMS", "block", "attribution", "Separate AUA legend is mixed into OGL evidence");
      }
      break;
    }
    case "ltc": {
      if (!/London Transit Commission|\bLTC\b/iu.test(source.attribution)) {
        add("LTC_NOTICE_MISSING", "block", "attribution", "LTC attribution is missing");
      }
      if (!/LTC|London Transit/iu.test(source.licenceName)) {
        add("LICENCE_UNKNOWN", "block", "licenceName", "LTC terms are not identified");
      }
      break;
    }
    case "other": {
      if (source.licenceName === "UNKNOWN") {
        add("LICENCE_UNKNOWN", "block", "licenceName", "The licence name is UNKNOWN");
      }
      break;
    }
  }
  return result;
}

function findSurfaceIssues(
  surface: SurfaceEvidence,
  sources: ReadonlyMap<string, SourceEvidence>,
  options: Required<AuditOptions>,
): AuditFinding[] {
  const base = `surfaces.${surface.id}`;
  const result: AuditFinding[] = [];
  const add = (code: AuditCode, level: AuditLevel, key: string, detail: string, sourceId: string | null = null): void => {
    result.push(finding(code, level, `${base}.${key}`, detail, sourceId, surface.id));
  };
  if (surface.sourceIds.length === 0) {
    add("SURFACE_EMPTY", "attention", "sourceIds", "No sources are linked to this surface");
  }
  for (const sourceId of surface.sourceIds) {
    const source = sources.get(sourceId);
    if (!source) {
      add("MISSING_SOURCE", "block", "sourceIds", "Linked source does not exist", sourceId);
    } else if (source.state === "held") {
      add("SOURCE_HELD", "block", "sourceIds", "Linked source is held", sourceId);
    } else if (source.state === "excluded") {
      add("SOURCE_EXCLUDED", "block", "sourceIds", "Linked source is excluded", sourceId);
    }
  }
  if (options.requireOffline) {
    result.push(...missingEvidence(
      surface.offline, "OFFLINE_UNKNOWN", "OFFLINE_DENIED", `${base}.offline`, null, surface.id));
  } else if (surface.offline === "UNKNOWN") {
    add("OFFLINE_UNKNOWN", "info", "offline", "Offline capability is UNKNOWN");
  }
  const needsMapCredit = surface.mode === "map" && surface.sourceIds.some((id) =>
    sources.get(id)?.family === "osm");
  if (needsMapCredit && options.requireMapCredit) {
    result.push(...missingEvidence(
      surface.creditedNearMap, "MAP_CREDIT_UNKNOWN", "MAP_CREDIT_MISSING",
      `${base}.creditedNearMap`, null, surface.id));
  }
  if (options.requireKeyboardEvidence) {
    result.push(...missingEvidence(
      surface.keyboardAccessible, "KEYBOARD_UNKNOWN", "KEYBOARD_MISSING",
      `${base}.keyboardAccessible`, null, surface.id));
  }
  if (options.requireScreenReaderEvidence) {
    result.push(...missingEvidence(
      surface.screenReaderLabelled, "SCREEN_READER_UNKNOWN", "SCREEN_READER_MISSING",
      `${base}.screenReaderLabelled`, null, surface.id));
  }
  if (surface.minimumTargetPx === "UNKNOWN") {
    add("TARGET_UNKNOWN", "block", "minimumTargetPx", "Minimum target dimension is UNKNOWN");
  } else if (surface.minimumTargetPx < options.minimumTargetPx) {
    add("TARGET_TOO_SMALL", "block", "minimumTargetPx", "Minimum target is too small");
  }
  result.push(...dateFindings(surface.publicationDate, `${base}.publicationDate`,
    "SURFACE_DATE_UNKNOWN", options.today, null, surface.id, "info"));
  return result;
}

function duplicateEvidence(release: ReleaseEvidence): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Map<string, string>();
  for (const source of release.sources) {
    if (source.state !== "included" || source.sourceUrl === "UNKNOWN") continue;
    const key = `${source.sourceUrl}|${source.licenceUrl}|${source.family}`;
    const first = seen.get(key);
    if (first) {
      findings.push(finding("DUPLICATE_CONTENT", "attention", `sources.${source.id}`,
        `Same source and licence evidence also appears in ${first}`, source.id));
    } else {
      seen.set(key, source.id);
    }
  }
  return findings;
}

/** Release audit is deterministic: no device clock, network or environment access. */
export function auditRelease(
  release: ReleaseEvidence,
  suppliedOptions: AuditOptions = {},
): AuditResult {
  const options: Required<AuditOptions> = { ...DEFAULT_OPTIONS, ...suppliedOptions };
  if (!Number.isInteger(options.minimumTargetPx) || options.minimumTargetPx < 1) {
    throw new RangeError("minimumTargetPx must be a positive integer");
  }
  if (options.today !== "UNKNOWN" && !/^\d{4}-\d{2}-\d{2}$/u.test(options.today)) {
    throw new RangeError("today must be an ISO date or UNKNOWN");
  }
  const findings: AuditFinding[] = [];
  if (release.sources.length === 0) {
    findings.push(finding("NO_SOURCES", "attention", "sources", "No sources are recorded"));
  }
  if (release.surfaces.length === 0) {
    findings.push(finding("NO_SURFACES", "attention", "surfaces", "No surfaces are recorded"));
  }
  const byId = new Map(release.sources.map((source) => [source.id, source] as const));
  const referenced = new Set(release.surfaces.flatMap((surface) => [...surface.sourceIds]));
  for (const source of release.sources) {
    findings.push(...findSourceIssues(source, options.today));
    if (source.state === "included" && !referenced.has(source.id)) {
      findings.push(finding("SOURCE_UNUSED", "attention", `sources.${source.id}`,
        "Included source is not linked to a surface", source.id));
    }
  }
  for (const surface of release.surfaces) {
    findings.push(...findSurfaceIssues(surface, byId, options));
  }
  findings.push(...duplicateEvidence(release));
  const ordered = [...findings].sort((a, b) =>
    a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  const blockingCount = ordered.filter((item) => item.level === "block").length;
  const attentionCount = ordered.filter((item) => item.level === "attention").length;
  return {
    releaseId: release.releaseId,
    blocked: blockingCount > 0,
    findings: ordered,
    blockingCount,
    attentionCount,
    informationCount: ordered.length - blockingCount - attentionCount,
    sourceCount: release.sources.length,
    surfaceCount: release.surfaces.length,
    sourceIdsBySurface: Object.fromEntries(release.surfaces.map((surface) =>
      [surface.id, [...surface.sourceIds]])),
  };
}

export function findingsForSurface(result: AuditResult, id: string): readonly AuditFinding[] {
  return result.findings.filter((item) => item.surfaceId === id);
}

export function findingsForSource(result: AuditResult, id: string): readonly AuditFinding[] {
  return result.findings.filter((item) => item.sourceId === id);
}

export function countByCode(result: AuditResult): ReadonlyMap<AuditCode, number> {
  const counts = new Map<AuditCode, number>();
  for (const item of result.findings) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  return counts;
}

export function summarizeBlockingPaths(result: AuditResult): readonly string[] {
  return [...new Set(result.findings.filter((item) => item.level === "block")
    .map((item) => item.path))];
}

export function canPublishSurface(result: AuditResult, id: string): boolean {
  const sourceIds = result.sourceIdsBySurface[id];
  if (!sourceIds) return false;
  return !result.findings.some((item) => item.level === "block" &&
    (item.surfaceId === id || (item.sourceId !== null && sourceIds.includes(item.sourceId))));
}
