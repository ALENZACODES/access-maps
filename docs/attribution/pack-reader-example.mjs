// @ts-check
// Manifest excerpt built from four tracked partitions with the v1 pack builder.
// Only their two region windows and four source declarations are presented.
const example = {
  "version": 1,
  "builtAt": "2026-11-22T00:09:46.542Z",
  "sourceCommit": "ad3aaf21993f8df3639654504e646996abc89680",
  "sources": [
    {
      "sourceId": "osm-ontario",
      "name": "OpenStreetMap, Geofabrik Ontario extract",
      "licence": "ODbL-1.0",
      "licenceUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
      "attribution": "© OpenStreetMap contributors",
      "retrieved": "2026-11-13",
      "shareAlike": true,
      "inWebPack": true,
      "heldReason": null
    },
    {
      "sourceId": "metrolinx-go",
      "name": "GO Transit static GTFS",
      "licence": "Metrolinx Access and Use Agreement (accepted 2026-11-15)",
      "licenceUrl": "https://www.gotransit.com/en/partner-with-us/software-developers",
      "attribution": "Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service. Contains information licensed under the Open Government Licence - Ontario - Metrolinx.",
      "retrieved": "2026-11-15",
      "shareAlike": false,
      "inWebPack": true,
      "heldReason": null
    },
    {
      "sourceId": "metrolinx-up",
      "name": "UP Express static GTFS",
      "licence": "Metrolinx Access and Use Agreement (accepted 2026-11-15)",
      "licenceUrl": "https://www.gotransit.com/en/partner-with-us/software-developers",
      "attribution": "Data used in this product or service is provided with the permission of Metrolinx. Metrolinx makes no representations or warranties of any kind, express or implied, with respect to the Data and assumes no responsibility for the accuracy or currency of the data used in this product or service. Contains information licensed under the Open Government Licence - Ontario - Metrolinx.",
      "retrieved": "2026-11-15",
      "shareAlike": false,
      "inWebPack": true,
      "heldReason": null
    },
    {
      "sourceId": "gtfs-ltc",
      "name": "London Transit Commission GTFS",
      "licence": "LTC Open Data Terms of Use",
      "licenceUrl": "https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/",
      "attribution": "Transit data is available from London Transit Commission under its Terms of Use. Les données de transport en commun sont disponibles auprès de la Commission de transport de London : elles sont offertes aux termes de ses conditions d’utilisation. https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/",
      "retrieved": "2026-11-13",
      "shareAlike": false,
      "inWebPack": true,
      "heldReason": null
    }
  ],
  "regions": [
    {
      "id": "toronto",
      "label": {
        "en": "Toronto",
        "fr": "Toronto"
      },
      "bbox": [
        -79.64,
        43.58,
        -79.11,
        43.86
      ],
      "cells": [
        "n43.5_w079.5"
      ]
    },
    {
      "id": "london",
      "label": {
        "en": "London",
        "fr": "London"
      },
      "bbox": [
        -81.43,
        42.82,
        -80.9,
        43.12
      ],
      "cells": [
        "n43.0_w081.5"
      ]
    }
  ],
  "tranches": {
    "venue": {
      "cells": {}
    },
    "washroom": {
      "cells": {
        "n43.5_w079.5": {
          "bbox": [
            -79.5,
            43.5,
            -79,
            44
          ],
          "parts": [
            {
              "path": "washrooms/osm-ontario/n43.5_w079.5.ndjson.gz",
              "bytes": 88488,
              "sha256": "142c09f6067baa2c0ea55e27f3e98d9d4f3db610308aa478b73f4d6aac84893f",
              "count": 1118,
              "sourceId": "osm-ontario"
            }
          ]
        }
      }
    },
    "transit": {
      "cells": {
        "n43.0_w081.5": {
          "bbox": [
            -81.5,
            43,
            -81,
            43.5
          ],
          "parts": [
            {
              "path": "transit/gtfs-ltc/n43.0_w081.5.ndjson.gz",
              "bytes": 25973,
              "sha256": "d81e57fa8f727370977cf0be58f1504d777016338d86604436864cf12937cdc4",
              "count": 588,
              "sourceId": "gtfs-ltc"
            }
          ]
        },
        "n43.5_w079.5": {
          "bbox": [
            -79.5,
            43.5,
            -79,
            44
          ],
          "parts": [
            {
              "path": "transit/metrolinx-go/n43.5_w079.5.ndjson.gz",
              "bytes": 9224,
              "sha256": "4ae8f6860a606b4eeae8c6ca7d1b6913a4335c14760afe655419973d1616c7c6",
              "count": 201,
              "sourceId": "metrolinx-go"
            },
            {
              "path": "transit/metrolinx-up/n43.5_w079.5.ndjson.gz",
              "bytes": 572,
              "sha256": "5d10c8f2f09fdad11447adda0986edb17b20c0e56a1b3b24194939e2abbacc0b",
              "count": 3,
              "sourceId": "metrolinx-up"
            }
          ]
        }
      }
    },
    "path": {
      "cells": {}
    }
  },
  "search": {
    "n43.0_w081.5": {
      "path": "pack/v1/search/n43.0_w081.5.json.gz",
      "bytes": 18694,
      "sha256": "03309f4f09774829203005581538069d370ecd5c61bba5aa68b1fe8280d07810",
      "count": 588
    },
    "n43.5_w079.5": {
      "path": "pack/v1/search/n43.5_w079.5.json.gz",
      "bytes": 21213,
      "sha256": "56d3422f7b583a54067dac33b24c58d6878b6a1f936a550833118e9da7370b2c",
      "count": 1322
    }
  },
  "tiles": {},
  "counts": {
    "records": 1910,
    "byTranche": {
      "transit": 792,
      "washroom": 1118
    },
    "bySource": {
      "gtfs-ltc": 588,
      "metrolinx-go": 201,
      "metrolinx-up": 3,
      "osm-ontario": 1118
    }
  },
  "withheld": []
};

export function exampleManifestText() {
  return JSON.stringify(example);
}
