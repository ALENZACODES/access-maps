# Seed-data deep sample

Day 30 tooling (master plan Appendix 5B, Day 30, task 3, and extended prompt 29). It reads seed files and does not change them.

## What it does

- Counts every record, piece, UNKNOWN gap, and derived value itself. The definitions match `counts.json`: a piece is a value that is not `UNKNOWN` and not derived.
- Reconciles those counts with a counts report (`--counts`), key by key. A tranche or source the report leaves out is listed as unreported.
- Takes a reproducible sample of 20 records per file (or per folder with `--sample-by directory`). The same seed and the same files give the same sample.
- Checks every field on every record:
  - **Blocker:** a missing source, licence, retrieval date, or tier; a tier above the prototype tiers (0, 1, `SEEDED-OPEN-DATA`, `PROTOTYPE-UNVERIFIED`); an unreadable line; a record without fields.
  - **Serious:** a blank value (a value the source does not state is `UNKNOWN`); a malformed or future date; a repeated id; a missing or unexpected field key when `--fields` is given.
  - **Review:** a dimension of 0, a derived measurement, one measurement value repeated across at least half of a file's populated values, and the same name from two sources within 25 m. These are prompts to check the source. They are not findings that the data is wrong.
- Opens a dated licence re-check for each registry source whose terms are not settled, are share-alike, have no licence recorded, or were retrieved more than 90 days before the audit. Owner and due date stay empty until a person sets them.

## What it does not do

It does not compare a record with its source or with a second source. The cross-check columns read "not checked" until the reviewer supplies entries with `--cross-check`. The tool gives no PASS or BLOCK verdict. The reviewer gives the verdict after reading the report and doing the cross-check.

## Use

```bash
cd tools/seed-audit
npm ci
npm test
npm run typecheck

# Seed files or folders. Labels in the report are relative to --root.
npm run audit -- ../../data/venues ../../data/washrooms ../../data/paths ../../data/transit \
  --root ../.. --counts ../../counts.json --fields ../../schema/fields.json \
  --sample-by directory --date 2026-11-14 --out ../../audit

npm run licences -- ../../sources/registry.json --date 2026-11-14 --out ../../audit
```

`audit` exits with 1 when a blocker is found or a count does not reconcile, and with 2 on a usage error.

Pass the tranche folders only. Service alerts in `data/alerts` have a different shape and are counted separately in `counts.json`.

A cross-check file is a JSON array of entries that the reviewer types:

```json
[
  {
    "recordId": "the sampled record id",
    "field": "wheelchair",
    "secondSource": "name of the second approved source",
    "secondValue": "what that source says",
    "result": "agrees",
    "checkedOn": "2026-11-14"
  }
]
```

`result` is `agrees`, `disagrees`, or `not-in-second-source`.

## Record shape

The reader takes `.ndjson`, `.jsonl`, either of those gzipped, or a `.json` array. Each record has `id`, `tranche`, and `fields`. Each field has `value`, `source_id`, `licence`, `retrieved_at`, and `tier`, as in the import records and the access-main import schemas. Tests use synthetic records only.
