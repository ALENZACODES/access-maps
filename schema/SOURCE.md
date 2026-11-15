# Schema source

`ALENZACODES/access-main` package `@access-main/schema` is the source of truth for schema shapes and verification tier ids. The pin is commit `c89241dcd405f0885982bd5398c893a8a6ab6c15` on `main`, recorded in `schema/upstream-pin.json`. That commit is the merge of pull request 5.

`schema/service-alert.schema.json` is `packages/schema/schema/import/service-alert.schema.json` from that commit. `schema/upstream/service-alert.schema.json` is the same document. The two files match, including whitespace.

Import records in this repository use the same field-value envelope as `packages/schema/schema/import/field-value.schema.json` at that commit. The tier on each imported field is an integer: 0 open-data import, 1 operator claim, 2 peer-verified, 3 trained surveyor, 4 live feed. The canonical provenance object in access-main also allows tier `E` for a desk check. This import does not emit tier `E`.

`schema/upstream/field-value.schema.json` records the tier enum from that import envelope. `npm run check:schema` compares those tier ids, then runs that commit's `SchemaValidator` over every venue, washroom, path, and transit record. It does not validate a sample, and it does not drop fields to obtain a pass. Washroom `posted_date` is allowed by the pinned schema: an ISO date, or `UNKNOWN` when the source did not state one.

`schema/fields.json` is the field list for the generated record schemas. It matches the access-main import field list, including `posted_date` on washrooms. That field carries the City of Toronto `PostedDate` column.

Record schemas in `schema/*.schema.json` are generated from `schema/fields.json` by `npm run build:schemas`. Do not edit the generated files by hand.
