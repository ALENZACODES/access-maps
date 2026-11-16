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

Also retrieved 2026-11-16: City Facilities for Recreation Activities (City_Facilities/MapServer/5), Public Drinking Water Fountains (Miscellaneous/MapServer/0), Parks and Greenspace (Parks_Inventory/MapServer/24), Existing Pedestrian Network (Pedestrian_Plan/MapServer/0), and Ottawa Public Library Locations 2024 (https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Ottawa_Public_Library_Locations_2024/FeatureServer/0).

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

Datasets retrieved 2026-11-16 from https://opendatakingston.cityofkingston.ca/: Parking Lot Areas, Trails, Points of Interest (parks, recreation, civic, parking and transit types), and Transit Bus Routes & Stops (GTFS-static, Kingston Transit).

The parking-lot count of designated spaces and the trail ACCESSIBLE flag are the City's own values and are stored as published. They are not a wheelchair measurement by this project. Kingston Transit stop fields are operator claims.

## City of Brampton recreation centres

City of Brampton, Recreation Centres, CC BY.

The ArcGIS item states the licence as "CC BY" and does not publish a version: https://www.arcgis.com/sharing/rest/content/items/ff37167a92ce454bac4f5a42695df28d?f=json

The hub catalogue also links https://creativecommons.org/licenses/by/4.0. Both statements are recorded. No version is asserted as the only statement.

## City of Greater Sudbury

Contains information licensed under the Open Data Licence – City of Greater Sudbury.

https://www.greatersudbury.ca/city-hall/open-government/open-data/licence/

The imported file is the Field_Houses layer. The hub title "Accessible Parks (Layer)" is not stored as a wheelchair fact. Four rows publish easting and northing 0 in the CSV. Their coordinates come from the city's feature service geometry, layer `AGOL_Recreation_Bilingual_For_Web_FGDB_V_3/FeatureServer/3`, requested in WGS84. The field `source_key` names that layer. A row stays UNKNOWN if that service does not return a coordinate in Ontario.

Datasets retrieved 2026-11-16 from https://opendata.greatersudbury.ca/: Parks and Playgrounds, Recreation, Road Sidewalk Path Trail (active sidewalks, walkways and trails), and Transit Schedule Data (GTFS, GOVA Transit).

The playground Accessibility value (Full or Partial) is the City's own word and is stored as published. It is not a wheelchair measurement by this project. GOVA Transit stop fields are operator claims.

## City of Thunder Bay

Contains information licensed under the Open Data Licence – The Corporation of the City of Thunder Bay.

Open Data Licence 1.0: https://www.thunderbay.ca/city-hall/thunder-bay-open-data/

Datasets retrieved 2026-11-16 from https://opendata.thunderbay.ca/: Sidewalks, Trails, and Address of City Facilities.

These layers have no accessibility column. The licence lets the City ask for its attribution statement to be removed.

## City of Cornwall

Contains information licensed under the Open Government Licence – City of Cornwall.

Open Data Licence Version 2.0: https://media-003-ca.cdn.govstack.com/cornwall-ca/media/5i0aznnd/city-of-cornwall-open-government-licence.pdf

Datasets retrieved 2026-11-16 from https://data-cornwallcity.opendata.arcgis.com/: Sidewalks Network, Recreational Paths and Bike Lanes (off-road paths only), Water Bottle Filling Stations, and CornwallTransit Bus Stops.

These layers have no accessibility column. The bus-stop `wheelchair` code is not defined by the layer and is not stored as a boarding value.

## City of Quinte West

Contains information licensed under the Open Data Licence – City of Quinte West.

Open Data Licence 1.0: https://www.arcgis.com/home/item.html?id=2d74bbcab91441209f5669908ec31ad6

Datasets retrieved 2026-11-16 from the City's ArcGIS organization: Parks, and Trails and Sidewalks.

These layers have no accessibility column. The trail surface is the City's own value and is stored as published.

## Ministry of Transportation picnic parks

Contains information licensed under the Open Government Licence – Ontario.

https://www.ontario.ca/page/open-government-licence-ontario

Dataset: https://data.ontario.ca/dataset/picnic-parks

## City of Hamilton datasets

Contains public sector Data made available under the City of Hamilton's Open Data Licence

https://www.hamilton.ca/city-council/data-maps/open-data/open-data-licence-terms-and-conditions

Datasets, retrieved 2026-11-16 from https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/:

- Park Washrooms, Park_Washrooms/FeatureServer/46
- Drinking Fountains, Drinking_Fountains_Layer_Test/FeatureServer/0
- HSR Bus Stops, HSR_Bus_Stops/FeatureServer/2
- Pedestrian Features, Pedestrian_Features/FeatureServer/5
- Trails, Trails/FeatureServer/14
- Road Sidewalk, Road_Sidewalk/FeatureServer/2

The washroom AODA_ACCESSIBILITY column and the bus stop landing area columns are the City's own values and are stored as published. They are not a wheelchair measurement by this project.

## City of Brampton parking garages and recreational trails

