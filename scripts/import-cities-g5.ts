import { pathToFileURL } from "node:url";
import { mapCambridgeSidewalk, mapCambridgeTrail } from "../src/municipal/cities/cambridge.js";
import {
  mapLondonLibrary,
  mapLondonOffStreetParking,
  mapLondonParkAmenity,
  mapLondonParkingInventory,
  mapLondonSidewalk,
  mapLondonTrail,
  mapLondonWalkway,
} from "../src/municipal/cities/london.js";
import { runLayerJobs, type ImportedSource, type LayerJob } from "./import-cities-g3.js";

/**
 * Importer for the City of London layers and the City of Cambridge Trails and Pedestrian
 * Network layers retrieved on 2026-11-16.
 *
 * These sources are included on the repository owner's statement of 2026-11-16 that their
 * use is permitted; sources/registry.json records that basis and, where the publisher has
 * terms, their URL. Each job names the columns it requests; no other column is downloaded.
 */
export const G5_LAYER_JOBS: readonly LayerJob[] = [
  {
    id: "london-park-amenities",
    tranche: "venue",
    alsoWrites: ["washroom"],
    fields: ["GIS_ID", "Address", "Owner", "Type", "GIS_FeatureKey"],
    map: mapLondonParkAmenity,
  },
  {
    id: "london-parking-inventory",
    tranche: "venue",
    fields: ["GIS_ID", "Name", "Location", "AccessType", "ParkingFacilityType", "CountDisabledSpaces"],
    map: mapLondonParkingInventory,
  },
  {
    id: "london-off-street-parking",
    tranche: "venue",
    fields: ["GIS_ID", "LotName"],
    map: mapLondonOffStreetParking,
  },
  {
    id: "london-libraries",
    tranche: "venue",
    fields: ["GIS_ID", "GIS_FeatureKey", "Address"],
    map: mapLondonLibrary,
  },
  {
    id: "london-sidewalks",
    tranche: "path",
    fields: ["Width", "Material"],
    map: mapLondonSidewalk,
  },
  {
    id: "london-walkways",
    tranche: "path",
    fields: ["Assumed"],
    map: mapLondonWalkway,
  },
  {
    id: "london-trails",
    tranche: "path",
    fields: ["Type", "PathType", "Status"],
    map: mapLondonTrail,
  },
  {
    id: "cambridge-trails",
    tranche: "path",
    fields: ["TRAIL_TYPE", "STATUS", "SURFACE_MATERIAL", "WIDTH", "ACCESSIBLE"],
    map: mapCambridgeTrail,
  },
  {
    id: "cambridge-sidewalks",
    tranche: "path",
    fields: ["ASSET_TYPE", "STATUS", "SURFACE_MATERIAL", "WIDTH"],
    map: mapCambridgeSidewalk,
  },
];

export async function importCitiesG5(repoRoot: string, only: readonly string[] = []): Promise<{ sources: ImportedSource[] }> {
  return runLayerJobs(repoRoot, G5_LAYER_JOBS, only);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importCitiesG5(process.cwd(), process.argv.slice(2));
}
