import { importCitiesG3 } from "./import-cities-g3.js";
import { importCitiesG4 } from "./import-cities-g4.js";
import { importCitiesG5 } from "./import-cities-g5.js";
import { importCityOpenData } from "./import-city-open-data.js";
import { importGtfs } from "./import-gtfs.js";
import { importMoreMunicipal } from "./import-more-municipal.js";
import { importMunicipal } from "./import-municipal.js";
import { importOsm } from "./import-osm.js";
import { importYorkDurhamCities } from "./import-york-durham-cities.js";
import { writeCounts } from "./count.js";

const repoRoot = process.cwd();
await importMunicipal(repoRoot);
await importMoreMunicipal(repoRoot);
await importCityOpenData(repoRoot);
await importCitiesG3(repoRoot);
await importCitiesG5(repoRoot);
await importYorkDurhamCities(repoRoot);
// Also downloads the Kingston Transit and GOVA Transit zips that importGtfs reads.
await importCitiesG4(repoRoot);
await importGtfs(repoRoot);
await importOsm(repoRoot);
await writeCounts(repoRoot);