City of Brampton, Public Parking Garages, CC BY 4.0. The ArcGIS item links https://creativecommons.org/licenses/by/4.0/: https://www.arcgis.com/home/item.html?id=a000ba5245f84e2dac8216b92a75802a

City of Brampton, Recreational Trails, CC BY. The ArcGIS item states the licence as "CC BY" and does not publish a version: https://www.arcgis.com/home/item.html?id=7a4019577fcf4a4f86da22add04816cf

Retrieved 2026-11-16. Trail segments were filtered to off-road types; no other change was made to the published values.

## Region of Peel trails

Contains public sector Information made available under The Regional Municipality of Peel's Open Data Licence - Version 1.0.

https://data.peelregion.ca/pages/license

Dataset: Trails, retrieved 2026-11-16 from https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services/Trails/FeatureServer/0

## The Regional Municipality of York

Contains public sector information made available under The Regional Municipality of York's Open Data Licence.

York Region Open Data Licence, version 1.0: https://www.arcgis.com/home/item.html?id=78cc02388af248c0b7a30eda6adfade0

Dataset, retrieved 2026-11-16:

- Bus Stops from GTFS, https://www.arcgis.com/home/item.html?id=ca904f8425814759a3dfa5951afff479

The WHEELCHAIR_BOARDING label is the Region's own value. "No" is stored as published. "Yes / Part" is kept as the published label and is not stored as a yes. The licence does not cover personal information or public sector logos, trademarks, slogans and crests, and the credit is removed if the Region asks.

## City of Markham

Contains public sector Information made available under the City of Markham's Open Data Licence.

Open Data Licence – City of Markham, version 1.0: https://data-markham.opendata.arcgis.com/pages/terms-of-use

Datasets, retrieved 2026-11-16:

- City Owned Facilities, https://www.arcgis.com/home/item.html?id=d8cee9f1183f4d8f9c731e777782f3a3
- Trails (segments marked public), https://www.arcgis.com/home/item.html?id=c445d4d0a22041d2a961e919a8df59ed

Neither layer has an accessibility column. The credit is removed if the City asks.

## Town of Newmarket

Contains information licensed under the Open Data Licence – Town Of Newmarket.

Open Data Licence – Town of Newmarket, version 2.0: https://navigate-newmarket.hub.arcgis.com/pages/open-data-licence

Datasets, retrieved 2026-11-16:

- Park Features, https://www.arcgis.com/home/item.html?id=a33b7c99a40e4b7d811e75e89339fc8f
- Trails, https://www.arcgis.com/home/item.html?id=6c330879911c471489476bc7a64a26bd
- Trail Points, https://www.arcgis.com/home/item.html?id=8d259d7129b94f8ba227e1878f795103
- Landmarks (municipal facility categories), https://www.arcgis.com/home/item.html?id=7931ff25803147b6a4cf0bccc76f93a7

None of these layers has an accessibility column.

## Town of Oakville datasets

Contains information licensed under the Open Government Licence — Town of Oakville.

https://www.oakville.ca/town-hall/town-studies-plans-projects/town-initiatives/open-data/open-data-licence/

Datasets, retrieved 2026-11-16: Town Facilities (washroom rows), https://www.arcgis.com/home/item.html?id=ad818e6a80b941c89108d724a642d238, and Oakville Transit Route and Schedule Information (GTFS), https://www.arcgis.com/home/item.html?id=d78a1c1ad6a940009de8b68839a8f606

## Town of Milton datasets

Contains information licensed under the Open Government Licence – Milton.

https://discover-milton.hub.arcgis.com/pages/disclaimer-and-terms-of-use

Datasets, retrieved 2026-11-16 from https://api.milton.ca/arcgis/rest/services/Datasets/: Parking Lots, Park Amenities, Sidewalks and Trails.

## City of Niagara Falls datasets

Contains information licensed under the Open Government Licence – Niagara Falls.

https://open.niagarafalls.ca/pages/terms-of-use

Datasets, retrieved 2026-11-16 from https://services9.arcgis.com/oMFQlUUrLd1Uh1bd/arcgis/rest/services/: Sidewalks, Community Public Trails and Playgrounds.

## City of Welland datasets

Contains information licensed under the Open Government Licence – City of Welland.

https://open-welland.hub.arcgis.com/pages/terms-of-use

Datasets, retrieved 2026-11-16 from https://arcgisweb.welland.ca/serverprodpub/rest/services/OpenData/: City Wide Trails and Municipal Facilities (public washroom rows).

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
## The Regional Municipality of Durham

Contains public sector information made available under The Regional Municipality of Durham's Open Data Licence.

Region of Durham Open Data Licence, version 1.0: https://www.durham.ca/en/regional-government/open-data.aspx

Dataset, retrieved 2026-11-16:

- Durham Region Transit GTFS Static Schedule, https://www.arcgis.com/home/item.html?id=931bc536b42e4b3aa72270dab4133c90

`wheelchair_boarding` is the operator's own value and is a tier 1 operator claim. The licence does not cover personal information or public sector logos, trademarks, slogans and crests, and the credit is removed if the Region asks.

## City of Oshawa

Contains information licensed under the Open Government Licence – The Corporation of the City of Oshawa.

