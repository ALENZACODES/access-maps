# Local attribution reference pack

`reference.html` is a standalone, offline-capable page. It loads the local
`reference-route.mjs`, `reference-core.mjs`, `reference-audit.mjs`, and
`reference-report.mjs` modules and the local `reference.css` stylesheet.
The route reads only files selected by a person. It does not fetch datasets,
infer source permission, or write to storage without an explicit export action.
The deployed application must publish these files together for this page to
be reachable. Source and licence links require a connection when opened.

Each `attribution-reference-pack/1` record records its source, licence,
permission, evidence tier, source URL, licence URL, collection date, terms date,
and dataset date. An absent fact remains `UNKNOWN`. A provider name alone
cannot establish a feed licence. OSM map credit is distinct from ODbL terms;
Metrolinx AUA section 3 notices and the applicable-laws lines are distinct
from the OGL line; LTC terms are recorded separately. All displayed legal
notices come from the shared `attribution-utils.mjs` catalogue.

For a local release check or comparison:

```sh
node docs/attribution/reference-cli.mjs release.json --lang fr --format text
node docs/attribution/reference-cli.mjs release.json --before previous.json --format json
node --test docs/attribution/reference-*.test.mjs
```

The CLI returns 0 for a release without blocking findings under these
rules, 1 for blocking findings, and 2 for invalid inputs. No periodic job is
created. Passing the metadata gate does not establish conditions at a place,
trip, or service. Review deployed keyboard, screen-reader, and contrast
behaviour separately.
