# Claim-to-source trace audit

The directly loadable `claim-trace.html` view and the CLI operate on locally
supplied, explicit evidence. They do not query provider feeds, guess licence
rights, evaluate physical access conditions, or save submitted files without
a person's deliberate export action. The source metadata is recorded per
claim, and display notices come from the existing attribution catalogue.

## Contract

The `attribution-claim-trace/1` JSON record contains a release ID and four
arrays: sources, references, claims, and publication surfaces. Every source
records a stable ID, provider, licence family, source name and URL, licence
name and URL, explicit permission, evidence tier, acquisition date, dataset
date, terms review date, attribution notice, and publication state. A
reference links to one source and carries a URL, date, language and tier.
Every claim identifies its supporting source IDs and reference IDs, language,
observation date, assertion text, publication state, and disclosure state.
Every surface links to explicit claims and sources and records whether it is
offline, keyboard operable, labelled for screen readers, and offers targets
of at least 44 pixels. Missing dates are `UNKNOWN`; they are not filled in
from the system clock.

The audit treats a publication claim as a concrete assertion requiring source
and reference records. An unrelated source cannot justify the claim. Included
sources must have their licence and permission recorded. OSM credit and ODbL
terms are independent requirements. Metrolinx AUA section 3 legend and both
applicable-laws lines are distinct from the Metrolinx OGL notice. LTC source
acknowledgement is retained. This metadata gate is not a substitute for an
accessibility assessment or permission from a rights holder.

## Local commands

```sh
node docs/attribution/claim-trace-cli.mjs release.json --lang fr --format text
node docs/attribution/claim-trace-cli.mjs release.json --before previous.json --format json
node --test docs/attribution/claim-trace-*.test.mjs
```

The CLI status is `0` when the supplied metadata produces no blocking
findings, `1` on a block or regression, and `2` for invalid input or an
unreadable local file. HTML/text/JSON report outputs are written only to
stdout. There is no cron job or scheduled operation.

## Publishing

When a static host includes the `docs/attribution/` directory, the page is
available at `claim-trace.html`. Include the page, stylesheet and the route,
core, audit, change and report modules. It also imports the existing
`attribution-utils.mjs` on main. A host application that does not publish
this directory must add the route explicitly; writing these files does not
alter the host router. The browser uses only local files and links are not
fetched by the audit. Labels and reports support English and French;
French label colons have U+00A0 before the colon.

Automated tests cover strict inputs, notice selection, missing evidence,
unsafe URLs, offline policy, comparisons, CLI process exit codes, HTML
escaping, language text and the actual route/import/readme wiring. Static
tests do not establish full WCAG 2.2 AA conformance; manually review the
page with keyboard, touch, switch and assistive technology in deployment.
