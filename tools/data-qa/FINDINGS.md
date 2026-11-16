# Data QA findings for pack and registry records

`npm run check:strict-data` runs `checkStrictData` over `sources/registry.json`
and every `data/**/*.ndjson.gz` pack record (and `pack/v1` when that directory
exists). The job fails on undocumented violations. It does not fetch or
publish anything, and it is not scheduled.

## Licence identifiers outside the strict export allowlist

`checkStrictData` accepts only `CC0-1.0`, `CC-BY-4.0`, `ODbL-1.0`,
`OGL-Canada-2.0`, and `OGL-ON-1.0`. OpenStreetMap Ontario records already use
`ODbL-1.0` and pass that part of the gate.

These other source/licence pairs are in the registry and in packed records.
They may be used only under their own terms. They are **not** added to the
export allowlist. The CI job records the licence mismatch and still fails if
any other rule is broken (held MiWay sources, missing provenance, invalid
dates, ODbL leaking into the open silo, mixed licences on one record, or a
new undocumented licence).

| Source id | Licence in the repo | Note |
| --- | --- | --- |
| `gtfs-ttc` | OGL-Toronto-1.0 | Open Government Licence — Toronto |
| `toronto-park-washrooms` | OGL-Toronto-1.0 | Open Government Licence — Toronto |
| `toronto-street-washrooms` | OGL-Toronto-1.0 | Open Government Licence — Toronto |
| `toronto-crem-washrooms` | OGL-Toronto-1.0 | Open Government Licence — Toronto |
| `gtfs-rt-ttc-accessibility` | OGL-Toronto-1.0 | Open Government Licence — Toronto |
| `metrolinx-go` | Metrolinx Access and Use Agreement (accepted 2026-11-15) | Permissioned feed, own transit part |
| `metrolinx-up` | Metrolinx Access and Use Agreement (accepted 2026-11-15) | Permissioned feed, own transit part |
| `gtfs-grt-bus` | Region-of-Waterloo-Open-Data-Licence-2.0 | Region of Waterloo Open Data Licence v2 |
| `gtfs-grt-ion` | Region-of-Waterloo-Open-Data-Licence-2.0 | Region of Waterloo Open Data Licence v2 |
| `gtfs-brampton` | CC-BY | Attribution, version not specified; not `CC-BY-4.0` |
| `brampton-recreation-centres` | CC-BY | Attribution, version not specified; not `CC-BY-4.0` |
| `gtfs-hsr` | City-of-Hamilton-Open-Data-Licence | City of Hamilton Open Data Licence |
| `gtfs-ltc` | LTC Open Data Terms of Use | London Transit Commission terms |
| `kingston-public-washrooms` | Kingston-Open-Data-Licence-1.0 | City of Kingston Open Data Licence |
| `kingston-accessible-features` | Kingston-Open-Data-Licence-1.0 | City of Kingston Open Data Licence |
| `sudbury-fieldhouses` | Greater-Sudbury-Open-Data-Licence-1.0 | City of Greater Sudbury Open Data Licence |
| `mto-picnic-parks` | OGL-Ontario-1.0 | Same family as allowlisted `OGL-ON-1.0`, but the identifiers are not treated as equal |

The machine-readable list is `findings.ts`. To add a source, document it there
and in this table; do not broaden `OPEN_LICENCES` to make the job pass.

## Accessibility mapping

Place records expose a `wheelchair` field whose values are not always
`YES`, `NO`, or `UNKNOWN`. The job maps only an explicit `yes` to `YES` and
an explicit `no` to `NO`. `limited`, `designated`, numeric values, conflicts
such as `yes;no`, and any other token stay `UNKNOWN`. Presence of a ramp or
door is never treated as an access decision.

## Out of scope

`packages/ingest-orchestrator/registry.seed.json` is a seed file with a
different licence spelling (`ODbL` rather than `ODbL-1.0`). The job uses
`sources/registry.json` as the registry of record.
