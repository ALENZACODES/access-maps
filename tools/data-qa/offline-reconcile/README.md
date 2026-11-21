# Offline evidence reconciliation (P15M)

Local publication workbench for the App / l’App. Open from a workstation with
`npm run data-qa:reconcile`; visit the printed `127.0.0.1` URL. No remote
service, third-party tiles, account, upload or background schedule is used.

Choose a current JSON package and select **Check publication**. For a release
comparison, also choose the prior JSON package and optionally a removal-policy
JSON file. Without a removal policy the comparison does not authorize removals.
Exports include findings and aggregate counts only, not raw observation notes.

## File contracts

A package has schemaVersion=1; a policy containing `asOf`, `maxAgeDays`,
`maxSourceAgeDays`, `maxObservations`, `maxSources`; arrays `sources`,
`observations`, and `decisions`. Every source records ID, name, open licence,
observation date, `retrievedOn` calendar date, integer `tier` from 0 through
4 and a local reference. A source’s retrieval date is distinct from its
observation date. Both observations and decisions cite at least one source,
including records with state `UNKNOWN`. Legacy packages remain reviewable and
generate blocking findings for missing retrieval dates or tiers. Every observation records a state
`YES`, `NO`, or `UNKNOWN`, date, source IDs and EN/FR text. Each decision
records a feature, state, supporting observation IDs, source IDs and an
explicit `open` or `odbl` silo. Missing information remains UNKNOWN.

The audit blocks invalid/held sources, missing licences, absent lineage,
source dates beyond the policy, contradictory recorded states asserted as
known, unsupported known decisions, incorrect withdrawal history, and ODbL
silo crossing. No medical or eligibility advice is generated.

Run `npm run test:data-qa:reconcile`. All tests use Node’s built-in test runner. Pull requests that change the tool,
its workflow or the runner configuration exercise every local spec through
`.github/workflows/p15m-offline-reconcile.yml`.
The server only serves a fixed set of local assets and binds to loopback.
The page uses native labelled controls, visible focus, minimum 44px targets,
English/French interface text and a local screen-reader status region.

The P15J suites use the Node test runner with tsx, both in their dedicated
pull-request check and the root test command. Vitest excludes those four files.
