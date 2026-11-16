import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditBundleFiles, combinedFindings } from "./offline-files.js";
import { fixtureBundle, fixtureAsset, sha256, withAssets, withRoutes, fixtureRoute } from "./offline-fixtures.js";
import type { BundleAsset, OfflineBundle } from "./offline-bundle.js";

async function temporary<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "attribution-bundle-"));
  try { return await run(root); }
  finally { await rm(root,{recursive:true,force:true}); }
}
async function installFixture(root: string): Promise<void> {
  await mkdir(join(root,"assets"),{recursive:true});
  await writeFile(join(root,"index.html"),"hello world!");
  await writeFile(join(root,"assets/main.js"),"test");
}
async function inspect(root: string, bundle: OfflineBundle = fixtureBundle()) {
  return auditBundleFiles(bundle,root);
}

test("valid asset files pass actual-byte and digest audit", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const result = await inspect(root);
    assert.equal(result.blocked,false,JSON.stringify(combinedFindings(result)));
    assert.equal(result.inspected,2);
    assert.equal(result.matched,2);
    assert.equal(result.missing,0);
    assert.deepEqual(result.files,[]);
  });
});

test("all intended included files are inspected", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await writeFile(join(root,"assets/extra.json"),"{}");
    const base = fixtureBundle();
    const extra = fixtureAsset({path:"assets/extra.json",kind:"json",bytes:2,sha256:sha256("{}"),dependencies:[],sourceIds:[]});
    const result = await inspect(root,withAssets(base,[...base.assets,extra]));
    assert.equal(result.inspected,3);
    assert.equal(result.matched,3);
    assert.equal(result.files.length,0);
    assert.equal(result.base.problems.some((p) => p.code === "UNUSED_INCLUDED_ASSET"),true);
  });
});

test("absent entry file is a hard release blocker", async () => {
  await temporary(async (root) => {
    await mkdir(join(root,"assets"));
    await writeFile(join(root,"assets/main.js"),"test");
    const result = await inspect(root);
    assert.equal(result.blocked,true);
    assert.equal(result.missing,1);
    assert.equal(result.files[0]?.code,"FILE_UNAVAILABLE");
    assert.equal(result.files[0]?.location,"assets.index.html");
  });
});

test("absent JavaScript dependency is caught even when the route HTML exists", async () => {
  await temporary(async (root) => {
    await writeFile(join(root,"index.html"),"hello world!");
    const result = await inspect(root);
    assert.equal(result.blocked,true);
    assert.equal(result.missing,1);
    assert.equal(result.files[0]?.location,"assets.assets/main.js");
  });
});

test("unexpected additional file bytes produce size mismatch", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await writeFile(join(root,"index.html"),"hello world!!");
    const result = await inspect(root);
    assert.equal(result.blocked,true);
    const codes = result.files.map((item) => item.code);
    assert.ok(codes.includes("FILE_SIZE_MISMATCH"));
    assert.ok(codes.includes("FILE_HASH_MISMATCH"));
    assert.equal(result.matched,1);
  });
});

test("same-size tampering is detected by SHA256", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await writeFile(join(root,"index.html"),"HELLO WORLD!");
    const result = await inspect(root);
    assert.equal(result.blocked,true);
    assert.deepEqual(result.files.map((item) => item.code),["FILE_HASH_MISMATCH"]);
    assert.equal(result.files[0]?.actualBytes,12);
    assert.notEqual(result.files[0]?.actualHash,result.files[0]?.expectedHash);
  });
});

test("wrong declared size fails even with a matching SHA", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const bundle = fixtureBundle();
    const changed = withAssets(bundle,[fixtureAsset({bytes:13}),bundle.assets[1]!]);
    const result = await inspect(root,changed);
    assert.deepEqual(result.files.map((item) => item.code),["FILE_SIZE_MISMATCH"]);
  });
});

test("wrong declared digest fails even with a matching size", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const bundle = fixtureBundle();
    const changed = withAssets(bundle,[fixtureAsset({sha256:"f".repeat(64)}),bundle.assets[1]!]);
    const result = await inspect(root,changed);
    assert.deepEqual(result.files.map((item) => item.code),["FILE_HASH_MISMATCH"]);
  });
});

