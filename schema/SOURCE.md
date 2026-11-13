# Schema source

`ALENZACODES/access-main` package `@access-main/schema`, branch `cursor/schema-package-61db`, is the source of truth for schema shapes and verification tier ids.

Import records in this repository use the same field-value envelope as `packages/schema/schema/import/field-value.schema.json` on that branch. The tier on each imported field is an integer: 0 open-data import, 1 operator claim, 2 peer-verified, 3 trained surveyor, 4 live feed. The canonical provenance object in access-main also allows tier `E` for a desk check. This import does not emit tier `E`.

`schema/upstream/field-value.schema.json` records the tier enum from that import envelope. `npm run check:schema` compares it with `schema/field-value.schema.json`.

`schema/fields.json` is the field list for the generated record schemas. It matches the access-main import field list, plus `posted_date` on washrooms. That field carries the City of Toronto `PostedDate` column. It is not in the upstream snapshot yet.

Record schemas in `schema/*.schema.json` are generated from `schema/fields.json` by `npm run build:schemas`. Do not edit the generated files by hand.
