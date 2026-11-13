# Attribution

This repository redistributes derived open data. Attribution here is licence compliance. It is not an endorsement, partnership, or verification by any publisher.

## OpenStreetMap

(c) OpenStreetMap contributors

Data from the Geofabrik Ontario extract, https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf, retrieved 2026-11-13.

Licence: Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/

ODbL is share-alike. The OSM-derived files are only under `data/venues/osm-ontario/`, `data/washrooms/osm-ontario/`, and `data/paths/osm-ontario/`. See [DATA-LICENCE.md](DATA-LICENCE.md).

## TTC Routes and Schedules

Contains information licensed under the Open Government Licence – Toronto.

https://open.toronto.ca/open-data-licence/

Dataset: https://open.toronto.ca/dataset/ttc-routes-and-schedules/

## City of Toronto washroom datasets

Contains information licensed under the Open Government Licence – Toronto.

https://open.toronto.ca/open-data-licence/

Datasets:

- Park Washroom Facilities, https://open.toronto.ca/dataset/washroom-facilities/
- Street Furniture - Automated Public Washroom, https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/street-furniture-public-washroom
- Corporate Real Estate Management Portfolio Washrooms, https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/corporate-real-estate-management-portfolio-washrooms

## Metrolinx GO Transit and UP Express

Contains information licensed under the Open Government Licence - Ontario - Metrolinx.

https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf

Open data page: https://www.metrolinx.com/en/about-us/open-data

Legal review is still required. The current GTFS download page is a Metrolinx Access and Use Agreement (limited, revocable, mandatory legend, no GO, UP, or Metrolinx trademarks). That agreement has not been reconciled with the Open Government Licence PDF. The existing rows are unchanged.

## Grand River Transit

Contains information provided by the Regional Municipality of Waterloo under licence

https://www.regionofwaterloo.ca/government-and-council/transparency-and-accountability/open-data/

GRT open data page: https://www.grt.ca/about-grt/open-data/

## MiWay

These datasets are publicly available from the City of Mississauga under its Terms of Use.

Terms: http://www5.mississauga.ca/research_catalogue/CityofMississauga_TermsofUse.pdf

Developer page: https://www.mississauga.ca/miway-transit/developer-download/

Legal review is still required. The terms are revocable, include an indemnity, and a copy contains a "City of Toronto grants you" sentence. No additional Mississauga dataset was imported.

## Brampton Transit

City of Brampton, Brampton Transit Schedule Data (GTFS), CC BY.

The City of Brampton item states the licence as "CC BY" and does not publish a Creative Commons version: https://www.arcgis.com/home/item.html?id=a355aabd5a8c490186bdce559c9c75fb

## Hamilton Street Railway

Contains public sector Data made available under the City of Hamilton's Open Data Licence

https://www.hamilton.ca/city-council/data-maps/open-data/open-data-licence-terms-and-conditions

## London Transit Commission

These data sets are available from the London Transit Commission under its Open Data Terms of Use.

https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/

https://www.londontransit.ca/open-data/

## TTC GTFS-RT accessibility alerts

Contains information licensed under the Open Government Licence – Toronto.

https://open.toronto.ca/open-data-licence/

Feed: https://gtfsrt.ttc.ca/alerts/accessibility?format=text

The committed file is a snapshot. It is not a live feed. Run `npm run fetch:ttc-alerts` to replace it. Equipment is recorded as an elevator or an escalator only when the header text says so.

## City of Kingston

Contains information licensed under the Open Data Licence – City of Kingston.

https://www.cityofkingston.ca/documents/10180/144997/CityofKingston_OpenDataLicense.pdf

Datasets: public washrooms and accessible features at Kingston facilities, retrieved 2026-11-13.

## City of Brampton recreation centres

City of Brampton, Recreation Centres, CC BY.

The ArcGIS item states the licence as "CC BY" and does not publish a version: https://www.arcgis.com/sharing/rest/content/items/ff37167a92ce454bac4f5a42695df28d?f=json

The hub catalogue also links https://creativecommons.org/licenses/by/4.0. Both statements are recorded. No version is asserted as the only statement.

## City of Greater Sudbury

Contains information licensed under the Open Data Licence – City of Greater Sudbury.

https://www.greatersudbury.ca/city-hall/open-government/open-data/licence/

The imported file is the Field_Houses layer. The hub title "Accessible Parks (Layer)" is not stored as a wheelchair fact.

## Ministry of Transportation picnic parks

Contains information licensed under the Open Government Licence – Ontario.

https://www.ontario.ca/page/open-government-licence-ontario

Dataset: https://data.ontario.ca/dataset/picnic-parks

## Offline map tiles

`data/tiles/odbl/` is OpenStreetMap data under the Open Database License (ODbL) 1.0. It is a separate file from every other licence.

`data/tiles/open/` contains no OpenStreetMap data. Attribution for each `source_id` in that overlay is the section above for that source.
