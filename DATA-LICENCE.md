# Data licence

The MIT licence in `LICENSE` covers the code in this repository. It does not cover the imported data.

Each dataset keeps the licence recorded in `sources/registry.json` and `ATTRIBUTION.md`.

## OpenStreetMap is share-alike

OpenStreetMap data is under the Open Database License (ODbL) 1.0. ODbL is a share-alike licence. A public database that uses this OSM extract, or a database produced by adapting it, stays under ODbL.

OSM-derived records are only in these directories:

- `data/venues/osm-ontario/`
- `data/washrooms/osm-ontario/`
- `data/paths/osm-ontario/`

Do not copy those records into a GTFS or municipal file. GTFS and municipal records stay in their own source directories, for example `data/transit/gtfs-ttc/`, `data/washrooms/toronto-park-washrooms/`, `data/paths/toronto-pedestrian-network/`, and `data/washrooms/ottawa-public-washrooms/`. Those layers are not ODbL.

Attribution for the OSM layers: `© OpenStreetMap contributors`.

## Other datasets

TTC and the City of Toronto datasets (washrooms, accessible parking stalls, traffic signals, library branches, drinking fountains, parks and recreation facilities, and the pedestrian network) use the Open Government Licence – Toronto. The City of Ottawa datasets (public washrooms, parks inventory, and parking lots in City parkland) use the Open Government Licence – City of Ottawa, published as Open Data Licence Version 2.0 at https://www.ottawa.ca/opendata. Grand River Transit uses the Region of Waterloo Open Data Licence v.2.0. The City of Kitchener datasets (public washrooms, parking lots, accessible parking points, playgrounds, playground equipment, sidewalks, trails and crosswalks) use the Open Government Licence - The Corporation of the City of Kitchener, version 1.0. The City of Waterloo datasets (parking lots, playgrounds, sidewalks and trails) use the Waterloo Open Data User Licence. City of Cambridge play structures use the Open Government Licence – City of Cambridge. The City of Guelph datasets (restrooms, parking lot points, sidewalks and trails) and the Guelph Transit GTFS feed use the Open Government Licence – City of Guelph. The City of Windsor datasets (park washrooms, playgrounds, drinking fountains, bus stops, sidewalks, and paths and trails) and the Transit Windsor GTFS feed use the Open Government Licence – The Corporation of the City of Windsor, version 1.0. The County of Lambton accessible features layer uses the Open Government Licence - County of Lambton. Hamilton Street Railway uses the City of Hamilton Open Data Licence.

The Regional Municipality of York bus stop layer (`data/transit/york-region-yrt-bus-stops/`) uses the York Region Open Data Licence, version 1.0. The City of Markham layers (`markham-*`) use the Open Data Licence – City of Markham, version 1.0. The Town of Newmarket layers (`newmarket-*`) use the Open Data Licence – Town of Newmarket, version 2.0. Each licence text was read on 2026-11-16; the URLs and attribution statements are in [sources/registry.json](sources/registry.json) and [ATTRIBUTION.md](ATTRIBUTION.md).

The City of Kingston datasets and Kingston Transit use the Open Data Licence – City of Kingston 1.0. The City of Greater Sudbury datasets and GOVA Transit use the City of Greater Sudbury Open Data Licence 1.0. The City of Thunder Bay datasets use The Corporation of the City of Thunder Bay Open Data Licence 1.0, read at https://www.thunderbay.ca/city-hall/thunder-bay-open-data/. The City of Cornwall datasets use the Open Government Licence – City of Cornwall (Open Data Licence Version 2.0). The City of Quinte West datasets use the City of Quinte West Open Data Licence 1.0. The City of Ottawa recreation facilities, library locations, drinking fountains, parks and pedestrian network use the same Open Government Licence – City of Ottawa as the other Ottawa datasets.

