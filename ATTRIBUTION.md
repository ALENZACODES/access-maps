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

## GO Transit and UP Express

The official static GTFS zips were accepted under the Metrolinx Access and Use Agreement on 15 November 2026 at 4:41:52 PM ET (America/Toronto), from https://www.gotransit.com/en/partner-with-us/software-developers. John Khan confirmed directly to QA on 15 November 2026 at 5:59 PM ET (America/Toronto) that he accepted the Metrolinx Access and Use Agreement. Packed rows live only in `data/transit/metrolinx-go/` and `data/transit/metrolinx-up/`. They are excluded from `data/tiles/open/`. Never use Metrolinx, GO, or UP marks or logos. Plain-text agency names may be used only as needed for wayfinding. No endorsement.

Whenever these timetable rows are presented, show both of the following, prominently, not necessarily on every row, and on Data status / this page:

Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service.

Contains information licensed under the Open Government Licence - Ontario - Metrolinx.

Users must follow applicable laws when using the transit data.

Les utilisateurs doivent respecter les lois applicables lorsqu'ils utilisent les données de transport en commun.

## Grand River Transit

Contains information provided by the Regional Municipality of Waterloo under licence

https://www.regionofwaterloo.ca/government-and-council/transparency-and-accountability/open-data/

GRT open data page: https://www.grt.ca/about-grt/open-data/

## Brampton Transit

City of Brampton, Brampton Transit Schedule Data (GTFS), CC BY.

The City of Brampton item states the licence as "CC BY" and does not publish a Creative Commons version: https://www.arcgis.com/home/item.html?id=a355aabd5a8c490186bdce559c9c75fb

## Hamilton Street Railway

Contains public sector Data made available under the City of Hamilton's Open Data Licence

https://www.hamilton.ca/city-council/data-maps/open-data/open-data-licence-terms-and-conditions

## London Transit Commission

These data sets are available from LTC under the LTC Open Data Terms of Use: https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/

https://www.londontransit.ca/open-data/

The terms were confirmed on 2026-11-15. John Khan confirmed directly to QA on 15 November 2026 at 5:59 PM ET (America/Toronto) that London Transit data can go in. Packed rows stay under `data/transit/gtfs-ltc/`. Do not use LTC marks or claim endorsement.

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

The imported file is the Field_Houses layer. The hub title "Accessible Parks (Layer)" is not stored as a wheelchair fact. Four rows publish easting and northing 0 in the CSV. Their coordinates come from the city's feature service geometry, layer `AGOL_Recreation_Bilingual_For_Web_FGDB_V_3/FeatureServer/3`, requested in WGS84. The field `source_key` names that layer. A row stays UNKNOWN if that service does not return a coordinate in Ontario.

## Ministry of Transportation picnic parks

Contains information licensed under the Open Government Licence – Ontario.

https://www.ontario.ca/page/open-government-licence-ontario

Dataset: https://data.ontario.ca/dataset/picnic-parks

## Offline map tiles

`data/tiles/odbl/` is OpenStreetMap data under the Open Database License (ODbL) 1.0. It is a separate file from every other licence.

`data/tiles/open/` contains no OpenStreetMap data. It also excludes GO Transit and UP Express stops, which stay in their own `metrolinx-*` files. Attribution for each `source_id` that remains in that overlay is the section above for that source.
