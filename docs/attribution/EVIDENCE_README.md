# Release evidence and attribution audit

The public entry point is `docs/attribution/index.ts`. Its existing
`buildAttributionPage` function remains the single attribution catalogue used
by the map UI. The release evidence functions are re-exported from that entry
point; no second provider catalogue is introduced.

## Purpose

`evidence-contract.ts` parses an explicit, versioned release manifest. It
rejects unknown fields, unsupported versions, unsafe URLs, duplicate IDs,
malformed dates, oversized JSON and ambiguous control states. `UNKNOWN` is a
literal value, not a request to guess. Parsing is local and makes no requests.

`evidence-audit.ts` checks included sources for source URL, licence evidence,
redistribution permission, acquisition and terms-review dates, and required
notices. OSM map credit and ODbL terms are evaluated separately. Metrolinx AUA
section 3 and its applicable-laws lines belong to AUA evidence; the Metrolinx
OGL notice belongs to separately recorded OGL evidence. LTC terms remain
identified separately. A provider name alone never establishes permission.

`evidence-changes.ts` compares two supplied release inventories, reports removed
sources and accessibility regressions, and distinguishes new findings from
resolved findings. It uses neither a clock nor a remote endpoint.

`evidence-report.ts` renders printable, standalone EN/FR HTML or plain text.
HTML output escapes record content, includes a restrictive CSP, offers skip
navigation and a readable source/surface structure, and uses 44 px link
minimums. Generated reports are not an assessment of actual accessibility.

## Entry-point example

```ts
import {
  parseReleaseJson,
  auditRelease,
  renderAuditHtml,
} from "./index.js";

const inventory = parseReleaseJson(rawJsonFromLocalFile);
const result = auditRelease(inventory, { requireOffline: true });
const report = renderAuditHtml(inventory, result, "fr");
```

Input is supplied by an operator. No data is bundled and no job is scheduled.
A clean audit means the supplied evidence meets this module's rules; it does
not establish conditions that have not been observed or recorded.

## Tests

Existing root `vitest run` includes `docs/**/*.test.ts`, so the new executable
tests run with the repository's current test command. Tests exercise the public
entry point, strict parsing, malformed records, missing licences, notice
selection, release gating, comparisons, translations, escaping, and offline
report markup. The tests intentionally fail when the required evidence or
licence notices disappear.

All new files are under `docs/attribution/`; the root test scripts and existing
map UI are unchanged. A full repository checkout is required to run all
workspace-level lint, typecheck and test commands before merging.
