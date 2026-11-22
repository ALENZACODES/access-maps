# P15M — Offline change journal

P15M compares two complete, locally supplied candidate catalogues. It is an
additional release-review gate, not a data source, publisher, live monitor,
network client, scheduler, or source of real-world access claims.

## Compare published map fields

To review the field values and source metadata in two map files, open the [field comparison](field-review.html?lang=en).

Pour consulter les changements de valeurs et de sources entre deux fichiers cartographiques, ouvrez la [comparaison des champs](field-review.html?lang=fr).

## Local API

`auditChangeSnapshot(candidate)` examines one catalogue without modifying it.
`compareChangeSnapshots(previous, candidate, policy)` examines changes only
if both candidates have passed their own structural checks. Both functions
return deterministic `{ ok, findings, summary }` objects. All findings include
English and French text, a code, and a stable record path.
`changeJournalText(result, 'en' | 'fr')` renders a plain text status.

A catalogue supplies `asOf` (calendar day), `maxAgeDays`, and arrays of
`sources`, `records`, and `assets`.

Every source needs a stable `id`, `name`, open `licence`, local `reference`, and
`observedOn`. Supported licences are CC0-1.0, CC-BY-4.0, OGL-Canada-2.0,
OGL-ON-1.0, and ODbL-1.0. A separate ODbL export is mandatory where an ODbL
source appears in a record or asset lineage.

Each record requires a stable ID, English and French labels, feature, access
`YES | NO | UNKNOWN`, tier `0 | 1 | 2 | 3`, observation day, source IDs,
observation chain, asset IDs, export silo, and an interactive target size.
Tier zero is nonassertive and contains no observations. Tier one can contain
observations while retaining an UNKNOWN access state. Tier two needs an
observation supporting any asserted access. Tier three requires two distinct
source identifiers supporting any asserted access. Unattributed, conflicting,
expired, and out-of-order observations block unsupported assertions. A
candidate with UNKNOWN never gains an asserted value automatically.

Each offline asset declares its ID, local path, SHA-256 digest, positive byte
count (at most 32 MiB), source IDs, and export silo. File bytes are not read
by this module; the digest is a declaration for a separate byte-checking gate.
Paths must be relative and must not contain traversal, encoded segments,
query strings, or fragments. The journal never claims to have checked bytes.

## Comparison and removal policy

A comparison requires a policy with *all* of these members:

```json
{
  "removedSources": [],
  "removedRecords": [],
  "removedAssets": [],
  "maximumRemovals": 0
}
```

Any removed identifier must appear in its matching policy array. Unused
removal permissions also fail. The maximum includes all three record kinds.
The policy cannot bypass snapshot checks. Reused source IDs cannot change
name, licence, or local reference. Existing offline asset IDs cannot silently
change their path, byte count, or digest. Record IDs cannot be reused for
other features, record observation history cannot be truncated, asserted
access changes require new matching evidence, and tier escalation needs new
matching observations. Any change to the English/French labels is reported
as a changed record in the deterministic summary.

## Running tests

The root repository already uses `node --test docs/attribution/*.test.mjs`.
P15M's tests are therefore included without changing package scripts, Vitest
configuration, or dependency versions:

```sh
node --test docs/attribution/p15m-change-journal.test.mjs
```

No package registry, secrets, transport feeds, cron workflows, or background
processes are needed. All 85 tests use invented fixtures, not real locations.

The journal has no third-party dependencies. Its test file imports only the
P15M module and Node built-ins; both files are in this delivery. Existing
repository code remains on the target main revision and is not reproduced.