test("a file with zero bytes hashes to the SHA256 empty digest", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await writeFile(join(root,"assets/empty.txt"),"");
    const bundle = fixtureBundle();
    const asset: BundleAsset = fixtureAsset({path:"assets/empty.txt",kind:"binary",bytes:0,sha256:sha256(""),dependencies:[],sourceIds:[]});
    const result = await inspect(root,withAssets(bundle,[...bundle.assets,asset]));
    assert.equal(result.blocked,false,JSON.stringify(result.files));
    assert.equal(result.inspected,3);
  });
});

test("non-included assets are never read", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const bundle = fixtureBundle();
    const notIncluded = fixtureAsset({path:"private/secret.bin",disposition:"held",bytes:500,sha256:"UNKNOWN",dependencies:[],sourceIds:[]});
    const result = await inspect(root,withAssets(bundle,[...bundle.assets,notIncluded]));
    assert.equal(result.inspected,2);
    assert.equal(result.files.length,0);
  });
});

test("read-only filesystem checks never rewrite bundle files", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const original = await readFile(join(root,"index.html"));
    await inspect(root);
    const after = await readFile(join(root,"index.html"));
    assert.deepEqual(after,original);
  });
});

test("symlinked file inside the root is rejected", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await symlink(join(root,"index.html"),join(root,"assets/link.html"));
    const bundle = fixtureBundle();
    const asset = fixtureAsset({path:"assets/link.html",sourceIds:[],dependencies:[]});
    const result = await inspect(root,withAssets(bundle,[...bundle.assets,asset]));
    assert.equal(result.blocked,true);
    assert.ok(result.files.some((entry) => entry.description.includes("SYMLINK_NOT_ALLOWED")));
  });
});

test("symlinked directory inside root is rejected", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await mkdir(join(root,"shadow"));
    await writeFile(join(root,"shadow/file.js"),"abc");
    await symlink(join(root,"shadow"),join(root,"linked"));
    const bundle = fixtureBundle();
    const asset = fixtureAsset({path:"linked/file.js",kind:"js",bytes:3,sha256:sha256("abc"),sourceIds:[],dependencies:[]});
    const result = await inspect(root,withAssets(bundle,[...bundle.assets,asset]));
    assert.equal(result.blocked,true);
    assert.ok(result.files.some((entry) => entry.description.includes("SYMLINK_NOT_ALLOWED")));
  });
});

test("symlink pointing outside the root is blocked", async () => {
  await temporary(async (root) => {
    await temporary(async (outside) => {
      await installFixture(root);
      await writeFile(join(outside,"external.js"),"abc");
      await symlink(join(outside,"external.js"),join(root,"escape.js"));
      const bundle = fixtureBundle();
      const extra = fixtureAsset({path:"escape.js",kind:"js",bytes:3,sha256:sha256("abc"),sourceIds:[],dependencies:[]});
      const result = await inspect(root,withAssets(bundle,[...bundle.assets,extra]));
      assert.equal(result.blocked,true);
      assert.ok(result.files.some((entry) => entry.code === "FILE_UNAVAILABLE"));
    });
  });
});

test("directories cannot impersonate included regular files", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await mkdir(join(root,"directory"));
    const bundle = fixtureBundle();
    const extra = fixtureAsset({path:"directory",kind:"binary",bytes:0,sha256:sha256(""),sourceIds:[],dependencies:[]});
    const result = await inspect(root,withAssets(bundle,[...bundle.assets,extra]));
    assert.equal(result.blocked,true);
    assert.ok(result.files.some((entry) => entry.description === "NOT_REGULAR_FILE"));
  });
});

test("file size caps fail rather than reading unbounded files", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const result = await auditBundleFiles(fixtureBundle(),root,{maxFileBytes:4});
    assert.equal(result.blocked,true);
    assert.equal(result.files.some((entry) => entry.description === "FILE_TOO_LARGE"),true);
    assert.equal(result.inspected,2);
  });
});

test("invalid file-size caps reject immediately", async () => {
  await temporary(async (root) => {
    for (const cap of [0,-1,1.5,Infinity,NaN,1024*1024*1024+1]) {
      await assert.rejects(() => auditBundleFiles(fixtureBundle(),root,{maxFileBytes:cap}),RangeError);
    }
  });
});

test("invalid concurrency limits reject immediately", async () => {
  await temporary(async (root) => {
    for (const concurrency of [0,-1,1.2,17,Infinity,NaN]) {
      await assert.rejects(() => auditBundleFiles(fixtureBundle(),root,{concurrency}),RangeError);
    }
  });
});

