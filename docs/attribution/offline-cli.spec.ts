import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { executeOfflineCli, parseOfflineCliArguments, OfflineCliError } from "./offline-cli.js";
import { fixtureBundle, fixtureRoute, withRoutes } from "./offline-fixtures.js";

// The repository runs these sources with tsx. When compiled for a standalone
// Node test run, use the emitted JavaScript counterpart instead.
const sourceIsTypeScript = import.meta.url.endsWith(".ts");
const cliUrl = new URL(sourceIsTypeScript ? "./offline-cli.ts" : "./offline-cli.js", import.meta.url);
const nodeLoaderArgs = sourceIsTypeScript ? ["--import", "tsx"] : [];

async function temporary<T>(run:(root:string)=>Promise<T>):Promise<T> {
  const root = await mkdtemp(join(tmpdir(),"offline-cli-"));
  try { return await run(root); }
  finally { await rm(root,{recursive:true,force:true}); }
}
async function manifest(root:string, bundle = fixtureBundle()):Promise<string> {
  const path = join(root,"manifest.json");
  await writeFile(path,JSON.stringify(bundle),"utf8");
  return path;
}
async function assetFiles(root:string):Promise<void> {
  await mkdir(join(root,"assets"),{recursive:true});
  await writeFile(join(root,"index.html"),"hello world!");
  await writeFile(join(root,"assets/main.js"),"test");
}

test("the CLI accepts one required manifest argument", () => {
  assert.deepEqual(parseOfflineCliArguments(["bundle.json"]),{
    manifest:"bundle.json",root:null,locale:"en",format:"text",allowOnline:false,
  });
});

test("the CLI accepts independent locale, format, directory and connectivity options", () => {
  const parsed = parseOfflineCliArguments(["--lang","fr","--root","./public","bundle.json","--format","json","--allow-online"]);
  assert.deepEqual(parsed,{
    manifest:"bundle.json",root:"./public",locale:"fr",format:"json",allowOnline:true,
  });
});

test("the CLI accepts html formatting", () => {
  assert.equal(parseOfflineCliArguments(["bundle.json","--format","html"]).format,"html");
});

test("the CLI rejects missing manifests", () => {
  assert.throws(() => parseOfflineCliArguments([]),OfflineCliError);
  assert.throws(() => parseOfflineCliArguments(["--lang","fr"]),OfflineCliError);
});

test("the help option explains usage without reading a file", async () => {
  const result = await executeOfflineCli(["--help"]);
  assert.equal(result.status,2);
  assert.ok(result.error.includes("Usage:"));
  assert.equal(result.output,"");
});

test("the CLI rejects unexpected flags", () => {
  for (const args of [["bundle.json","--write"],["bundle.json","-o","test"],["--quiet","bundle.json"]]) {
    assert.throws(() => parseOfflineCliArguments(args),OfflineCliError);
  }
});

test("the CLI rejects duplicate arguments and duplicate manifests", () => {
  const bad = [
    ["bundle.json","bundle2.json"],
    ["bundle.json","--lang","fr","--lang","en"],
    ["bundle.json","--format","json","--format","html"],
    ["bundle.json","--root","a","--root","b"],
    ["bundle.json","--allow-online","--allow-online"],
  ];
  for (const args of bad) assert.throws(() => parseOfflineCliArguments(args),OfflineCliError,args.join(" "));
});

test("the CLI rejects unknown locale values", () => {
  for (const locale of ["FR","fr-CA","es","", "UNKNOWN"]) {
    assert.throws(() => parseOfflineCliArguments(["bundle.json","--lang",locale]),OfflineCliError);
  }
});

test("the CLI rejects unknown report formats", () => {
  for (const format of ["yaml","pdf","xml","CSV",""]) {
    assert.throws(() => parseOfflineCliArguments(["bundle.json","--format",format]),OfflineCliError);
  }
});

test("the CLI handles missing option values", () => {
  for (const option of ["--lang","--root","--format"]) {
    assert.throws(() => parseOfflineCliArguments(["bundle.json",option]),OfflineCliError);
    assert.throws(() => parseOfflineCliArguments(["bundle.json",option,"--allow-online"]),OfflineCliError);
  }
});

test("a valid manifest succeeds without filesystem scan", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    const result = await executeOfflineCli([path]);
    assert.equal(result.status,0,result.error);
    assert.ok(result.output.includes("Release: release-one"));
    assert.equal(result.error,"");
  });
});

test("valid manifest and matching local assets succeed", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    await assetFiles(root);
    const result = await executeOfflineCli([path,"--root",root]);
    assert.equal(result.status,0,result.error);
    assert.ok(result.output.includes("Offline attribution bundle report"));
  });
});

test("missing local files block with exit code one", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    const result = await executeOfflineCli([path,"--root",root]);
    assert.equal(result.status,1);
    assert.ok(result.output.includes("FILE_UNAVAILABLE"));
  });
});

test("tampered local files block with exit code one", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    await assetFiles(root);
    await writeFile(join(root,"assets/main.js"),"evil");
    const result = await executeOfflineCli([path,"--root",root]);
    assert.equal(result.status,1);
    assert.ok(result.output.includes("FILE_HASH_MISMATCH"));
  });
});

test("missing declared route asset blocks with exit code one", async () => {
  await temporary(async (root) => {
    const path = await manifest(root,withRoutes(fixtureBundle(),[fixtureRoute({entry:"missing.html"})]));
    const result = await executeOfflineCli([path]);
    assert.equal(result.status,1);
    assert.ok(result.output.includes("ENTRY_MISSING"));
  });
});

