# Attribution

This repository redistributes derived open data. Attribution here is licence compliance. It is not an endorsement, partnership, or verification by any publisher.

## OpenStreetMap

© OpenStreetMap contributors

Data from the Geofabrik Ontario extract, https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf, retrieved 2026-11-13.

Licence: Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/

ODbL is share-alike. The OSM-derived files are only under `data/venues/osm-ontario/`, `data/washrooms/osm-ontario/`, and `data/paths/osm-ontario/`. See [DATA-LICENCE.md](DATA-LICENCE.md).

## TTC Routes and Schedules

Contains information licensed under the Open Government Licence – Toronto.

https://open.toronto.ca/open-data-licence/

Dataset: https://open.toronto.ca/dataset/ttc-routes-and-schedules/

## City of Toronto datasets

Contains information licensed under the Open Government Licence – Toronto.

https://open.toronto.ca/open-data-licence/

Washroom datasets, retrieved 2026-11-16:

- Park Washroom Facilities, https://open.toronto.ca/dataset/washroom-facilities/
- Street Furniture - Automated Public Washroom, https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/street-furniture-public-washroom
- Corporate Real Estate Management Portfolio Washrooms, https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/corporate-real-estate-management-portfolio-washrooms
- Association of Community Centres, https://open.toronto.ca/dataset/association-of-community-centres/

Other datasets, retrieved 2026-11-16:

- Off-Street Parking – Surface Lots – Accessible Stalls, https://open.toronto.ca/dataset/off-street-parking-surface-lots-accessible-stalls/
- Traffic Signals Tabular (Traffic Signal resource), https://open.toronto.ca/dataset/traffic-signals-tabular/
- Library Branch General Information, https://open.toronto.ca/dataset/library-branch-general-information/
- Parks Drinking Fountains, https://open.toronto.ca/dataset/parks-drinking-fountains/
- Parks and Recreation Facilities, https://open.toronto.ca/dataset/parks-and-recreation-facilities/
- Pedestrian Network, https://open.toronto.ca/dataset/pedestrian-network/

The accessible-stall type is the City's estimate from aerial imagery and is stored as published. The traffic-signal audible flag is stored as published. Neither is a verified observation.

## City of Ottawa datasets

Contains information licensed under the Open Government Licence – City of Ottawa.

Open Data Licence Version 2.0: https://www.ottawa.ca/opendata

Datasets, retrieved 2026-11-16 from https://maps.ottawa.ca/arcgis/rest/services/:

- Public Washrooms, PublicWashrooms/MapServer/0
- Parks inventory point layers, Parks_Inventory/MapServer (layers 0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28)
- Parking Lots in City Parkland, Parks_Inventory/MapServer/14

The washroom Accessibility Rating and the parks ACCESSIBLE flag are the City's own values and are stored as published. They are not a wheelchair measurement by this project. The licence does not cover personal information or the City's names, crests and logos. Bench dedication names are not imported.

## GO Transit and UP Express

The official static GTFS zips were accepted under the Metrolinx Access and Use Agreement on 15 November 2026 at 4:41:52 PM ET (America/Toronto), from https://www.gotransit.com/en/partner-with-us/software-developers. John Khan confirmed directly to QA on 15 November 2026 at 5:59 PM ET (America/Toronto) that he accepted the Metrolinx Access and Use Agreement. Packed rows live only in `data/transit/metrolinx-go/` and `data/transit/metrolinx-up/`. They are excluded from `data/tiles/open/`. Never use Metrolinx, GO, or UP marks or logos. Plain-text agency names may be used only as needed for wayfinding. No endorsement.

Whenever these timetable rows are presented, show both of the following, prominently, not necessarily on every row, and on Data status / this page:

Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service.

Contains information licensed under the Open Government Licence - Ontario - Metrolinx.

Users must follow applicable laws when using the transit data.

Les utilisateurs doivent respecter les lois applicables lorsqu’ils utilisent les données de transport en commun.

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

Transit data is available from London Transit Commission under its Terms of Use

Les données de transport en commun sont disponibles auprès de la Commission de transport de London : elles sont offertes aux termes de ses conditions d’utilisation.

https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/

https://www.londontransit.ca/open-data/

The terms were confirmed on 2026-11-15. John Khan confirmed directly to QA on 15 November 2026 at 5:59 PM ET (America/Toronto) that London Transit data can go in. Packed rows stay under `data/transit/gtfs-ltc/` and are included in the web pack. Do not use LTC marks or logos, and do not claim endorsement.

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

