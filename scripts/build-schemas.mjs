import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(root, "schema");
const fields = JSON.parse(readFileSync(join(schemaDir, "fields.json"), "utf8"));

const FIELD_VALUE_ID = "https://access-maps.local/schema/field-value.schema.json";

const fieldValue = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: FIELD_VALUE_ID,
  title: "FieldValue",
  description:
    "One populated or explicitly unknown field. UNKNOWN is a value, not an omission. derived=true marks a copy kept for usability that the counting rules exclude.",
  type: "object",
  additionalProperties: false,
  required: ["value", "source_id", "licence", "retrieved_at", "tier"],
  properties: {
    value: {
      description:
        "Published value, or the exact string UNKNOWN when the source did not state this fact.",
      anyOf: [
        { type: "string" },
        { type: "number" },
        {
          type: "array",
          minItems: 1,
          items: {
            type: "array",
            prefixItems: [{ type: "number" }, { type: "number" }],
            items: false,
            minItems: 2,
            maxItems: 2,
          },
        },
      ],
    },
    source_id: { type: "string", minLength: 1 },
    licence: {
      type: "string",
      minLength: 1,
      description: "licence_id from the source registry.",
    },
    retrieved_at: { type: "string", format: "date" },
    tier: { type: "integer", enum: [0, 1, 2, 3, 4] },
    source_key: {
      type: "string",
      description: "Original tag, column, or GTFS field name.",
    },
    raw: {
      description: "Original token when the stored value was normalized. Not a separate piece.",
      anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
    },
    derived: {
      type: "boolean",
      description: "True when this value is a copy of another feature and must not be counted.",
    },
  },
};

const titles = {
  venue: "Venue",
  washroom: "Washroom",
  path: "PathSegment",
  transit: "TransitStop",
};

const ids = {
  venue: "https://access-maps.local/schema/venue.schema.json",
  washroom: "https://access-maps.local/schema/washroom.schema.json",
  path: "https://access-maps.local/schema/path-segment.schema.json",
  transit: "https://access-maps.local/schema/transit-stop.schema.json",
};

function recordSchema(tranche) {
  const keys = fields[tranche];
  const properties = {};
  for (const key of keys) properties[key] = { $ref: FIELD_VALUE_ID };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: ids[tranche],
    title: titles[tranche],
    type: "object",
    additionalProperties: false,
    required: ["id", "tranche", "region", "fields"],
    properties: {
      id: { type: "string", minLength: 1 },
      tranche: { const: tranche },
      region: { type: "string", minLength: 1 },
      fields: {
        type: "object",
        additionalProperties: false,
        required: keys,
        properties,
      },
    },
  };
}

const sourceRegistryEntry = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://access-maps.local/schema/source-registry-entry.schema.json",
  title: "SourceRegistryEntry",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "kind",
    "url",
    "download_url",
    "licence_name",
    "licence_url",
    "licence_id",
    "attribution",
    "retrieved_at",
    "tier",
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    kind: { type: "string", enum: ["osm", "gtfs", "municipal"] },
    url: { type: "string", minLength: 1 },
    download_url: { type: "string", minLength: 1 },
    licence_name: { type: "string", minLength: 1 },
    licence_url: { type: "string", minLength: 1 },
    licence_id: { type: "string", minLength: 1 },
    attribution: { type: "string", minLength: 1 },
    retrieved_at: { type: "string", format: "date" },
    tier: { type: "integer", enum: [0, 1, 2, 3, 4] },
    tier_note: { type: "string" },
    notes: { type: "string" },
  },
};

writeFileSync(join(schemaDir, "field-value.schema.json"), JSON.stringify(fieldValue, null, 2) + "\n");
writeFileSync(join(schemaDir, "venue.schema.json"), JSON.stringify(recordSchema("venue"), null, 2) + "\n");
writeFileSync(join(schemaDir, "washroom.schema.json"), JSON.stringify(recordSchema("washroom"), null, 2) + "\n");
writeFileSync(join(schemaDir, "path-segment.schema.json"), JSON.stringify(recordSchema("path"), null, 2) + "\n");
writeFileSync(join(schemaDir, "transit-stop.schema.json"), JSON.stringify(recordSchema("transit"), null, 2) + "\n");
writeFileSync(
  join(schemaDir, "source-registry-entry.schema.json"),
  JSON.stringify(sourceRegistryEntry, null, 2) + "\n",
);

console.log(
  "schemas written",
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.length])),
);