Durham Region Transit (`data/transit/gtfs-drt/`) uses the Region of Durham Open Data Licence, version 1.0. The City of Oshawa layers (`oshawa-*`) use the Open Government Licence – The Corporation of the City of Oshawa, version 2. The Town of Whitby layers (`whitby-*`) use the Open Government Licence – The Corporation of the Town of Whitby, version 1. The Town of Ajax layers (`ajax-*`) use the Town of Ajax Open Data Licence, version 1.0. The City of Pickering layers (`pickering-*`) use the City of Pickering Open Data Licence, version 1.0. Each licence text was read on 2026-11-16.

GO Transit and UP Express packed rows are stored only under `data/transit/metrolinx-go/` and `data/transit/metrolinx-up/`. They were accepted under the Metrolinx Access and Use Agreement on 2026-11-15. John Khan confirmed that acceptance directly to QA on 2026-11-15 at 5:59 PM ET (America/Toronto). The packed licence string is `Metrolinx Access and Use Agreement (accepted 2026-11-15)`. Those files are excluded from `data/tiles/open/` so they can be removed quickly if Metrolinx cancels. Never use Metrolinx, GO, or UP marks. Do not mix these rows into any other agency's files.

MiWay GTFS is not in this pack. The official terms could not be confirmed.

London Transit is published under the LTC Open Data Terms of Use: https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/ Those terms were confirmed on 2026-11-15. John Khan confirmed directly to QA on 2026-11-15 at 5:59 PM ET (America/Toronto) that London Transit data can go in. The web pack includes these rows (`inWebPack` true) with the optional EN and FR availability notice and the terms link. Packed rows stay under `data/transit/gtfs-ltc/` and are never mixed into `metrolinx-*` files. Do not use LTC marks or logos, and do not claim endorsement.

The City of Hamilton datasets retrieved on 2026-11-16 (park washrooms, drinking fountains, bus stop amenities, pedestrian features, trails, and sidewalks) use the City of Hamilton Open Data Licence, the same licence as the HSR feed. Region of Peel trails use the Open Data Licence for The Regional Municipality of Peel, Version 1.0: https://data.peelregion.ca/pages/license. City of Brampton public parking garages use CC BY 4.0, which the item links. City of Brampton recreational trails carry the item's `CC BY` statement with no version. Each of these stays in its own `data/*/<source_id>/` directory.

Town of Oakville datasets (Town Facilities washroom rows and the Oakville Transit GTFS feed) use the Town of Oakville Open Data Licence. Town of Milton datasets use the Open Government Licence – Milton, version 2.0. City of Niagara Falls datasets use the Open Government Licence – Niagara Falls, version 1.0. City of Welland datasets use the Open Government Licence – City of Welland, version 2.0. The licence URLs are in `sources/registry.json`, and each source stays in its own `data/*/<source_id>/` directory.

Brampton Transit publishes the GTFS item with `licenseInfo` set to the string `CC BY`. The item does not state a Creative Commons version. Redistribution follows that published statement and includes attribution. The item page is https://www.arcgis.com/home/item.html?id=a355aabd5a8c490186bdce559c9c75fb

## Owner-permitted sources

These sources carry the licence id `owner-permission-2026-11-16`. On 2026-11-16 the repository owner stated in chat that use of these publishers' data is permitted and instructed that it be included. That statement is the basis for including them. It is recorded here as it was given; it is not a licence text from the publisher. Each registry entry says whether a publisher's terms were read and what they say.

- City of London (`london-park-amenities`, `london-parking-inventory`, `london-off-street-parking`, `london-libraries`, `london-sidewalks`, `london-walkways`, `london-trails`). The City of London Open Data Terms of Use were read on 2026-11-16: https://london.maps.arcgis.com/sharing/rest/content/items/e31458fd0c7e41dd9f93144a9550781d/data. They grant a world-wide, royalty-free, non-exclusive licence to use, modify and distribute the data sets. Anyone who receives these files from this project must also receive those terms or that link and is bound by them, without further restrictions. The City may change the terms, and may cancel or suspend a user's access. The owner's decision overrides the earlier hold on these datasets recorded in `sources/gaps.json`.
