import { importGtfs } from "./import-gtfs.js";
import { importMoreMunicipal } from "./import-more-municipal.js";
import { importMunicipal } from "./import-municipal.js";
import { importOsm } from "./import-osm.js";
import { writeCounts } from "./count.js";

const repoRoot = process.cwd();
await importMunicipal(repoRoot);
await importMoreMunicipal(repoRoot);
await importGtfs(repoRoot);
await importOsm(repoRoot);
await writeCounts(repoRoot);
