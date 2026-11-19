# Offline attribution handoff gate

The `handoff.html` page and `handoff-cli.mjs` share a strict local-only data
contract, audit, release comparison and bilingual report renderer. This feature
tracks which recorded source notices may be included in a deliberate attribution
export. It does not export provider feeds, make assumptions about permissions,
connect to remote services or persist records automatically.

## Record contract

`attribution-handoff/1` records a release ID, a policy and arrays of sources,
publication surfaces and handoffs. Every source has an HTTPS origin, licence
name and URL, recorded permission, evidence tier, acquisition date, dataset
date, terms date, evidence URL, attribution notice and inclusion state.
Every surface records EN/FR language, source references, offline capability,
keyboard and screen-reader evidence, map credit, publication date and target
size. Every handoff declares recipient, explicit purpose, source/surface IDs,
format, scope, approval, dates and digest. Unavailable facts remain `UNKNOWN`.

The parser rejects unrecognised fields, including private addresses, contact
information and tokens. An included source requires explicit licence and
permission evidence. The OSM credit and ODbL data terms remain separate.
Metrolinx AUA and OGL notices are never considered interchangeable; the AUA
legend requires both applicable-law lines. LTC credits must identify LTC.
The shared `attribution-utils.mjs` on main remains the sole legal catalogue.

## Commands

```sh
node docs/attribution/handoff-cli.mjs handoff.json --lang en --format text
node docs/attribution/handoff-cli.mjs handoff.json --lang fr --format html
node docs/attribution/handoff-cli.mjs handoff.json --before previous.json --format json
node docs/attribution/handoff-cli.mjs handoff.json --date 2026-11-19
node --test docs/attribution/handoff-*.test.mjs
```

Status **0** means no blocking gaps under these rules, **1** means blocked
publication or regression, and **2** means an input error. Without an explicit
`--date`, the tool never assumes that the local system clock supplies an
approval or expiry date. The CLI reads local files and writes its report only
to standard output, never to an external service. The browser can read files
chosen by the person and export a report through a local download. The page
and its code work without a network connection once packaged by the host.

Public downloads must be attribution-only, explicitly approved and carry
paired English and French publication metadata. Dataset age stays UNKNOWN
unless a known dataset date was recorded. The checks concern metadata and
release readiness only; they do not assess actual access conditions or
establish compliance by themselves. Deployment needs manual keyboard,
switch, touch, screen-reader and contrast testing.

The existing root `npm test` command runs `node --test
docs/attribution/*.test.mjs` as one shell command (with no line break). No
changes to `package.json`, lockfiles, CI workflows or scheduling are needed.
