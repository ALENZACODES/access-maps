import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = JSON.parse(readFileSync(join(root, "schema/upstream/field-value.schema.json"), "utf8"));
const local = JSON.parse(readFileSync(join(root, "schema/field-value.schema.json"), "utf8"));
const expected = [0, 1, 2, 3, 4];
const upstreamTiers = upstream.properties?.tier?.enum;
const localTiers = local.properties?.tier?.enum;
if (JSON.stringify(upstreamTiers) !== JSON.stringify(expected)) {
  throw new Error(`upstream tier enum is ${JSON.stringify(upstreamTiers)}, expected ${JSON.stringify(expected)}`);
}
if (JSON.stringify(localTiers) !== JSON.stringify(expected)) {
  throw new Error(`local tier enum is ${JSON.stringify(localTiers)}, expected ${JSON.stringify(expected)}`);
}
if (local.$schema !== "https://json-schema.org/draft/2020-12/schema") {
  throw new Error("local field-value schema is not draft 2020-12");
}
const fields = JSON.parse(readFileSync(join(root, "schema/fields.json"), "utf8"));
if (!fields.washroom.includes("posted_date")) {
  throw new Error("washroom fields are missing posted_date");
}
console.log("schema source check ok: tiers 0-4 match access-main import field-value");
