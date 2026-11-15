# Manual ingest orchestrator

This workspace package registers licence-reviewed importers for **the App**. It provides
only a manually invoked CLI and an import-hook library. No backend, scheduling,
network submission, publication or accessibility inference is implemented here.

## Run

With the existing workspace TypeScript and Node typings installed:

```sh
npm run build --workspace @access-maps/ingest-orchestrator
node packages/ingest-orchestrator/dist/cli.js packages/ingest-orchestrator/registry.seed.json --dry-run
node packages/ingest-orchestrator/dist/cli.js ./operator-registry.json --output-dir tmp
```

`--dry-run` prints eligibility without running importers or writing a report.
A real run loads the **local** `importerModule` (relative to the registry JSON)
and calls its default exported function with the source entry. The hook must return
`{ read, emitted, held }` with nonnegative integer counts; `emitted + held <= read`.
The package does not implement D, H, J12 or transit importers. A confirmed source
without a registered hook is an error, never a silent successful import.

`run(registry, hooks, { outputDir, now })` is also available as a library API.
It writes `reports/ingest-<ISO>.json` under `outputDir` (default `tmp`), with
source, licence evidence, run dates, counts, skipped sources and errors. The ISO
filename replaces colons with hyphens for portability. `now` is injectable for
repeatable tests. Reports are created exclusively, not overwritten; choose a new
run time or output directory for repeated runs in the same millisecond.

## Licence and integrity policy

Entries must be `confirmed` **and** use ODbL, OGL-Ontario, OGL-Canada,
CC-BY or CC0, with an HTTPS licence URL, a dated human verification and a
nonempty evidence note. ODbL must set `shareAlike: true`; all other listed
licences set it false. A source failing any check is skipped and reported, even
when a hook exists. The seed holds TTC feeds and GO Transit, UP Express, MiWay
and LTC pending their own licence confirmation; never flip a source based on
assumption. D/H/J12 entries are placeholders for the owners' importers.

Importers are responsible for preserving the canonical field shape
`{ value | "UNKNOWN", source_id, licence, retrieved_at, tier, source_key?, raw?, derived? }`.
Unknown stays UNKNOWN; this orchestrator assigns no tier, never promotes drafts,
and never writes to OSM. A human must verify drafts before export. Keep ODbL
output in a physically distinct dataset from OGL/CC output, preserving attribution
"© OpenStreetMap contributors, ODbL" for OSM-derived presentations. Do not
bundle output into service-worker precache; load regional data on demand.

## Human operation

See [CADENCE.md](CADENCE.md) for suggested checks. Operators may run this
command themselves or in a **pull_request job triggered by a person**. Never
use `on: schedule`, a timer, a polling loop or a keep-awake ping. This package
installs no workflow. `--schedule`, `--cron`, `--interval` and `--poll` are
rejected rather than ignored. No importer sends contributions to a server;
contributions can only leave the user's device by manually exported files.
