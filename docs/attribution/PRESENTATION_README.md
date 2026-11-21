# Notice Presentation Lab

The offline EN/FR presentation workbench previews explicitly supplied source notices across publication surfaces, viewport dimensions, theme and text scale. It renders static HTML previews and compares stored presentation snapshots.

The audit checks supplied source and notice records, exact OSM credit, near-map placement, recorded contrast, and observation coverage. A generated preview is not a measurement of a real deployed interface. A recorded pass is an operator-supplied observation, not a claim about all devices or users.

## Local validation

Run `node --test presentation-*.test.mjs`. The test suite includes schema rejection, rendering, exports, audit conditions, locale behavior, responsive viewport combinations, layout permutations and observation method/result combinations.

The page uses local ES modules, a restrictive CSP, visible focus indicators and controls with a 44px minimum height. No remote requests, scheduled jobs or background polling are used.
