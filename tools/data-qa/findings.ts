/**
 * Documented checkStrictData findings for real pack and registry records.
 *
 * These source/licence pairs are in the repo and may be redistributed only
 * under their own terms (see sources/registry.json and pack/README.md).
 * They are not in the strict export allowlist used by checkStrictData
 * (CC0-1.0, CC-BY-4.0, ODbL-1.0, OGL-Canada-2.0, OGL-ON-1.0). The CI job
 * records the licence mismatch and still fails on any other violation.
 *
 * Do not treat a documented finding as an open-export licence. Do not add
 * MiWay. Do not widen the allowlist here.
 */

export interface LicenceFinding {
  readonly sourceId: string;
  readonly licence: string;
  readonly reason: string;
}

export const LICENCE_FINDINGS: readonly LicenceFinding[] = [
  {
    sourceId: "gtfs-ttc",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-park-washrooms",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-street-washrooms",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-crem-washrooms",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "gtfs-rt-ttc-accessibility",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "metrolinx-go",
    licence: "Metrolinx Access and Use Agreement (accepted 2026-11-15)",
    reason: "Permissioned feed under the Metrolinx Access and Use Agreement, not an allowlisted open licence. Kept in its own transit part.",
  },
  {
    sourceId: "metrolinx-up",
    licence: "Metrolinx Access and Use Agreement (accepted 2026-11-15)",
    reason: "Permissioned feed under the Metrolinx Access and Use Agreement, not an allowlisted open licence. Kept in its own transit part.",
  },
  {
    sourceId: "gtfs-grt-bus",
    licence: "Region-of-Waterloo-Open-Data-Licence-2.0",
    reason: "Region of Waterloo Open Data Licence v2. Not in the strict export allowlist.",
  },
  {
    sourceId: "gtfs-grt-ion",
    licence: "Region-of-Waterloo-Open-Data-Licence-2.0",
    reason: "Region of Waterloo Open Data Licence v2. Not in the strict export allowlist.",
  },
  {
    sourceId: "gtfs-brampton",
    licence: "CC-BY",
    reason: "Creative Commons Attribution, version unspecified in the registry. Not the same identifier as allowlisted CC-BY-4.0.",
  },
  {
    sourceId: "brampton-recreation-centres",
    licence: "CC-BY",
    reason: "Creative Commons Attribution, version unspecified in the registry. Not the same identifier as allowlisted CC-BY-4.0.",
  },
  {
    sourceId: "gtfs-hsr",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "gtfs-ltc",
    licence: "LTC Open Data Terms of Use",
    reason: "London Transit Commission Terms of Use. Not in the strict export allowlist.",
  },
  {
    sourceId: "kingston-public-washrooms",
    licence: "Kingston-Open-Data-Licence-1.0",
    reason: "City of Kingston Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "kingston-accessible-features",
    licence: "Kingston-Open-Data-Licence-1.0",
    reason: "City of Kingston Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "sudbury-fieldhouses",
    licence: "Greater-Sudbury-Open-Data-Licence-1.0",
    reason: "City of Greater Sudbury Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "mto-picnic-parks",
    licence: "OGL-Ontario-1.0",
    reason: "Open Government Licence — Ontario, recorded as OGL-Ontario-1.0. The strict allowlist spells this OGL-ON-1.0, so the identifiers are not treated as equal.",
  },
  {
    sourceId: "toronto-accessible-parking-stalls",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-traffic-signals",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-library-branches",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-drinking-fountains",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-parks-recreation-facilities",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-community-centre-washrooms",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "toronto-pedestrian-network",
    licence: "OGL-Toronto-1.0",
    reason: "Open Government Licence — Toronto. Not in the strict export allowlist.",
  },
  {
    sourceId: "ottawa-public-washrooms",
    licence: "Ottawa-Open-Data-Licence-2.0",
    reason: "Open Government Licence — City of Ottawa, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "ottawa-parks-inventory",
    licence: "Ottawa-Open-Data-Licence-2.0",
    reason: "Open Government Licence — City of Ottawa, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "ottawa-park-parking",
    licence: "Ottawa-Open-Data-Licence-2.0",
    reason: "Open Government Licence — City of Ottawa, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "hamilton-park-washrooms",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "hamilton-drinking-fountains",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "hamilton-bus-stop-amenities",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "hamilton-pedestrian-features",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "hamilton-trails",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "hamilton-sidewalks",
    licence: "City-of-Hamilton-Open-Data-Licence",
    reason: "City of Hamilton Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "brampton-recreational-trails",
    licence: "CC-BY",
    reason: "Creative Commons Attribution, version unspecified in the registry. Not the same identifier as allowlisted CC-BY-4.0.",
  },
  {
    sourceId: "peel-trails",
    licence: "Peel-Open-Data-Licence-1.0",
    reason: "Open Data Licence for The Regional Municipality of Peel, Version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "york-region-yrt-bus-stops",
    licence: "York-Region-Open-Data-Licence-1.0",
    reason: "York Region Open Data Licence, version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "markham-city-facilities",
    licence: "Markham-Open-Data-Licence-1.0",
    reason: "Open Data Licence – City of Markham, version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "markham-trails",
    licence: "Markham-Open-Data-Licence-1.0",
    reason: "Open Data Licence – City of Markham, version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "newmarket-park-features",
    licence: "Newmarket-Open-Data-Licence-2.0",
    reason: "Open Data Licence – Town of Newmarket, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "newmarket-trails",
    licence: "Newmarket-Open-Data-Licence-2.0",
    reason: "Open Data Licence – Town of Newmarket, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "newmarket-trail-points",
    licence: "Newmarket-Open-Data-Licence-2.0",
    reason: "Open Data Licence – Town of Newmarket, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "newmarket-landmarks",
    licence: "Newmarket-Open-Data-Licence-2.0",
    reason: "Open Data Licence – Town of Newmarket, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "oakville-town-washrooms",
    licence: "Oakville-Open-Data-Licence",
    reason: "Town of Oakville Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "oakville-transit-gtfs",
    licence: "Oakville-Open-Data-Licence",
    reason: "Town of Oakville Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "milton-parking-lots",
    licence: "OGL-Milton-2.0",
    reason: "Open Government Licence – Milton, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "milton-park-amenities",
    licence: "OGL-Milton-2.0",
    reason: "Open Government Licence – Milton, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "milton-sidewalks",
    licence: "OGL-Milton-2.0",
    reason: "Open Government Licence – Milton, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "milton-trails",
    licence: "OGL-Milton-2.0",
    reason: "Open Government Licence – Milton, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "niagara-falls-sidewalks",
    licence: "OGL-Niagara-Falls-1.0",
    reason: "Open Government Licence – Niagara Falls, version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "niagara-falls-trails",
    licence: "OGL-Niagara-Falls-1.0",
    reason: "Open Government Licence – Niagara Falls, version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "niagara-falls-playgrounds",
    licence: "OGL-Niagara-Falls-1.0",
    reason: "Open Government Licence – Niagara Falls, version 1.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "welland-trails",
    licence: "OGL-Welland-2.0",
    reason: "Open Government Licence – City of Welland, version 2.0. Not in the strict export allowlist.",
  },
  {
    sourceId: "welland-public-washrooms",
    licence: "OGL-Welland-2.0",
    reason: "Open Government Licence – City of Welland, version 2.0. Not in the strict export allowlist.",
  },
];

export function isDocumentedLicence(sourceId: string, licence: string): boolean {
  return LICENCE_FINDINGS.some((item) => item.sourceId === sourceId && item.licence === licence);
}
