import { importCitiesG3 } from "./import-cities-g3.js";
import { importCityOpenData } from "./import-city-open-data.js";
import { importGtfs } from "./import-gtfs.js";
import { importMoreMunicipal } from "./import-more-municipal.js";
import { importMunicipal } from "./import-municipal.js";
import { importOsm } from "./import-osm.js";
import { writeCounts } from "./count.js";

const repoRoot = process.cwd();
await importMunicipal(repoRoot);
await importMoreMunicipal(repoRoot);
await importCityOpenData(repoRoot);
await importCitiesG3(repoRoot);
await importGtfs(repoRoot);
await importOsm(repoRoot);
await writeCounts(repoRoot);
