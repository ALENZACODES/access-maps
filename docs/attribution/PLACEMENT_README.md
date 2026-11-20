# P18 notice placement planner

The `placement.html` route is linked in both languages from the existing
attribution index. Its user-facing entry point is `placement-route.mjs`, using
`placement-core.mjs`, `placement-audit.mjs`, `placement-messages.mjs`, and the
existing `attribution-utils.mjs` catalogue already present on access-maps
commit c4243218. There is no duplicate provider catalogue.

The planner lets a person create named publication views, record precisely
which catalogue sources each view uses, and document the physical placement
of source notices and licence information. Each source-use record explicitly
includes a source name, licence or terms, retrieval date, evidence tier, notice
text, the location of that notice, keyboard and screen-reader assessment,
minimum control target size and freeform notes. An unrecorded value is
`UNKNOWN`; adding a source never supplies fictional retrieval dates or claims.

Imports are strict, bounded, versioned JSON. Unexpected fields, invalid
calendar dates, duplicate IDs, unsafe external routes and malformed evidence
are rejected without replacing the current working plan. Export is a manual
local download of either the plan or a bilingual text findings report. Nothing
is saved automatically or transmitted to a remote system. This app uses only
the existing OSM, Metrolinx (GO/UP) and LTC catalogue entries. No MiWay data is
added or assumed.

The audit flags missing attribution, unknown source/licence/date/tier evidence,
missing licence access, incomplete keyboard and screen-reader records, and
targets below 44 CSS pixels. OpenStreetMap maps additionally require the exact
`© OpenStreetMap contributors` credit near the map. Required notices come from
the existing shared catalogue, not a second maintained list. The text is shown
as entered; the editor offers a deliberate insert action, not silent injection.

Source and licence references and recorded dates are user-supplied and not
publisher-certified. A passing planner report does not mean a publication has
permission to redistribute data, a view conforms to WCAG, or any place is
accessible. Manual testing with actual assistive technologies and the actual
release evidence is still necessary.

## Files in this patch

- `index.html`, `placement-link.css` — bilingual entry points, preserving the existing attribution route and CSP.
- `placement.html`, `placement.css`, `placement-route.mjs` — interactive standalone local-only page.
- `placement-core.mjs`, `placement-audit.mjs`, `placement-messages.mjs` — strict schema, audit and EN/FR text.
- `placement-core.test.mjs` — Node built-in unit and wiring tests; the root `npm test` already discovers `docs/attribution/*.test.mjs`.

No new dependency, workflow, timer, remote request, scheduled task, or generated
provider dataset is introduced. When deploying static files, include the
pre-existing `attribution-utils.mjs` alongside these files and retain the
existing attribution route scripts and styles. A complete repository checkout
is required to run its workspace-wide TypeScript, browser and pack-budget gates.
