import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { Tranche } from "../model/records.js";

export interface Validators {
  records: Record<Tranche, ValidateFunction>;
  source: ValidateFunction;
  alert: ValidateFunction;
}

export function compileValidators(schemaDir: string): Validators {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const files = readdirSync(schemaDir).filter((name) => name.endsWith(".schema.json")).sort();
  const fieldValue = files.find((name) => name.startsWith("field-value"));
  const ordered = fieldValue ? [fieldValue, ...files.filter((name) => name !== fieldValue)] : files;
  for (const name of ordered) {
    ajv.addSchema(JSON.parse(readFileSync(path.join(schemaDir, name), "utf8")));
  }
  return {
    records: {
      venue: mustCompile(ajv, "https://access-maps.local/schema/venue.schema.json"),
      washroom: mustCompile(ajv, "https://access-maps.local/schema/washroom.schema.json"),
      path: mustCompile(ajv, "https://access-maps.local/schema/path-segment.schema.json"),
      transit: mustCompile(ajv, "https://access-maps.local/schema/transit-stop.schema.json"),
    },
    source: mustCompile(ajv, "https://access-maps.local/schema/source-registry-entry.schema.json"),
    alert: mustCompile(ajv, "https://access-maps.local/schema/service-alert.schema.json"),
  };
}

export function validationError(id: string, errors: ErrorObject[] | null | undefined): string {
  const detail = (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`).join("; ");
  return `${id}: ${detail}`;
}

function mustCompile(ajv: Ajv2020, id: string): ValidateFunction {
  const validate = ajv.getSchema(id);
  if (!validate) throw new Error(`schema not compiled: ${id}`);
  return validate;
}
