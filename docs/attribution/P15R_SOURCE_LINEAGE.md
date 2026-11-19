# P15R — local source-lineage audit

Built against access-maps `main` at `2ba0c389deaa0af6ddf0770474e8b5b7cb50c34e`.

P15R adds a deterministic source-graph gate for offline exports. It does not access the
network, inspect the current clock, write output, or start background processing.
The caller supplies `asOf` as an ISO calendar day; date comparisons are fully
repeatable. Both English and French diagnostics are supplied for every failure.

## Input schema

```js
{
  asOf: '2026-11-19',
  sources: [{
    id: 'city', en: 'City open data', fr: 'Données municipales',
    licence: 'OGL-ON-1.0', observedOn: '2026-11-17',
    parents: [], tier: 3, reference: 'sources/city.json'
  }],
  records: [{
    id: 'library', en: 'Library', fr: 'Bibliothèque',
    observedOn: '2026-11-18', tier: 2, access: 'YES',
    sourceIds: ['city'], silo: 'open',
    evidence: [{ sourceId: 'city', observedOn: '2026-11-18', access: 'YES' }]
  }],
  assets: [{
    id: 'map', path: 'pack/map.json', sha256: 'a'.repeat(64), bytes: 42,
    sourceIds: ['city'], silo: 'open'
  }]
}
```

Each source may cite other source identifiers in `parents`. The chain must be
acyclic, bounded, dated in order, and consistent with its own confidence tier.
Licence boundaries propagate through source ancestry. Source and asset paths
must be relative local paths. Asset digests are syntactically checked; the caller
must independently check that the actual asset bytes match the digest before
publishing or relying on any file. P15R does not read asset bytes.

Records with an asserted access value require a matching dated observation and
at least tier 2. Conflicting YES/NO observations block an asserted value.
Unknown access may remain at tier 0 or 1 without an access assertion. Tier 3
requires tier 3 sources. Open and ODbL exports cannot mix source ancestry.

## Usage

```js
import { auditSourceLineage, sourceLineageText } from './p15r-source-lineage.mjs';
const result = auditSourceLineage(candidate, { maximumAgeDays: 365, maximumTier: 3 });
if (!result.ok) {
  process.stderr.write(sourceLineageText(result, 'fr'));
  // Stop this export. Do not use result.plan; it is null on failure.
}
```

The result is `{ ok, findings, plan }`; findings are sorted by JSON-like path and
code. Each finding has `code`, `path`, `en` and `fr`. The plan is non-null only
when every check passes. Sources, records and assets are sorted by identifier to
make exports reproducible. No caller-owned object is modified.

The module is intentionally independent of other P15 experimental files. It
imports no local modules or third-party packages. This allows it to be installed
from a complete-file ZIP without depending on another unmerged P15 branch.

## Local checks

Run `node --check docs/attribution/p15r-source-lineage.mjs`,
`node --check docs/attribution/p15r-source-lineage.test.mjs`, and
`node --test docs/attribution/p15r-source-lineage.test.mjs`.

The existing root `npm test` command already includes
`node --test docs/attribution/*.test.mjs`. No package, runner or workflow edits
are required. This gate does not substitute for broader repository tests, source
licence review, byte-level digest inspection, or the human release decision.
