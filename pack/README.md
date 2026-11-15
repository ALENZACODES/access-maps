# Ontario web data pack (v1)

Rebuild from the imported NDJSON partitions in `data/`:

```sh
npm run build:web-pack -- --data data --out pack/v1
npm run verify:web-pack -- --data data --out pack/v1
```

`pack/v1/manifest.json` describes per-cell compressed search arrays and original,
unchanged record parts (relative to `data/`). When staging the static site, copy
both the generated `pack/v1` directory and referenced `data` partitions to the
served `data/` directory. Do not precache the complete pack. Index entries with
unknown names have `name: null`; an unknown accessibility field is not a negative
claim. Cell and city windows are geographic discovery aids, not boundaries.

The source registry determines what may be redistributed. Sources with unresolved,
revocable or legally held terms remain in the manifest for disclosure but are
excluded from all downloadable parts, indexes and counts. Recheck those terms
before a later rebuild; do not override the hold by editing generated files.

## Licences and attribution

Source-level licence, retrieval date and attribution are reproduced from
`sources/registry.json` in the manifest. The underlying data are not covered by
the repository's code licence. OSM-derived venues, washrooms and paths retain
**ODbL 1.0 share-alike** requirements, including database attribution:
**© OpenStreetMap contributors, ODbL**.

Other data may include TTC and Toronto municipal datasets (Open Government Licence
– Toronto), Grand River Transit (Region of Waterloo Open Data Licence v2),
Hamilton Street Railway (City of Hamilton Open Data Licence), and Brampton Transit
(CC BY, version unspecified). Consult the generated `sources` list and
`ATTRIBUTION.md` for the complete, rebuild-specific attribution list. The app
has no endorsement from any of these organisations.
