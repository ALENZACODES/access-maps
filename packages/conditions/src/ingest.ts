import { readFile } from "node:fs/promises";
import type {
  ConditionRecord,
  ConditionType,
  ExpiryHours,
  Geometry,
  OpenLicence,
  Point,
  SourceRegistryEntry,
} from "./types";
import { CONDITION_TYPES, validPoint } from "./types";

export interface IngestResult {
  records: ConditionRecord[];
  heldReason?: string;
  sourceId: string;
  licence: OpenLicence | null;
  silo: "odbl" | "open" | "held";
}

export interface ImportOptions {
  registry: SourceRegistryEntry;
  filePath?: string;
  fixture?: string;
  format: "geojson" | "csv";
  fetchedAt: string;
  expiryHours?: ExpiryHours;
}

const OPEN_LICENCES: readonly OpenLicence[] = [
  "ODbL", "OGL-Ontario", "OGL-Canada", "CC-BY", "CC0",
];

function csvRows(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      fields.push(field);
      if (fields.some((value) => value.length)) lines.push(fields);
      fields = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  fields.push(field);
  if (fields.some((value) => value.length)) lines.push(fields);
  const [header, ...rows] = lines;
  if (!header) return [];
  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), row[index] ?? ""])),
  );
}

function safeType(value: unknown): ConditionType {
  return typeof value === "string" &&
    (CONDITION_TYPES as readonly string[]).includes(value)
    ? value as ConditionType
    : "other";
}

function pointFromGeometry(geometry: Geometry | undefined): Point | undefined {
  if (geometry?.type !== "Point") return undefined;
  const [lon, lat] = geometry.coordinates;
  const point = { lon: Number(lon), lat: Number(lat) };
  return validPoint(point) ? point : undefined;
}

function buildRecord(
  fields: Record<string, unknown>,
  geometry: Geometry | undefined,
  index: number,
  options: ImportOptions,
): ConditionRecord | null {
  const point = geometry
    ? pointFromGeometry(geometry)
    : {
        lat: Number(fields.lat),
        lon: Number(fields.lon),
      };
  const location = point && validPoint(point) ? point : undefined;
  const cell = typeof fields.cell === "string" && fields.cell
    ? fields.cell
    : undefined;
  if (!location && !geometry && !cell) return null;
  const sourceKey =
    typeof fields.id === "string" || typeof fields.id === "number"
      ? String(fields.id)
      : String(index);
  const description =
    typeof fields.description === "string" && fields.description.trim()
      ? fields.description.trim()
      : "UNKNOWN";
  const registry = options.registry;
  return {
    id: `${registry.sourceId}:${sourceKey}`,
    type: safeType(fields.type),
    ...(location && { point: location }),
    ...(geometry && { geometry }),
    ...(cell && { cell }),
    fact: {
      value: description,
      source_id: registry.sourceId,
      licence: registry.licence!,
      retrieved_at: options.fetchedAt,
      tier: 1,
      source_key: sourceKey,
    },
    last_fetched: options.fetchedAt,
    last_checked: null,
    expiry_hours: options.expiryHours ?? 6,
  };
}

/**
 * Explicit local import only. Does not fetch or schedule sources.
 * The registry must be confirmed before any input is read or emitted.
 */
export async function importConditions(
  options: ImportOptions,
): Promise<IngestResult> {
  const { registry } = options;
  const permitted =
    registry.status === "confirmed" &&
    registry.licence !== null &&
    OPEN_LICENCES.includes(registry.licence) &&
    Boolean(registry.licenceUrl?.trim());
  if (!permitted) {
    return {
      records: [],
      sourceId: registry.sourceId,
      licence: registry.licence,
      silo: "held",
      heldReason:
        registry.heldReason ||
        "Source held: an open licence and its URL must be confirmed.",
    };
  }
  if (!Number.isFinite(Date.parse(options.fetchedAt))) {
    throw new Error("A valid manual fetch timestamp is required");
  }
  if (Number(options.filePath !== undefined) +
      Number(options.fixture !== undefined) !== 1) {
    throw new Error("Provide exactly one local file path or fixture");
  }
  const content = options.filePath !== undefined
    ? await readFile(options.filePath, "utf8")
    : options.fixture!;
  let items: Array<{
    fields: Record<string, unknown>;
    geometry?: Geometry;
  }>;
  if (options.format === "csv") {
    items = csvRows(content).map((fields) => ({ fields }));
  } else {
    const collection: unknown = JSON.parse(content);
    if (
      !collection ||
      typeof collection !== "object" ||
      !("type" in collection) ||
      collection.type !== "FeatureCollection" ||
      !("features" in collection) ||
      !Array.isArray(collection.features)
    ) {
      throw new Error("Expected GeoJSON FeatureCollection");
    }
    items = collection.features.map((feature: unknown) => {
      if (!feature || typeof feature !== "object") {
        return { fields: {} };
      }
      const candidate = feature as {
        properties?: Record<string, unknown>;
        geometry?: Geometry;
      };
      return {
        fields: candidate.properties ?? {},
        geometry: candidate.geometry,
      };
    });
  }
  const records = items
    .map((item, index) =>
      buildRecord(item.fields, item.geometry, index, options),
    )
    .filter((record): record is ConditionRecord => record !== null);
  return {
    records,
    sourceId: registry.sourceId,
    licence: registry.licence,
    silo: registry.licence === "ODbL" ? "odbl" : "open",
  };
}