test("single worker and multiple workers return equivalent findings", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await writeFile(join(root,"assets/main.js"),"wrong");
    const sequential = await auditBundleFiles(fixtureBundle(),root,{concurrency:1});
    const parallel = await auditBundleFiles(fixtureBundle(),root,{concurrency:8});
    assert.deepEqual(parallel.files,sequential.files);
    assert.equal(parallel.blocked,sequential.blocked);
    assert.equal(parallel.matched,sequential.matched);
  });
});

test("input manifest with missing paths blocks before file scan success", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const bundle = withRoutes(fixtureBundle(),[fixtureRoute({entry:"missing.html"})]);
    const result = await inspect(root,bundle);
    assert.equal(result.base.blocked,true);
    assert.equal(result.blocked,true);
    assert.equal(result.files.length,0);
  });
});

test("missing redistribution permission blocks even with matching files", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const bundle = fixtureBundle();
    const release = {...bundle.release,sources:bundle.release.sources.map((s) => ({...s,redistributionPermission:"UNKNOWN" as const}))};
    const result = await inspect(root,{...bundle,release});
    assert.equal(result.files.length,0);
    assert.equal(result.base.evidence.blocked,true);
    assert.equal(result.blocked,true);
  });
});

test("mutating files after a successful scan changes the next result", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const good = await inspect(root);
    assert.equal(good.blocked,false);
    await writeFile(join(root,"assets/main.js"),"tampered");
    const bad = await inspect(root);
    assert.equal(bad.blocked,true);
    assert.ok(bad.files.length >= 1);
    assert.equal(good.files.length,0);
  });
});

test("combined findings include both manifest and physical file issues", async () => {
  await temporary(async (root) => {
    const bundle = withRoutes(fixtureBundle(),[fixtureRoute({entry:"missing.html"})]);
    const result = await inspect(root,bundle);
    const combined = combinedFindings(result);
    assert.ok(combined.some((item) => item.code === "ENTRY_MISSING"));
    assert.ok(combined.some((item) => item.code === "FILE_UNAVAILABLE"));
    assert.ok(combined.some((item) => item.level === "block"));
  });
});

test("file findings expose expected and actual values distinctly", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    await writeFile(join(root,"index.html"),"HELLO WORLD!");
    const result = await inspect(root);
    const item = result.files.find((entry) => entry.code === "FILE_HASH_MISMATCH");
    assert.equal(item?.expectedBytes,12);
    assert.equal(item?.actualBytes,12);
    assert.equal(item?.expectedHash,sha256("hello world!"));
    assert.equal(item?.actualHash,sha256("HELLO WORLD!"));
  });
});

test("unknown hash is still blocked by manifest audit", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const bundle = fixtureBundle();
    const result = await inspect(root,withAssets(bundle,[fixtureAsset({sha256:"UNKNOWN"}),bundle.assets[1]!]));
    assert.equal(result.files.length,0);
    assert.equal(result.base.problems.some((item) => item.code === "ASSET_DIGEST_UNKNOWN"),true);
    assert.equal(result.blocked,true);
  });
});

test("allow-online option only affects offline gate; not missing physical files", async () => {
  await temporary(async (root) => {
    const bundle = withRoutes(fixtureBundle(),[fixtureRoute({offline:"UNKNOWN"})]);
    const strict = await auditBundleFiles(bundle,root);
    const lenient = await auditBundleFiles(bundle,root,{requireOffline:false});
    assert.ok(strict.base.problems.some((p) => p.code === "ROUTE_NOT_OFFLINE"));
    assert.ok(!lenient.base.problems.some((p) => p.code === "ROUTE_NOT_OFFLINE"));
    assert.equal(lenient.blocked,true);
  });
});

test("missing root directory returns controlled block findings", async () => {
  await temporary(async (root) => {
    const result = await inspect(join(root,"no-such-directory"));
    assert.equal(result.blocked,true);
    assert.equal(result.missing,2);
    assert.ok(result.files.every((item) => item.code === "FILE_UNAVAILABLE"));
  });
});

test("safe file scanning does not require an internet endpoint", async () => {
  await temporary(async (root) => {
    await installFixture(root);
    const result = await inspect(root);
    assert.equal(result.files.length,0);
  });
});
