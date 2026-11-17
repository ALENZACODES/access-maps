import { importCitiesG3 } from "./import-cities-g3.js";
import { importCitiesG4 } from "./import-cities-g4.js";
import { importCitiesG5 } from "./import-cities-g5.js";
import { importCitiesG6 } from "./import-cities-g6.js";
import { importCityOpenData } from "./import-city-open-data.js";
import { importWestCities } from "./import-cities-west.js";
import { importGtfs } from "./import-gtfs.js";
import { importMoreMunicipal } from "./import-more-municipal.js";
import { importMunicipal } from "./import-municipal.js";
import { importOsm } from "./import-osm.js";
import { importStatcanLode } from "./import-statcan-lode.js";
import { importYorkDurhamCities } from "./import-york-durham-cities.js";
import { writeCounts } from "./count.js";

const repoRoot = process.cwd();
await importMunicipal(repoRoot);
await importMoreMunicipal(repoRoot);
await importCityOpenData(repoRoot);
await importWestCities(repoRoot);
await importCitiesG3(repoRoot);
await importCitiesG5(repoRoot);
await importYorkDurhamCities(repoRoot);
// Also downloads the Kingston Transit and GOVA Transit zips that importGtfs reads.
await importCitiesG4(repoRoot);
await importCitiesG6(repoRoot);
await importGtfs(repoRoot);
await importStatcanLode(repoRoot);
await importOsm(repoRoot);
await writeCounts(repoRoot);