https://map.oshawa.ca/OpenData/Open%20Government%20Licence%20version%202.0%20-%20Oshawa.pdf

Datasets, retrieved 2026-11-16:

- Oshawa Community Centres, https://www.arcgis.com/home/item.html?id=e444523281af4572b745dda31ae9aa70
- Oshawa Trails, https://www.arcgis.com/home/item.html?id=727043b0db8846e29f3f971ac8292bd9

Neither layer has an accessibility column.

## Town of Whitby

Contains information licensed under the Open Government Licence – The Corporation of the Town of Whitby.

https://whitby.maps.arcgis.com/sharing/rest/content/items/223810efc31c40b3aff99dd74f809a97/data

Datasets, retrieved 2026-11-16:

- Town Facilities, https://www.arcgis.com/home/item.html?id=686a4bbbc7ae4d9aa8555caa07cc71b1
- Parks, https://www.arcgis.com/home/item.html?id=fa9584c26e20401083665a6fd4ec9568
- Sidewalks, https://www.arcgis.com/home/item.html?id=0c96c17244584c8fbaddd31307055be3
- Trails, https://www.arcgis.com/home/item.html?id=4eb1e1d5d32b4c06adc898a20d850363

The sidewalk ramp counts and the park "Accessible Amenities" flag are the Town's own values and are stored as published. They are not a wheelchair measurement by this project.

## Town of Ajax

Contains public sector Information made available under The Corporation of the Town of Ajax's Open Data Licence.

https://townofajax.maps.arcgis.com/sharing/rest/content/items/22e2d8e248724d7cb0310dc2db675abd/data

Datasets, retrieved 2026-11-16:

- Town Facilities, https://www.arcgis.com/home/item.html?id=16a95539e7d04fab945c8f1564587fa9
- Ajax Playgrounds, https://www.arcgis.com/home/item.html?id=89d1d77d654e42dd8e5292d501a31498
- Recreational Trails, https://www.arcgis.com/home/item.html?id=3f209784f44f4f1ab337ca52b680ba56

None of these layers has an accessibility column. The credit is removed if the Town asks.

## City of Pickering

Contains public sector Information made available under The City of Pickering's Open Data Licence.

https://www.pickering.ca/media/depbgebg/opendatalicencepickeringv1_acc.pdf

Datasets, retrieved 2026-11-16:

- Pickering Facilities, https://www.arcgis.com/home/item.html?id=3b0c4830a24640c786e31241451fb466
- Pickering Parks, https://www.arcgis.com/home/item.html?id=f65b5496d8f9486bb18460a113bb961d

Neither layer has an accessibility column. The credit is removed if the City asks.

## County of Lambton accessible features

Contains information licensed under the Open Government Licence - County of Lambton

Open Government Licence - County of Lambton: https://county-lambton.opendata.arcgis.com/pages/open-data-license

Dataset, retrieved 2026-11-16: Accessible Features, https://www.lambtongis.ca/arcgis_adaptor/rest/services/AccessibleFeatures/MapServer/1 (catalogue record Accessible Facilities at https://county-lambton.opendata.arcgis.com/maps/lambton::accessible-facilities).

The listed features are the County's own phrases and are stored as published. They are not a wheelchair measurement by this project, and a feature the County does not list is stored as UNKNOWN, not as absent. The licence does not cover personal information or the County's names, crests and logos.

## City of London datasets

Contains data sets publicly available from the City of London under the City of London Open Data Terms of Use.

City of London Open Data Terms of Use: https://london.maps.arcgis.com/sharing/rest/content/items/e31458fd0c7e41dd9f93144a9550781d/data

The terms do not set out a required attribution statement: credit is not required, and the line above uses the wording the terms encourage ("these data sets are publicly available from the City under these Terms of Use"). The City may ask that a credit be removed. What the terms do require: anyone who receives these data sets from this project, in original or modified form, must be given the terms or the link above, and is bound by them. Do not imply that the City of London participates in, sponsors, approves or endorses this project, and do not use the City's marks or logos.

Basis for inclusion: the repository owner stated in chat on 2026-11-16 that use of City of London data is permitted and instructed that it be included (licence id `owner-permission-2026-11-16` in `sources/registry.json`). The terms above were read the same day.

Datasets, retrieved 2026-11-16 from https://maps.london.ca/server/rest/services/OpenData (catalogue https://opendata.london.ca): Park Amenities (`london-park-amenities`), Parking Inventory (`london-parking-inventory`), Off-Street Parking (`london-off-street-parking`), Libraries (`london-libraries`), Sidewalks (`london-sidewalks`), Walkways (`london-walkways`), Bicycle Routes and Walking Trails (`london-trails`).

London Transit Commission GTFS is a separate source with its own terms; see the London Transit Commission section above.

## Offline map tiles

`data/tiles/odbl/` is OpenStreetMap data under the Open Database License (ODbL) 1.0. It is a separate file from every other licence.

`data/tiles/open/` contains no OpenStreetMap data. It also excludes GO Transit and UP Express stops, which stay in their own `metrolinx-*` files. Attribution for each `source_id` that remains in that overlay is the section above for that source.
