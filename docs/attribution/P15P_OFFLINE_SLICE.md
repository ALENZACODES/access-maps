# P15P — offline dependency-closed slice planner

This chunk adds a pure local planner for creating a small, attributed, offline subset of a caller-supplied catalogue. The tool does **not** download files, contact remote services, schedule work, publish content, infer accessibility conditions, or modify a catalogue.

## Scope and input

`planOfflineSlice(catalogue, request)` accepts a complete catalogue with `schemaVersion`, `asOf`, `maxAgeDays`, and arrays of `sources`, `records`, and `assets`. Each source has an identifier, display name, open licence, observation date and local reference. Each record has bilingual labels, a feature, an explicit YES/NO/UNKNOWN access value, a confidence tier, an export silo, source identifiers, asset identifiers, and dated observations. Each asset has a local path, digest, byte count, source identifiers, and export silo. The request supplies ordered record identifiers, one permitted silo, and maximum record/byte limits.

The planner applies checks to the complete supplied catalogue, not merely the selected entries, to avoid normalizing malformed inventory. On any error it returns `ok: false` with sorted bilingual diagnostics and **no** slice. It does not infer a condition from an absent observation or change UNKNOWN to YES. Tier 0 cannot contain assertions or observations, tier 1 does not support an asserted access condition, tier 2 needs matching dated evidence, and tier 3 needs two independent source identifiers with matching tier-3 evidence.

## Dependency closure

Every selected record retains its complete own source and asset references. Each selected asset also brings in its source references. The planner de-duplicates these dependencies and orders records, sources and assets by identifier, independently of request order. The output includes an exact byte total and a SHA-256 digest of the canonical, structured catalogue slice. This digest is an integrity label for the computed manifest; it is not proof that the underlying files have been loaded or checked against their declared digests. The caller must check the bytes of actual files independently.

The open and ODbL exports are separate. Any record or asset crossing an export boundary blocks the entire selection. Licences not explicitly included in the open list are rejected. A held operator feed, nonlocal reference, invalid date, broken relationship, malformed digest declaration, duplicate identifier, unsupported tier, or unsafe bilingual label also blocks the selection.

## Integration

The files are standalone ESM and import only Node built-ins. The existing root command already discovers `docs/attribution/*.test.mjs`, so there is no package script, dependency, or workflow change. The module can be used by a future offline export screen or an explicit local command after its caller supplies fully loaded data. It intentionally performs no I/O.

```js
import { planOfflineSlice, sliceReportText } from './docs/attribution/p15p-offline-slice.mjs';

const result = planOfflineSlice(catalogue, {
  ids: ['library'],
  silo: 'open',
  maximumRecords: 100,
  maximumBytes: 8_388_608,
});
if (!result.ok) process.stderr.write(sliceReportText(result, 'en'));
```

Run its focused checks with `node --test docs/attribution/p15p-offline-slice.test.mjs`. Test coverage includes locale punctuation, retention windows, leap days, evidence consistency, source references, tier rules, asset size and paths, open-licence boundaries, output determinism, source/asset closure and failure isolation.

## Base and packaging

Base: `ALENZACODES/access-maps` `main` at `6779df97b60c6e3d87ad33159eaa9798f2ec7954`, checked November 19, 2026. This ZIP contains only these three new paths. It does not include any changes from outstanding pull-request branches. Future changes on main require rebuilding against the then-current main.
