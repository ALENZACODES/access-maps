import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeReviewFixture } from "./fixture.ts";
import { readSnapshot } from "./snapshot.ts";
import { readProvenance } from "./provenance.ts";
import { buildBook, type Release } from "./review.ts";
import { renderText, renderHtml } from "./report.ts";
import { selectPage } from "./view.ts";

async function read(root: string): Promise<Release> {
  return {
    links: await readSnapshot(join(root,"data")),
    registry: readProvenance(JSON.parse(await readFile(join(root,"sources/registry.json"),"utf8"))),
  };
}

test("a paged split retains whole-component edge counts and shows hashes only for its selected window", async t => {
  const root = await mkdtemp(join(tmpdir(),"report-window-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const f = await writeReviewFixture(root);
  const book = buildBook(await read(f.beforeRoot),await read(f.afterRoot));
  const split = book.cases.find(c => c.kind === "split");
  assert.ok(split?.matchingEvidence?.edges);
  assert.ok(split.matchingEvidence.candidate.groups.length > 1);
  const first = selectPage(book,{id:split.id,memberLimit:1});
  const second = selectPage(book,{id:split.id,memberOffset:1,memberLimit:1});
  const a = first.cases[0]!.matchingEvidence!;
  const b = second.cases[0]!.matchingEvidence!;
  assert.deepEqual(a.edges,b.edges);
  assert.deepEqual(a.edges,split.matchingEvidence.edges);
  assert.equal(a.previous.groups.length,1);
  assert.equal(b.previous.groups.length,0);
  assert.equal(a.candidate.groups[0]?.id,split.matchingEvidence.candidate.groups[0]?.id);
  assert.equal(b.candidate.groups[0]?.id,split.matchingEvidence.candidate.groups[1]?.id);
  const shown = b.candidate.groups[0]!.digest!;
  assert.match(shown,/^[a-f0-9]{64}$/u);
  for (const lang of ["en","fr"] as const) {
    assert.ok(renderText(second,lang).includes(shown));
    assert.ok(renderHtml(second,lang).includes(shown));
  }
});

test("reconciling a held source removes matching evidence from all case exports", async t => {
  const root = await mkdtemp(join(tmpdir(),"report-restriction-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const f = await writeReviewFixture(root);
  const previous = await read(f.beforeRoot);
  const candidate = await read(f.afterRoot);
  const before = buildBook(previous,candidate).cases.find(c => c.kind === "promoted")!;
  assert.ok(before.matchingEvidence?.previous.possibleDigest);
  assert.ok(before.citations.length > 1);
  const id = before.citations[0]!.sourceId;
  const raw = JSON.parse(await readFile(f.afterRegistry,"utf8")) as {sources: Array<Record<string,unknown>>};
  const held = raw.sources.find(s => s.id === id);
  assert.ok(held);
  held.notes = "held for legal review";
  const book = buildBook(previous,{links:candidate.links,registry:readProvenance(raw)});
  const page = selectPage(book,{id:before.id});
  const limited = page.cases[0]!;
  assert.equal(limited.restricted,true);
  assert.deepEqual(limited.members,[]);
  assert.deepEqual(limited.cells,[]);
  assert.equal(limited.matchingEvidence,null);
  const original = before.matchingEvidence.previous.possibleDigest;
  for (const output of [JSON.stringify(page),renderHtml(page,"en"),renderText(page,"fr")]) {
    assert.ok(!output.includes(original));
    assert.ok(!output.includes(before.members[0]!.id));
  }
});

test("offline report hashes authorize precisely the CSS and JS embedded in the generated file", async t => {
  const root = await mkdtemp(join(tmpdir(),"report-policy-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const f = await writeReviewFixture(root);
  const page = selectPage(buildBook(await read(f.beforeRoot),await read(f.afterRoot)));
  for (const language of ["en","fr"] as const) {
    const output = renderHtml(page,language);
    for (const [tag,directive] of [["script","script-src"],["style","style-src"]]) {
      const body = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,"u").exec(output)?.[1];
      assert.ok(body);
      const digest = createHash("sha256").update(body).digest("base64");
      assert.ok(output.includes(directive + " &#39;sha256-" + digest + "&#39;"));
    }
    assert.ok(output.includes("default-src &#39;none&#39;"));
    assert.doesNotMatch(output,/<(?:script|link)\b[^>]*(?:src|href)=/iu);
  }
});