## City of Kitchener datasets

Contains information licensed under the Open Government Licence - The Corporation of the City of Kitchener

Open Government Licence - The Corporation of the City of Kitchener, version 1.0: https://www.kitchener.ca/en/council-and-city-administration/open-data-licence.aspx

Datasets, retrieved 2026-11-16 from https://services1.arcgis.com/qAo1OsXi67t7XgmS/arcgis/rest/services/:

- Public Washrooms, Public_Washrooms/FeatureServer/0
- Parking Public Lots, Parking_Public_Lots/FeatureServer/0
- Parking Features (accessible parking points only), Parking_Features/FeatureServer/0
- Playgrounds, Playgrounds/FeatureServer/0
- Playground Equipment, Playground_Equipment/FeatureServer/0
- Sidewalks, Sidewalks/FeatureServer/0
- Trails, Trails/FeatureServer/0
- Crosswalks, Crosswalks/FeatureServer/1

The AODA_COMPLIANT, ACCESSIBLE, CURBCUT and RAILING flags are the City's own values and are stored as published. They are not a wheelchair measurement by this project. The licence does not cover personal information or the City's names, crests and logos.

## City of Waterloo datasets

Contains information provided by the City of Waterloo under licence

Waterloo Open Data User Licence: https://data.waterloo.ca/pages/open-data-licence

Datasets, retrieved 2026-11-16 from https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/:

- Parking Lots (City Operated), ParkingLots/FeatureServer/0
- Playgrounds, Playgrounds/FeatureServer/0
- Sidewalks, Sidewalks/FeatureServer/0
- Trails and Pathways, Trails_and_Pathways/FeatureServer/0

The parking lot ACCESSIBLE flag is the City's own value and is stored as published. The licence does not cover personal information or logos, and the data must not be used in a way that suggests official status or endorsement.

## City of Cambridge datasets

Contains information licensed under the Open Government Licence – City of Cambridge.

Open Data Licence Version 2.0: https://maps.cambridge.ca/images/opendata/Open%20data%20licence.pdf

Dataset, retrieved 2026-11-16: Play Structures, https://maps.cambridge.ca/arcgispub03/rest/services/OpenData1/MapServer/9

## City of Guelph datasets and Guelph Transit

Contains information licensed under the Open Government Licence – City of Guelph.

Open Data Licence Version 2.0: https://explore.guelph.ca/pages/open-data-license

Datasets, retrieved 2026-11-16 from https://gismaps.guelph.ca/hosting/rest/services/OpenData/:

- Restrooms, OpenData1/FeatureServer/20
- Parking Lot Points, OpenData1/FeatureServer/37
- Trails, OpenData1/FeatureServer/21
- Sidewalks, OpenData2/FeatureServer/0

Guelph Transit GTFS scheduled data feed, retrieved 2026-11-16 from the file linked at https://explore.guelph.ca/pages/transit-gtfs-data. The City's terms at https://explore.guelph.ca/pages/terms-of-use name the Open Government Licence as the licence where a record names no other. Stops are operator claims (tier 1).

## City of Windsor datasets and Transit Windsor

Contains information licensed under the Open Government Licence – The Corporation of the City of Windsor.

Open Government Licence – The Corporation of the City of Windsor, version 1.0: https://opendata.citywindsor.ca/Documents/OpenDataTermsofUse.pdf

Datasets, retrieved 2026-11-16 from https://mappmycity.ca/arcgis/rest/services/open_data_services/:

- park washroom, communityrecreation/MapServer/30
- playground, communityrecreation/MapServer/35
- drinking fountain, communityrecreation/MapServer/17
- bus stop, transportation/MapServer/6
- sidewalk, transportation/MapServer/22
- path and trail, transportation/MapServer/2

Windsor Transit Data (GTFS), retrieved 2026-11-16 from https://opendata.citywindsor.ca/Uploads/google_transit.zip. Stops are operator claims (tier 1).

The playground ACCESSIBLE pair, the bus stop has_full_access flag and the trail is_all_ages_and_abilities flag are the City's own values and are stored as published. The licence does not cover personal information or the City's names, crests and logos.

## Offline map tiles

`data/tiles/odbl/` is OpenStreetMap data under the Open Database License (ODbL) 1.0. It is a separate file from every other licence.

`data/tiles/open/` contains no OpenStreetMap data. It also excludes GO Transit and UP Express stops, which stay in their own `metrolinx-*` files. Attribution for each `source_id` that remains in that overlay is the section above for that source.
