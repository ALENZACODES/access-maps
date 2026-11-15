# Data licence

The MIT licence in `LICENSE` covers the code in this repository. It does not cover the imported data.

Each dataset keeps the licence recorded in `sources/registry.json` and `ATTRIBUTION.md`.

## OpenStreetMap is share-alike

OpenStreetMap data is under the Open Database License (ODbL) 1.0. ODbL is a share-alike licence. A public database that uses this OSM extract, or a database produced by adapting it, stays under ODbL.

OSM-derived records are only in these directories:

- `data/venues/osm-ontario/`
- `data/washrooms/osm-ontario/`
- `data/paths/osm-ontario/`

Do not copy those records into a GTFS or municipal file. GTFS and municipal records stay in their own source directories, for example `data/transit/gtfs-ttc/` and `data/washrooms/toronto-park-washrooms/`. Those layers are not ODbL.

Attribution for the OSM layers: `(c) OpenStreetMap contributors`.

## Other datasets

TTC and the City of Toronto washroom datasets use the Open Government Licence – Toronto. Grand River Transit uses the Region of Waterloo Open Data Licence v.2.0. Hamilton Street Railway uses the City of Hamilton Open Data Licence.

GO Transit and UP Express packed rows are stored only under `data/transit/metrolinx-go/` and `data/transit/metrolinx-up/`. They were accepted under the Metrolinx Access and Use Agreement on 2026-11-15. The packed licence string is `Metrolinx Access and Use Agreement (accepted 2026-11-15)`. Those files are excluded from `data/tiles/open/` so they can be removed quickly if Metrolinx cancels. Never use Metrolinx, GO, or UP marks. Do not mix these rows into any other agency's files.

MiWay GTFS is not in this pack. The official terms could not be confirmed.

London Transit is published under the LTC Open Data Terms of Use: https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/ Those terms were confirmed on 2026-11-15. Packed rows stay under `data/transit/gtfs-ltc/` and are never mixed into `metrolinx-*` files. Do not use LTC marks or claim endorsement.

Brampton Transit publishes the GTFS item with `licenseInfo` set to the string `CC BY`. The item does not state a Creative Commons version. Redistribution follows that published statement and includes attribution. The item page is https://www.arcgis.com/home/item.html?id=a355aabd5a8c490186bdce559c9c75fb
