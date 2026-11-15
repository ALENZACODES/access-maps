import { buildWebPack } from "../src/pack/build.js";
import { verifyWebPack } from "../src/pack/verify.js";

function argument(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  if (!process.argv[i + 1]) throw new Error(`Missing value for ${name}`);
  return process.argv[i + 1];
}

const data = argument("--data", "data");
const out = argument("--out", "pack/v1");
if (process.argv.includes("--verify")) {
  await verifyWebPack({ data, out });
  console.log("Web pack verified");
} else {
  const manifest = await buildWebPack({ data, out });
  console.log(`Built ${manifest.counts.records} records across ${Object.keys(manifest.search).length} cells`);
}
