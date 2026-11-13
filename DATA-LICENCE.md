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

GO Transit and UP Express are not recorded here as a plain open grant. The current GTFS download terms are a Metrolinx Access and Use Agreement: limited, revocable, with a mandatory legend, and they have not been reconciled with the Open Government Licence – Ontario – Metrolinx PDF. The existing rows stay. They are excluded from `data/tiles/open/`.

MiWay is published under the City of Mississauga Terms of Use. Those terms are revocable, include an indemnity, and are not a plain open grant: http://www5.mississauga.ca/research_catalogue/CityofMississauga_TermsofUse.pdf The existing rows stay. They are excluded from `data/tiles/open/`.

London Transit is published under the London Transit Commission Open Data Terms of Use: https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/ Those terms are not treated as a settled open grant. Legal review is still required. LTC stops are excluded from `data/tiles/open/`.

Brampton Transit publishes the GTFS item with `licenseInfo` set to the string `CC BY`. The item does not state a Creative Commons version. Redistribution follows that published statement and includes attribution. The item page is https://www.arcgis.com/home/item.html?id=a355aabd5a8c490186bdce559c9c75fb
