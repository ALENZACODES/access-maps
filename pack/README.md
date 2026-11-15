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

## Transit decisions for this pack

- **GO Transit and UP Express** are included, in their own `data/transit/metrolinx-go/` and `data/transit/metrolinx-up/` parts only, so those files can be removed quickly if Metrolinx cancels. They are never mixed into other sources or into `tiles/open`. The official zips were accepted under the Metrolinx Access and Use Agreement on 15 November 2026 at 4:41:52 PM ET (America/Toronto), from https://www.gotransit.com/en/partner-with-us/software-developers. John Khan confirmed directly to QA on 15 November 2026 at 5:59 PM ET (America/Toronto) that he accepted the Metrolinx Access and Use Agreement. Manifest licence, URL and retrieval date are that acceptance provenance: `Metrolinx Access and Use Agreement (accepted 2026-11-15)`, the software-developers URL, retrieved `2026-11-15`. Never use Metrolinx, GO, or UP marks or logos. Plain-text agency names may be used only as needed for wayfinding. No endorsement.

  Whenever these timetable rows are presented, show both of the following, prominently, not necessarily on every row, and on Data status / the attribution page:

  Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service.

  Contains information licensed under the Open Government Licence - Ontario - Metrolinx.

  Users must follow applicable laws when using the transit data.

  Les utilisateurs doivent respecter les lois applicables lorsqu'ils utilisent les données de transport en commun.

- **MiWay** is out. It is not in the source registry and must not appear in pack parts or counts.
- **London Transit (gtfs-ltc)** is included in the web pack (`inWebPack` true). John Khan confirmed directly to QA on 15 November 2026 at 5:59 PM ET (America/Toronto) that London Transit data can go in. Licence: [LTC Open Data Terms of Use](https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/), retrieved from the official open-data page at https://www.londontransit.ca/open-data/. Packed rows stay under `data/transit/gtfs-ltc/` and are never mixed into `metrolinx-*` files or `tiles/open`. Do not use LTC marks or logos, and do not claim endorsement.

  Show this optional availability notice, in English and French, with the terms link, anywhere these rows are presented and on Data status / the attribution page:

  Transit data is available from London Transit Commission under its Terms of Use

  Les données de transport en commun sont disponibles auprès de la Commission de transport de London : elles sont offertes aux termes de ses conditions d’utilisation.

  https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/

  The official static GTFS zip used for later I14 timetable packing is stored outside Git (SHA-256 `22d69ea78ddcd039c33e63ba2f272bbff1996226767442c50ac35cdefa308f98`, fetched 15 November 2026). Do not commit that zip or timetable chunks.

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
