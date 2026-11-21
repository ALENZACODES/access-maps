# P18 Offline notice bundle composer

The standalone `bundle.html` page provides a local, explicit workflow for building
source-and-licence disclosure pages for the App. It is linked from the existing
attribution index. The browser route performs no fetch or polling and retains
data only in memory. Import is bounded and validates the entire JSON document
before replacing the working document. A person deliberately exports files.

## Data contract

`bundle-core.mjs` is the only parser for `map-notice-bundle/1`. The register
contains sources, publication views, assets, source-use joins, bilingual notices,
and observations. Every source record contains `sourceUrl`, `licence`,
`licenceUrl`, `retrievedOn`, `tier`, `permission`, and `credit`, plus an optional
UNKNOWN-valued dataset date. The parser rejects extra keys, duplicate IDs,
unresolved cross-record references, invalid dates, unsafe local paths and
non-HTTPS external URLs. Explicit `UNKNOWN` is preserved, not synthesized.

The composer does not infer whether a source may be distributed based on the
provider's name or licence family. It does not infer accessibility information
about a place. All examples are labelled fictional and are used only in tests.
The source and permission data is explicitly supplied by the operator.

## User-facing workflow

Open `bundle.html?lang=en` or `bundle.html?lang=fr`. Import a local register,
select the publication view and language, then preview the proposed disclosure.
Add or edit records directly; the in-memory bundle passes the strict parser
after each save. The missing-notice list shows outstanding source-use/language
slots. The audit shows metadata gaps and records when 44 CSS-pixel evidence,
keyboard evidence, or screen-reader evidence is absent. The app does not make
an automated claim of WCAG conformance from those records.

The **Download disclosure page** action creates a standalone HTML document with
its notices, source and licence links, source dates, retrieval dates and evidence
tiers. It contains no executable script, external styles, fonts, tiles, or images.
It is explicitly marked draft when required evidence is absent. Its narrow
`style-src 'unsafe-inline'` rule supports the self-contained stylesheet; the
export blocks scripts, connections, forms and images. The interactive editor
has the stricter `style-src 'self'` policy and no external requests.

The source manifest JSON includes the precise records behind a selected view.
The bilingual findings report and TSV coverage sheet can be saved locally.
The TSV writer neutralizes formula prefixes and removes row separators from
supplied text. Comparison with a prior file is explicitly invoked by the user.

OpenStreetMap geometry requires exactly `© OpenStreetMap contributors` near
maps using that geometry. Its ODbL data is not silently merged with separately
licensed source records. Mixed families receive an explicit review finding.
GO/UP and LTC information may be entered with actual source evidence; no data
or entitlement is invented. MiWay is not introduced by this feature.

## CLI

Use Node 22 or later:

```sh
node docs/attribution/bundle-cli.mjs bundle.json --format audit
node docs/attribution/bundle-cli.mjs bundle.json --view map-en --lang fr --format html --output disclosure.html
node docs/attribution/bundle-cli.mjs bundle.json --format tsv --output coverage.tsv
```

The CLI returns 0 if no blocking metadata findings occur, 1 for blocking
findings, or 2 for invalid input, options or file I/O errors. Exit 0 means
only that the supplied register has no blocking *metadata* gaps. It never
indicates physical access, permission to redistribute, or legal compliance.
No scheduled workflow, keep-awake ping, secret or network access is used.

## Tests and integration

Run `node --test docs/attribution/bundle-*.test.mjs` on a full checkout.
The root repository test glob already discovers all `*.test.mjs` files here.
The feature is served only if the existing static host publishes
`docs/attribution/`, and is not automatically added to a precache bundle.
The `index.html` replacement preserves the merged #108, #109, #112, #113,
and #117 entry points. The open #115 checklist is intentionally not used or
imported by this main-based feature. Manual keyboard, touch, screen-reader,
contrast and browser axe reviews remain necessary before deployment.