test("French text output carries nonbreaking spaces", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    const result = await executeOfflineCli([path,"--lang","fr"]);
    assert.equal(result.status,0);
    assert.ok(result.output.includes("Version\u00a0: release-one"));
    assert.ok(result.output.includes("Octets déclarés\u00a0: 16"));
  });
});

test("French HTML output uses lang=fr and no remote scripts", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    const result = await executeOfflineCli([path,"--lang","fr","--format","html"]);
    assert.equal(result.status,0);
    assert.ok(result.output.includes('lang="fr"'));
    assert.ok(result.output.includes("default-src 'none'"));
    assert.ok(!result.output.includes("<script"));
  });
});

test("JSON output contains structured release audit and route closure", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    const result = await executeOfflineCli([path,"--format","json"]);
    assert.equal(result.status,0);
    const data = JSON.parse(result.output) as {schema:string;routes:{home:string[]}};
    assert.equal(data.schema,"attribution-offline-report/1");
    assert.deepEqual(data.routes.home,["assets/main.js","index.html"]);
  });
});

test("JSON output records filesystem count when root is given", async () => {
  await temporary(async (root) => {
    await assetFiles(root);
    const path = await manifest(root);
    const result = await executeOfflineCli([path,"--format","json","--root",root]);
    assert.equal(result.status,0);
    const data = JSON.parse(result.output) as {filesystem:{inspected:number;matched:number;missing:number}};
    assert.deepEqual(data.filesystem,{inspected:2,matched:2,missing:0});
  });
});

test("missing manifest returns input error code two", async () => {
  await temporary(async (root) => {
    const result = await executeOfflineCli([join(root,"missing.json")]);
    assert.equal(result.status,2);
    assert.equal(result.output,"");
    assert.ok(result.error.length > 0);
  });
});

test("invalid manifest JSON returns input error code two", async () => {
  await temporary(async (root) => {
    const path = join(root,"bad.json");
    await writeFile(path,"not-json");
    const result = await executeOfflineCli([path]);
    assert.equal(result.status,2);
    assert.ok(result.error.includes("Invalid JSON"));
  });
});

test("unsupported manifest schema returns input error code two", async () => {
  await temporary(async (root) => {
    const path = await manifest(root,{...fixtureBundle(),schema:"other"} as never);
    const result = await executeOfflineCli([path]);
    assert.equal(result.status,2);
    assert.ok(result.error.includes("Unsupported schema"));
  });
});

test("additional unrecognized manifest keys cause input failure", async () => {
  await temporary(async (root) => {
    const path = await manifest(root,{...fixtureBundle(),extra:1} as never);
    const result = await executeOfflineCli([path]);
    assert.equal(result.status,2);
    assert.ok(result.error.includes("Unknown field"));
  });
});

test("allow-online does not hide a missing linked source", async () => {
  await temporary(async (root) => {
    const path = await manifest(root,withRoutes(fixtureBundle(),[fixtureRoute({sourceIds:["missing"]})]));
    const result = await executeOfflineCli([path,"--allow-online"]);
    assert.equal(result.status,1);
    assert.ok(result.output.includes("ROUTE_SOURCE_MISSING"));
  });
});

test("the CLI does not persist reports to the user's directory", async () => {
  await temporary(async (root) => {
    await assetFiles(root);
    const path = await manifest(root);
    const result = await executeOfflineCli([path,"--root",root,"--format","html"]);
    assert.equal(result.status,0);
    const {readdir} = await import("node:fs/promises");
    assert.deepEqual((await readdir(root)).sort(),["assets","index.html","manifest.json"]);
  });
});

test("the CLI executable path starts only when invoked as an entrypoint", async () => {
  const source = fileURLToPath(cliUrl);
  const child = spawnSync(process.execPath,[...nodeLoaderArgs,"--input-type=module","-e",`import(${JSON.stringify(cliUrl.href)});`],{
    encoding:"utf8",timeout:10000,
  });
  assert.equal(child.status,0,child.stderr);
  assert.equal(child.stdout,"");
  assert.equal(child.stderr,"");
  assert.ok(/offline-cli\.(?:ts|js)$/u.test(source));
});

test("the CLI process returns zero for a valid manifest", async () => {
  await temporary(async (root) => {
    const path = await manifest(root);
    const executable = fileURLToPath(cliUrl);
    const child = spawnSync(process.execPath,[...nodeLoaderArgs,executable,path],{encoding:"utf8",timeout:10000});
    assert.equal(child.status,0,child.stderr);
    assert.ok(child.stdout.includes("release-one"));
    assert.equal(child.stderr,"");
  });
});

test("the CLI process returns one for a blocking manifest", async () => {
  await temporary(async (root) => {
    const path = await manifest(root,withRoutes(fixtureBundle(),[fixtureRoute({entry:"missing.html"})]));
    const executable = fileURLToPath(cliUrl);
    const child = spawnSync(process.execPath,[...nodeLoaderArgs,executable,path],{encoding:"utf8",timeout:10000});
    assert.equal(child.status,1,child.stderr);
    assert.ok(child.stdout.includes("ENTRY_MISSING"));
  });
});

test("the CLI process returns two for an absent manifest", () => {
  const executable = fileURLToPath(cliUrl);
  const child = spawnSync(process.execPath,[...nodeLoaderArgs,executable,"missing-bundle.json"],{encoding:"utf8",timeout:10000});
  assert.equal(child.status,2);
  assert.ok(child.stderr.length > 0);
});
