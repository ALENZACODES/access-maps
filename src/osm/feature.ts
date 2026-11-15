import { isPersonalTag, type OsmElement } from "./map.js";
import { parseGeometry, type OsmGeometry } from "./geometry.js";

export interface ParsedOsmFeature {
  element: OsmElement;
  droppedKeys: string[];
}

export function parseOsmFeature(feature: {
  id?: unknown;
  geometry?: unknown;
  properties?: unknown;
}): ParsedOsmFeature | null {
  const properties = asRecord(feature.properties);
  const osmType = osmTypeOf(properties, feature.id);
  const osmId = osmIdOf(properties, feature.id);
  if (!osmType || !osmId) return null;
  const tags: Record<string, string> = {};
  const droppedKeys: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (key.startsWith("@")) continue;
    if (typeof value !== "string") continue;
    if (isPersonalTag(key)) {
      droppedKeys.push(key);
      continue;
    }
    tags[key] = value;
  }
  const geometry = parseGeometry(feature.geometry);
  return {
    element: { osmType, osmId, tags, geometry },
    droppedKeys,
  };
}

function osmTypeOf(properties: Record<string, unknown>, featureId: unknown): OsmElement["osmType"] | null {
  const raw = properties["@type"];
  if (raw === "node" || raw === "way" || raw === "relation") return raw;
  const id = typeof featureId === "string" ? featureId : "";
  if (id.startsWith("n")) return "node";
  if (id.startsWith("w")) return "way";
  if (id.startsWith("r")) return "relation";
  return null;
}

function osmIdOf(properties: Record<string, unknown>, featureId: unknown): string | null {
  const raw = properties["@id"];
  if (typeof raw === "number" || typeof raw === "string") return String(raw);
  if (typeof featureId === "string" && featureId.length > 1) return featureId.slice(1);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function geometryOf(feature: ParsedOsmFeature): OsmGeometry | null {
  return feature.element.geometry;
}
