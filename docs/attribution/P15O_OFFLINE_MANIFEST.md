# P15O — bounded offline manifest assembler

The P15O module accepts a complete in-memory candidate plus caller-supplied local
file bytes. It produces a deterministic, attributed manifest or a sorted list
of blocking diagnostics. It does not open local files itself, connect to the
network, publish data, schedule work, or persist information.

## Invocation

```js
import { assembleOfflineManifest, manifestText } from './p15o-offline-manifest.mjs';
const result = assembleOfflineManifest(candidate, { 'files/local.json': payload });
if (!result.ok) process.stderr.write(manifestText(result, 'en'));
```

Callers must supply the complete record, source, and asset sets. The schema
requires `schemaVersion`, `asOf`, `maxAgeDays`, `silo`, `sources`, `assets`, and
`records`. Each source carries an identifier, name, open licence, safe relative
source reference, and observation date. Each offline asset carries an identifier,
relative path, attributed source identifiers, export silo, byte count, and SHA-256
hex digest. Each record carries an identifier, English and French labels,
feature, access state, evidence tier, source identifiers, referenced asset
identifiers, evidence observations, and silo.

A record's confidence tier is constrained by matching current observations.
Tier 0 is private, unknown, and has no observations. Tier 1 can remain
UNKNOWN. Tiers 2 and 3 require a supported known access state. Tier 3
requires two independent source identifiers agreeing on the state. Contradictory
YES and NO observations require UNKNOWN, which cannot be a tier 2 or 3 statement.

An unknown claim is not promoted by implication. Missing evidence, broken
links, unsupported licences, stale sources, missing bytes, digest mismatches,
unsafe paths, duplicate identifiers, and invalid bilingual labels block the
entire manifest. No partial asset set or partial record set is emitted.

The local-only export is capped at 32 MiB of declared asset bytes. The
assembler permits at most 5,000 sources, 10,000 assets and 20,000 records.
The upstream distributor remains responsible for file handling, provenance
retention, rights compliance, and any further package-format requirements.

## Tests

The repository's existing root `node --test docs/attribution/*.test.mjs`
invocation includes `p15o-offline-manifest.test.mjs` automatically. There is no
need to change package scripts, dependencies or workflow definitions.
Run the isolated test as follows:

```sh
node --test docs/attribution/p15o-offline-manifest.test.mjs
```

All imports are either Node built-ins or the sibling module included in this
same change set. The outputs have deterministic ordering to make review diffs
stable. Bilingual diagnostics use English and Canadian French.
