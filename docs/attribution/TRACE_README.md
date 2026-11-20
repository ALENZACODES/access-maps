# P18 map notice trace explorer

A user-facing static route, `trace.html`, to build and inspect the relationship
between local map display surfaces, displayed data layers, explicit upstream
sources and the notices rendered for each source/layer/surface combination.
It is a documentation workbench, not a source of place accessibility data.

It works without network access or persistent storage once its three browser
files and imported modules are installed at their relative paths. Its CSP
forbids script network connections. The only imported files are within this
feature round. No provider catalogue is duplicated or replaced: the person
must input each exact source credit and licence reference relevant to their
actual data. OSM attribution is checked against the exact string
`© OpenStreetMap contributors`; it is never inferred from the word "map".

## Data model

`map-notice-trace/1` has `title`, `sources`, `layers`, `surfaces` and `notices`.
Each source supplies its source HTTPS URL, licence, licence HTTPS URL,
retrievedOn date, evidence tier, permission state and exact credit. A layer
lists its source IDs, separately names geometry-source IDs, targets one or
more display surfaces, and has an explicit inclusion state. Each surface
records a local route and locale, map presence and observed interaction
checks, including minimum measured target size. A notice records source,
layer, surface, locale, text, placement, exposure, keyboard/assistive reading
observations and observedOn date. The source and notice records are distinct:
adding a source never asserts a credit has been displayed.

Missing dates, licence facts, observations, surface route, sizes, and rights
use `UNKNOWN`. Nothing fills these fields from the time or the provider name.
Only included layers enter the blocking publication check. Included layers
must have a notice for each of their sources on each chosen display surface.
OSM geometry has an extra adjacent-map-credit requirement. The audit rejects
missing source evidence, missing notice text, non-visible credits, unsupported
permission and undocumented keyboard/reading observations. A finding-free
metadata audit does not replace physical checks of rendered pages.

The comparison mode reads an earlier trace in memory and reports removals
and changes to included-layer source evidence and notice placement. It also
runs the full audit of the candidate. The report is exported only by explicit
user action. The file chooser rejects files larger than 1 MiB; the parser
rejects unknown JSON keys, duplicate IDs, wrong references, invalid
calendrical dates and malformed or unsafe URLs.

## Integration

The `docs/attribution/index.html` change links to `trace.html` without touching
the existing catalogue or any other application router. A deployment that
publishes this directory must ship all listed `trace-*` files. The current
app SPA will not acquire a route unless it separately serves this directory.
No data feed, scheduled workflow, telemetry, or storage operation is added.

## Tests

The root `npm test` already includes `node --test docs/attribution/*.test.mjs`.
The new `trace-*.test.mjs` suites exercise the exact browser-safe modules,
record creation/import/export, reference integrity, notice coverage, OSM,
UNKNOWN and blocking audit, comparisons, locale text and static page wiring.
Run the repository-wide lint, strict typecheck, web pack/precache budget and
full browser accessibility tests on the actual checkout; standalone source
checks do not establish WCAG 2.2 AA compliance.

## Coverage matrix

A separate coverage matrix shows each expected source credit for every included
layer/view combination. It distinguishes a missing notice, an incomplete
display observation, a documented display and whether adjacent map credit
was recorded for OpenStreetMap geometry. Filtering by source or view never
adds data. The matrix is exported as a local TSV file, with leading formula
characters escaped for safer opening in spreadsheet software. The export
contains provenance and credits, not real-world place attributes. The
`trace-matrix.mjs` pure module also provides per-view and per-source rollups
for local review and tests.
