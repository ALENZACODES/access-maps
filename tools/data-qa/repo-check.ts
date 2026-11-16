/**
 * Runs checkStrictData over registry entries and packed records in the repo.
 * No network, no publishing, no schedule.
 */
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { SourceEntry } from "../../src/registry.js";
import { checkStrictData, type AccessState, type DataRecord, type Silo } from "./index.js";
import { isDocumentedLicence, LICENCE_FINDINGS, type LicenceFinding } from "./findings.js";

export interface AdaptedRecord {
  readonly record: DataRecord;
  readonly path: string;
}

export interface CheckReport {
  readonly registry: number;
  readonly packRecords: number;
  readonly files: number;
  readonly documentedLicenceHits: number;
  readonly violations: string[];
}

const LICENCE_ERROR = /licence: unsupported or missing/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function calendarDate(value: string): string | null {
  const date = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Explicit yes/no only. limited, designated, conflicts and other tokens stay UNKNOWN. */
export function accessibilityFromWheelchair(value: unknown): AccessState {
  if (typeof value !== "string") return "UNKNOWN";
  const token = value.trim().toLowerCase();
  if (token === "yes") return "YES";
  if (token === "no") return "NO";
  return "UNKNOWN";
}

export function siloForLicence(licence: string): Silo {
  return licence === "ODbL-1.0" ? "odbl" : "open";
}

function provenanceFrom(source: string, licence: string, observedOn: string): {
  source: string;
  licence: DataRecord["licence"];
  observedOn: string;
} {
  return {
    source,
    // The strict allowlist is enforced by checkStrictData, not by this cast.
    licence: licence as DataRecord["licence"],
    observedOn,
  };
}

export function adaptRegistrySource(source: SourceEntry, registryPath: string): AdaptedRecord | string {
  const observedOn = calendarDate(source.retrieved_at);
  if (!nonempty(source.id)) return `${registryPath}: source id is required`;
  if (!nonempty(source.licence_id)) return `${registryPath} ${source.id}: licence_id is required`;
  if (!observedOn) return `${registryPath} ${source.id}: retrieved_at is not a calendar date`;
  const provenance = provenanceFrom(source.id, source.licence_id, observedOn);
  return {
    path: `${registryPath}#${source.id}`,
    record: {
      id: `registry:${source.id}`,
      ...provenance,
      accessibility: "UNKNOWN",
      silo: siloForLicence(source.licence_id),
      lineage: [provenance],
    },
  };
}

interface FieldLike {
  value?: unknown;
  source_id?: unknown;
  licence?: unknown;
  retrieved_at?: unknown;
}

function collectFields(raw: Record<string, unknown>): FieldLike[] {
  if (object(raw.fields)) return Object.values(raw.fields).filter(object) as FieldLike[];
  if (nonempty(raw.source_id) || nonempty(raw.licence) || nonempty(raw.retrieved_at)) {
    return [
      {
        source_id: raw.source_id,
        licence: raw.licence,
        retrieved_at: raw.retrieved_at,
        value: raw.wheelchair ?? raw.accessibility,
      },
    ];
  }
  return [];
}

export function adaptPackRecord(raw: unknown, filePath: string): AdaptedRecord | string {
  if (!object(raw)) return `${filePath}: expected object`;
  if (!nonempty(raw.id)) return `${filePath}: record id is required`;
  const fields = collectFields(raw);
  if (fields.length === 0) return `${filePath} ${raw.id}: missing provenance fields`;

  const sources = new Set<string>();
  const licences = new Set<string>();
  const dates = new Set<string>();
  for (const field of fields) {
    if (nonempty(field.source_id)) sources.add(field.source_id);
    if (nonempty(field.licence)) licences.add(field.licence);
    if (nonempty(field.retrieved_at)) {
      const date = calendarDate(field.retrieved_at);
      if (!date) return `${filePath} ${raw.id}: retrieved_at is not a calendar date`;
      dates.add(date);
    }
  }
  if (sources.size !== 1) return `${filePath} ${raw.id}: source_id must be a single value`;
  if (licences.size !== 1) return `${filePath} ${raw.id}: licence must be a single value`;
  if (dates.size !== 1) return `${filePath} ${raw.id}: retrieved_at must be a single date`;
  const source = [...sources][0]!;
  const licence = [...licences][0]!;
  const observedOn = [...dates][0]!;

  let wheelchair: unknown;
  if (object(raw.fields) && object(raw.fields.wheelchair)) wheelchair = raw.fields.wheelchair.value;
  else if ("wheelchair" in raw) wheelchair = raw.wheelchair;

  const provenance = provenanceFrom(source, licence, observedOn);
  return {
    path: `${filePath}#${raw.id}`,
    record: {
      id: raw.id,
      ...provenance,
      accessibility: accessibilityFromWheelchair(wheelchair),
      silo: siloForLicence(licence),
      lineage: [provenance],
    },
  };
}

export function undocumentedViolations(
  errors: readonly string[],
  record: DataRecord,
  findings: readonly LicenceFinding[] = LICENCE_FINDINGS,
): string[] {
  const documented = findings.some((item) => item.sourceId === record.source && item.licence === record.licence);
  return errors.filter((error) => {
    if (LICENCE_ERROR.test(error) && documented) return false;
    return true;
  });
}

function listNdjson(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ndjson.gz")) found.push(full);
    }
  };
  walk(directory);
  return found.sort();
}

