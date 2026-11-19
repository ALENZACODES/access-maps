# P15S — Local offline delivery receipt

This increment is built against `access-maps` main `2ba0c389deaa0af6ddf0770474e8b5b7cb50c34e`.
It introduces a standalone, deterministic checker for a caller-supplied **local**
offline bundle. It does not load files, contact a server, submit a report,
schedule work, or publish data. A successful receipt is an internal inventory
result and does not assert a physical location's access status.

## Included files

- `docs/attribution/p15s-delivery-receipt.mjs`
- `docs/attribution/p15s-delivery-receipt.test.mjs`
- `docs/attribution/P15S_DELIVERY_RECEIPT.md`

The module imports `node:crypto` only. The test imports Node's assertion,
crypto and test modules plus the module included with this package. No package,
lockfile, TypeScript, root test script, workflow or external dependency change
is needed. The existing `node --test docs/attribution/*.test.mjs` root test
pattern discovers this suite.

## API

`auditOfflineDelivery(input)` accepts an object with the *exact* keys:
`schemaVersion`, `asOf`, `maxAgeDays`, `sources`, `places`, and `assets`.
The version is `1`. Dates are real Gregorian calendar days in `YYYY-MM-DD`
form. All supplied source and evidence dates must be no later than `asOf` and
must fit within the caller's `maxAgeDays` retention window. The caller must
supply the evaluation date explicitly; there is no wall-clock dependency.

Each source has `id`, `name`, `licence`, `observedOn`, and `reference`.
Supported open-licence identifiers are `CC0-1.0`, `CC-BY-4.0`,
`OGL-Canada-2.0`, `OGL-ON-1.0`, and `ODbL-1.0`. Source reference paths are
relative and local. The source name must not contain credentials, a personal
email address, unsafe markup, or control characters.

Each asset has `id`, `path`, `sha256`, `bytes`, `sourceIds`, `silo`, and
`present`. A `present: false` entry blocks the receipt; the caller must
establish actual local presence before invoking the checker. SHA-256 is a
required 64-character lowercase hexadecimal declaration. **This module does
not read the actual asset bytes**, so it cannot independently establish that
the declaration matches stored content. Its output must not be treated as a
cryptographic file-integrity confirmation. Local paths reject backslashes,
URL markers, query strings, traversal, empty segments and control characters.

Each place has `id`, `en`, `fr`, `feature`, `access`, `tier`, `silo`,
`sourceIds`, `assetIds`, and `evidence`. Every observation has `sourceId`,
`feature`, `access`, `observedOn`, and `tier`. Tier 0 and 1 keep UNKNOWN
without an access assertion. Tier 2 needs a matching dated observation;
tier 3 needs two independently sourced matching observations. Contradictory
YES/NO observations block asserted access. Unknown records still require a
source link. English and French text must both be safe; French punctuation
requires U+00A0 before colon and U+202F before semicolon and similar marks.

All ODbL-linked assets and places must remain in the ODbL silo. Missing
sources, missing assets, reused identifiers and duplicate observations block
the entire receipt. There is no successful partial output.

Returns `{ ok, findings, summary, receipt }`. `receipt` is `null` unless
`ok` is true. A successful receipt contains sorted source, place and asset
identifiers, a byte count, silo identifiers and a SHA-256 digest of a stable
JSON representation of **receipt metadata**. The digest is deterministic but
is not a digest of the original payload or of asset bytes. Each finding has
a stable code, JSON-path-like location, and human-readable English/French
messages. `deliveryText(report, locale)` formats the findings for `'en'` or
`'fr'` without I/O. Invalid locale input returns an empty string.

## Limits and tests

Maximum inputs: 1,000 sources, 10,000 places, 20,000 assets, 200 observations
per place and 32 MiB declared per asset. These are resource guards, not a
claim that the caller's assets have actually been inspected.

Run locally from the repository root:

```sh
node --check docs/attribution/p15s-delivery-receipt.mjs
node --check docs/attribution/p15s-delivery-receipt.test.mjs
node --test docs/attribution/p15s-delivery-receipt.test.mjs
```

For the repository-wide checks, run `npm run lint` and `npm test` from a
complete checked-out copy of the target main commit after applying this
package. Do not substitute isolated module checks for those gates.
