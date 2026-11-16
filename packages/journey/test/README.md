# Journey contract tests

Standalone Vitest reference-contract checks for journey observations,
profile-dependent routing, and conditions. The fixtures use synthetic
identifiers and dated, explicitly licensed source evidence.

Run through the repository's Vitest configuration if it discovers
`packages/journey/test/*.test.ts`.

These tests exercise a new, self-contained reference model rather than the
unknown production implementation. They are **not proof of production routing
conformance**. Adapt production results to these contracts to add integration
coverage without guessing existing module imports.

Missing, unsupported, or expired evidence remains `UNKNOWN`. A documented
barrier is `BLOCKED`; only complete positive evidence yields `PASS`.
ODbL-labelled fixture data is not merged or exported into other datasets.