async function* readNdjson(file: string): AsyncGenerator<unknown> {
  const stream = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of stream) {
      if (!line.trim()) continue;
      yield JSON.parse(line) as unknown;
    }
  } finally {
    stream.close();
  }
}

export interface RepoCheckOptions {
  readonly root: string;
  readonly registryPath?: string;
  readonly dataDir?: string;
  readonly packDir?: string;
  readonly findings?: readonly LicenceFinding[];
}

export async function checkRepoData(options: RepoCheckOptions): Promise<CheckReport> {
  const findings = options.findings ?? LICENCE_FINDINGS;
  const registryPath = options.registryPath ?? path.join(options.root, "sources", "registry.json");
  const dataDir = options.dataDir ?? path.join(options.root, "data");
  const packDir = options.packDir ?? path.join(options.root, "pack", "v1");
  const violations: string[] = [];
  let documentedLicenceHits = 0;
  const seen = new Set<string>();

  const checkOne = (adapted: AdaptedRecord | string): void => {
    if (typeof adapted === "string") {
      violations.push(adapted);
      return;
    }
    if (seen.has(adapted.record.id)) {
      violations.push(`${adapted.path}: duplicate id ${adapted.record.id}`);
      return;
    }
    seen.add(adapted.record.id);
    const result = checkStrictData([adapted.record], adapted.record.silo);
    if (result.ok) return;
    const leftover = undocumentedViolations(result.errors, adapted.record, findings);
    const licenceOnly = result.errors.every((error) => LICENCE_ERROR.test(error));
    if (licenceOnly && leftover.length === 0) documentedLicenceHits += 1;
    for (const error of leftover) violations.push(`${adapted.path}: ${error}`);
  };

  const registryJson = JSON.parse(readFileSync(registryPath, "utf8")) as { sources: SourceEntry[] };
  const sources = registryJson.sources;
  if (!Array.isArray(sources)) {
    return {
      registry: 0,
      packRecords: 0,
      files: 0,
      documentedLicenceHits: 0,
      violations: [`${registryPath}: sources must be an array`],
    };
  }
  for (const source of sources) {
    checkOne(adaptRegistrySource(source, registryPath));
  }

  const files = [...listNdjson(dataDir), ...listNdjson(packDir)];
  let packRecords = 0;
  for (const file of files) {
    for await (const raw of readNdjson(file)) {
      packRecords += 1;
      checkOne(adaptPackRecord(raw, path.relative(options.root, file) || file));
    }
  }

  // Fail closed: an empty checkout must not pass as if the pack had been checked.
  if (files.length === 0) {
    violations.push(
      `${dataDir} and ${packDir}: data/ and pack/v1 yielded zero .ndjson.gz files; failing closed`,
    );
  }

  return {
    registry: sources.length,
    packRecords,
    files: files.length,
    documentedLicenceHits,
    violations,
  };
}

// Keep isDocumentedLicence imported for tests that re-export from this module.
export { isDocumentedLicence };
