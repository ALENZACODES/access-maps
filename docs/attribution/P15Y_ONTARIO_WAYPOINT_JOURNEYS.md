# P15Y — Ontario offline waypoint journeys and evidence review

Base: `access-maps` main `e7527654ec32edf7c125f2c8d09c48635de5c911`.

## Purpose

P15Y composes several route legs through requested waypoints using the existing
P15V snapshot intake and bounded route search. It does not build a new graph,
query a remote service, guess connections, or invent travel durations. A local
source remains the authority for every supplied node and segment fact.

The planner supports mandatory waypoints, distance and hop caps, an explicit
open-versus-ODbL export boundary, feature and node exclusions, a cap on
candidate combinations, and explicit allowance or rejection of UNKNOWN
accessibility. Reported NO segments cannot become a positive route. Conditional
routes retain the literal `UNKNOWN` token in their data and EN/FR summaries.

## New files

- `p15y-waypoint-journey.mjs`: bounded multi-leg composition, deterministic
  ranking, citation collection and English/French route summaries.
- `p15y-route-evidence.mjs`: dated evidence review per segment, confidence
  thresholds, independent source counts, export boundaries, bilingual notes.
- `p15y-journey-changes.mjs`: changes in routes and underlying sources,
  segments, nodes and places across independent offline snapshots; deterministic
  byte export with a SHA-256 digest of the emitted bytes.
- Matching `.test.mjs` files: Node's built-in test runner, no extra packages.

## Existing interfaces reused from merged main

- `p15v-ontario-model.mjs`: `parseOntarioSnapshot`, `diagnostic`,
  `orderIssues`, `dayNumber`, and `french`.
- `p15v-ontario-routing.mjs`: `planOntarioRoutes` and `routeProvenance`.
- `p15v-fixtures.mjs`: fictional-only test fixture helpers.

These dependencies already exist on the specified main commit and are not copied
into this change. No existing source, `package.json`, lockfile or workflow changes
are necessary: the existing `docs/attribution/*.test.mjs` test glob covers all
three new test suites.

## API examples

```js
import { planWaypointJourney } from './p15y-waypoint-journey.mjs';
import { explainWaypointJourney } from './p15y-route-evidence.mjs';
import { auditWaypointChanges } from './p15y-journey-changes.mjs';

const request = {
  start: 'node-a',
  end: 'node-c',
  via: ['node-b'],
  silo: 'open',
  allowUnknown: true,
  maximumMetres: 2000,
  maximumHops: 30,
  alternatives: 3,
  avoidFeatures: [],
  avoidNodes: [],
  requiredFeatures: [],
  maxCandidates: 30,
  maxUnknownSegments: 10,
};
const policy = {
  minimumTier: 1,
  maximumAgeDays: 45,
  asOf: '2026-11-19',
  includeUnknown: true,
  includeBarriers: true,
  maximumNotes: 1000,
  minimumIndependentSources: 1,
};

const routes = planWaypointJourney(completeLocalSnapshot, request);
const report = explainWaypointJourney(completeLocalSnapshot, request, policy);
const changes = auditWaypointChanges(previousLocalSnapshot, completeLocalSnapshot,
  request, policy);
```

The example identifiers are illustrative; callers must supply complete local
snapshots. No live accessibility statements are embedded.

## Guarantees and boundaries

1. The incoming P15V snapshot passes the full original intake gate before any
   waypoint search. Missing, future-dated, unlicensed or inconsistent evidence
   blocks that snapshot, rather than leaving a partial route visible.
2. Every leg is an actual P15V route from one requested stop to the next.
   Candidate combinations are capped, ranked by distance, then uncertainty,
   then stable edge signature. Reaching the cap fails closed.
3. Every route section is accompanied by the original source identifiers and
   dated observations. The evidence policy is explicit and bounded. A report
   makes no positive claim from missing observations or conflicting facts.
4. The change audit compares both complete local snapshots and reports path
   loss, path gain, altered segments, source changes, downgraded tiers and
   changed access assertions. An earlier snapshot date cannot exceed the later
   date. The audit does not silently substitute newly loaded data.
5. Hashes in the change report identify the serialized report bytes only; they
   are not evidence that a real-world route is currently accessible.
6. This feature does not fetch data, publish information, contact users, or
   schedule checks. It does not handle private user data.
7. EN/FR diagnostics use Canadian spelling and required typography: right
   apostrophe, nonbreaking space before colon, narrow nonbreaking space before
   semicolon, exclamation mark and question mark and inside guillemets.

## Running tests

```sh
node --test docs/attribution/p15y-*.test.mjs
node --check docs/attribution/p15y-waypoint-journey.mjs
node --check docs/attribution/p15y-route-evidence.mjs
node --check docs/attribution/p15y-journey-changes.mjs
```

A repository-wide gate is still required after applying this ZIP to the exact
current main and installing its dependencies. The standalone suite does not
replace repository-wide lint, TypeScript and integration checks.
