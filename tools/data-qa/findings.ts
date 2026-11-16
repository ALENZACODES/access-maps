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
    sourceId: "kingston-parking-lots",
    licence: "Kingston-Open-Data-Licence-1.0",
    reason: "City of Kingston Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "kingston-trails",
    licence: "Kingston-Open-Data-Licence-1.0",
    reason: "City of Kingston Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "kingston-points-of-interest",
    licence: "Kingston-Open-Data-Licence-1.0",
    reason: "City of Kingston Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "gtfs-kingston",
    licence: "Kingston-Open-Data-Licence-1.0",
    reason: "City of Kingston Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "greater-sudbury-playgrounds",
    licence: "Greater-Sudbury-Open-Data-Licence-1.0",
    reason: "City of Greater Sudbury Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "greater-sudbury-recreation",
    licence: "Greater-Sudbury-Open-Data-Licence-1.0",
    reason: "City of Greater Sudbury Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "greater-sudbury-walkways",
    licence: "Greater-Sudbury-Open-Data-Licence-1.0",
    reason: "City of Greater Sudbury Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "gtfs-gova",
    licence: "Greater-Sudbury-Open-Data-Licence-1.0",
    reason: "City of Greater Sudbury Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "thunder-bay-sidewalks",
    licence: "Thunder-Bay-Open-Data-Licence-1.0",
    reason: "City of Thunder Bay Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "thunder-bay-trails",
    licence: "Thunder-Bay-Open-Data-Licence-1.0",
    reason: "City of Thunder Bay Open Data Licence. Not in the strict export allowlist.",
  },
  {
    sourceId: "thunder-bay-city-facilities",
    licence: "Thunder-Bay-Open-Data-Licence-1.0",
    reason: "City of Thunder Bay Open Data Licence. Not in the strict export allowlist.",
  },
];

export function isDocumentedLicence(sourceId: string, licence: string): boolean {
  return LICENCE_FINDINGS.some((item) => item.sourceId === sourceId && item.licence === licence);
}
