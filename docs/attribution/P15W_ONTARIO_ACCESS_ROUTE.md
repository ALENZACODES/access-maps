# P15W — Ontario access-route graph, profiles and impact checks

This package adds a local, offline-only route data layer to the Ontario maps lane. Every record in the sample is synthetic and does not describe the current accessibility of a real building, intersection, transport stop or road. No requests are sent to servers, no user location is collected, and no files are written by the modules.

## Inputs and ownership

`p15w-network.mjs` owns the snapshot intake. The expected top-level fields are `schemaVersion`, `asOf`, `maxAgeDays`, `sources`, `nodes`, `edges` and `assets`. Every field must be present; unexpected fields are rejected. IDs are lowercase stable identifiers. Source records name an accepted open licence, a source-reference path, an observation date, and descriptions in English and French. Nodes describe locations in a broad Ontario envelope, not precise municipal boundaries. Edges connect two existing nodes with a route geometry, a measured distance, a gradient, a directionality flag, and an access observation chain. Asset declarations carry local paths, byte sizes, source IDs and SHA-256 declarations. This layer does not read the asset bytes; integrity of bytes requires a separate byte-aware audit.

The intake returns `{ ok, findings, network }`. On failure `network` is always `null`. Its findings have stable diagnostic codes and `en`/`fr` descriptions. No record can be treated as a positive access fact without a matching dated observation, a source relationship, and a supported evidence tier. `UNKNOWN` remains `UNKNOWN`. Contradictory YES and NO observations cannot become a positive route claim. All source and licence references remain visible downstream. ODbL-linked items are kept in their separate export group.

## Coordinates, lengths and grades

`p15w-geometry.mjs` implements local geometry primitives. Distances use the haversine model and return metres. The broad envelope only screens wildly implausible locations; passing that screen does not establish that a coordinate is in Ontario. Geometry must begin and end within 15 metres of its referenced nodes. The reported length must agree with the polyline length within the larger of 25 metres or 25 percent, and each edge must declare a finite non-negative gradient. Survey-backed field measurements remain the responsibility of a separate source.

The helper exposes coordinate checks, distance, path length, azimuth, interpolation, nearest point on a segment/path, geometry grade, bounds, sampling and summaries. Null means invalid or unavailable input, not a positive physical accessibility claim.

## Route selection and uncertainty

`p15w-planner.mjs` consumes only the successful intake network. The planner builds a deterministic directed adjacency graph. A bidirectional edge yields two directed arcs, while a one-way edge yields one. Edges with inaccessible state `NO` are blocked. Edges or endpoints with `UNKNOWN` are blocked by default. Callers may request an explicitly uncertainty-aware path with `allowUnknown: true`; the resulting route is labelled `UNKNOWN` and carries IDs for every unknown edge/node it traverses. These settings do not make unknown evidence known.

The profile also carries user-supplied slope, maximum distance, maximum legs, transfer penalty, uncertainty penalty and excluded nodes/edges. These are routing preferences rather than a judgment about an individual. The bounded Dijkstra search preserves distance, weighted cost, leg count, source IDs, evidence tier and licence silo in its route output. A route is never combined across open/ODbL export groups. Alternative routes are bounded to ten, with deterministic ordering and duplicate-route suppression. Nearby-node searches accept caller-provided coordinates and do not query a geolocation service.

## Snapshot changes and route impact

`p15w-reconcile.mjs` accepts two complete input snapshots, audits each, and compares source identity, source observation dates, node location, access status, evidence tier, edge geometry and direction, attached evidence, local assets, and bilingual copy. An invalid snapshot blocks the comparison. A route impact report takes explicit source/destination requests and classifies route losses, gains, changes in path, changes in length, or new reliance on `UNKNOWN` evidence. It never silently changes the source of a route. The report does not fetch a new traffic feed or claim current conditions.

All messages are English/French and retain source IDs without translation. French user-facing text uses typographic apostrophes, U+00A0 before colons, and U+202F before semicolons, question marks and exclamation marks and inside guillemets. The conflict message includes a narrow no-break space before its semicolon.

## Running the tests

From the repository root:

```sh
node --test docs/attribution/p15w-*.test.mjs
node --check docs/attribution/p15w-network.mjs
node --check docs/attribution/p15w-planner.mjs
node --check docs/attribution/p15w-reconcile.mjs
```

The existing root `npm test` command already includes `node --test docs/attribution/*.test.mjs`, so adding another test runner or modifying `package.json` is unnecessary. The root TypeScript project includes `.ts` and `.tsx` files; these `.mjs` files are outside its compilation graph. No npm dependencies, lockfiles or workflow changes are required. A full checkout is needed to run repository-wide lint/typecheck/test gates in addition to these standalone checks.

## Files

The complete feature is made of nine new `.mjs` files (`p15w-geometry`, `p15w-network`, `p15w-planner`, `p15w-reconcile`, `p15w-fixtures` and four `.test` files), plus this contract. There are no imports from unmerged branches. The only imports are each other's included paths and built-in Node modules.
