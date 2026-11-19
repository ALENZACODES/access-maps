# Offline static-page attribution audit

`static-release.mjs` parses an operator-supplied `attribution-static-pages/1`
manifest with a source, licence, date, permission, evidence tier and notice
for each declared credit. `static-scan.mjs` examines the built HTML file
named by each page record. The scanner checks visible licence notices and
source links rather than accepting a manifest claim by itself.

The parser preserves `UNKNOWN` dataset dates without guessing recency, and
blocks unknown or denied rights for included credits. OSM map credits and
ODbL terms are checked separately. Metrolinx AUA section 3 and its two
applicable-law lines are distinct from the OGL statement. LTC terms are kept
separate. This scanner does not assess real-world accessibility.

Run the read-only offline CLI from the repository root:

```sh
node docs/attribution/static-cli.mjs release.json --root dist --lang fr --format text
node docs/attribution/static-cli.mjs next.json --root dist --before previous.json --before-root old-dist --format json
node --test docs/attribution/static-*.test.mjs
```

Exit 0 means no blocking findings in the supplied files; 1 means publication
blocked; 2 means invalid input or inaccessible files. The CLI writes nothing
and contacts no third party. It refuses symlink file components and paths
outside its supplied build root. The HTML report is standalone and CSP-bound.

This is a static inspection, not a substitute for testing rendered CSS,
keyboard interaction, focus visibility, screen readers, or the actual
published pages. A recorded target size of 44 pixels is evidence supplied by
the release operator; it does not establish the rendered target dimensions.

The root `npm test` command already discovers `docs/attribution/*.test.mjs`.
No new package scripts, scheduled workflows, or build data are necessary.
