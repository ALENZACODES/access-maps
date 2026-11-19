# P15V — Local Ontario accessibility routing evidence

This module implements an offline-only, deterministic route evaluation over a caller-supplied, fully attributed Ontario graph. It does not fetch operator feeds, infer live conditions, read accounts, publish claims, or start scheduled work. All fixture locations and descriptions are fictional; they are not maps of real venues. A caller must supply a complete snapshot with real, permissible sources before using a result in any public-facing application.

## Files

- `p15v-ontario-model.mjs`: exhaustive shape and evidence checks. Keeps missing access `UNKNOWN`, requires a permissible source for each asserted condition, and rejects mixed licence groups.
- `p15v-ontario-routing.mjs`: bounded graph search, alternate paths, conditional routes, provenance closure, and route support checks.
- `p15v-ontario-impact.mjs`: deterministic change events between two complete snapshots and downstream route impacts.
- `p15v-fixtures.mjs`: fictional local fixtures for tests. No external source is represented as an actual surveyed venue.
- Three matching `.test.mjs` suites: independent scenarios for bilingual copy, data bounds, route correctness, date windows, reference closure, and graph changes.

## Required data contract

The root object contains only `version`, `asOf`, `maxAgeDays`, `sources`, `places`, `nodes`, `edges`, and `assets`. Version is exactly `1`. `asOf` and observation dates are calendar-day strings without timezone ambiguity. There is no default date: callers must supply the exact day that anchors their dated facts.

All place, node, and edge records require an identifier, bilingual name, accessibility feature and state, evidence tier, source IDs, observation list, and licence export group. Places link to node IDs; nodes link to their containing places; edges link to both node endpoints. Every internal identifier must resolve. Nodes have Ontario-bounded geographic coordinates, but those bounds do not certify the coordinates or the existence of a venue. Segment metres are caller-supplied and bounded; no walking distance is inferred from straight-line geometry.

Source records require a bilingual name, type, open-licence identifier, observation day, local reference, and export group. The current allowlist is deliberately narrow. ODbL data is kept in its own export group; mixing with the open group fails the entire snapshot. All records in an export group must reference compatible sources. No network endpoint, address, account detail, credential, or user-supplied contact information is necessary.

Evidence contains `sourceId`, `feature`, `access`, `observedOn`, and `tier`. A positive or negative accessibility statement must be backed by a matching dated observation. A missing observation cannot become a positive access claim. Tier 0 never supports an asserted access state, tier 1 remains `UNKNOWN`, and tier 3 uses at least two independent matched sources. Contradictory YES and NO observations require `UNKNOWN`. A snapshot with any unsupported assertion fails closed.

Asset declarations have a local path, byte count, SHA-256 digest, source IDs, and export group. The model checks metadata and references. It does not claim to check actual stored bytes; the caller must use a separate byte-level integrity check before treating a locally held asset as complete.

## Route policy

Route requests require both endpoints, an export group, explicit `allowUnknown`, distance and hop limits, an alternative count, and feature avoidance choices. Defaults are intentionally not supplied: omission is a malformed request. The route planner only traverses existing supported graph edges. A reported NO blocks traversal. UNKNOWN blocks traversal by default. Explicitly allowing UNKNOWN may return a **conditional** route, preserving the UNKNOWN state on the affected segments. It is never converted to YES.

Paths are ranked by supplied distance and stable identifiers. Simple paths only: no node or segment may repeat within one candidate. Search work is bounded to avoid unbounded memory and processing. Failure to find a path is reported as `absent`, not as evidence that a route is inaccessible everywhere. Endpoints cannot be connected across licence export groups.

Each route retains the segments, relevant source IDs, observation dates, access state, evidence tier, and English/French labels. The helper `routeProvenance` returns a deterministic source-and-observation closure. The helper `compareRouteSupport` can flag a previously selected route that loses a segment, has a new reported barrier, loses source evidence, or has a lower evidence tier.

## Change-impact policy

`inspectOntarioDelta(before, after)` validates both complete snapshots independently. It rejects a backwards snapshot clock and returns deterministic source, place, node, edge, and asset events. A removed record is reported, not silently suppressed. `impactOnRoute` separately plans against both snapshots and reports changed routes, changed status, and relevant provenance events. It does not conclude an observed field change is a live outage or attribute the cause of a change.

The delta is an analysis of supplied local data, not a live feed. Inferences about actual access must be made by a qualified responsible reviewer using original source evidence.

## Usage

```js
import { parseOntarioSnapshot } from './p15v-ontario-model.mjs';
import { planOntarioRoutes } from './p15v-ontario-routing.mjs';

const parsed = parseOntarioSnapshot(candidate);
if (!parsed.ok) {
  // Display the bilingual errors and block any publication/export.
} else {
  const outcome = planOntarioRoutes(parsed.snapshot, {
    start: 'entrance-a',
    end: 'entrance-b',
    silo: 'open',
    allowUnknown: false,
    maximumMetres: 2000,
    maximumHops: 30,
    alternatives: 3,
    avoidFeatures: [],
  });
  // Conditional, absent, and blocked statuses must not be displayed as confirmed access.
}
```

## Integration and local checks

The files use only the Node `crypto` built-in and imports provided in this same package. They are located under `docs/attribution` so the current root `node --test docs/attribution/*.test.mjs` command discovers the three suites without editing `package.json` or altering existing test globs.

Run `node --test docs/attribution/p15v-*.test.mjs` from repository root. Run the usual repository lint, typecheck, and test gates after applying the files to a complete checkout. This package deliberately contains no workflow definitions, release hooks, generated sample datasets, lockfile edits, or automated publishing actions.

The feature does not make WCAG conformance claims. It provides a foundation for evidence-aware map and route experiences with explicit unknowns and consistent bilingual diagnostics.
