import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stageReviewPack } from "./stage-review-pack.ts";
import { auditPublication } from "../../tools/data-qa/place-link-review/publication.ts";
import { runMatch } from "../../scripts/match-places.js";
import { writeReviewFixture } from "../../tools/data-qa/place-link-review/fixture.ts";
import { checkInputs } from "../../tools/data-qa/place-link-review/inputs.ts";
import { readProvenance } from "../../tools/data-qa/place-link-review/provenance.ts";
import { buildBook, type Release } from "../../tools/data-qa/place-link-review/review.ts";
import { readSnapshot } from "../../tools/data-qa/place-link-review/snapshot.ts";

it("reviews actual matcher output after a synthetic source record moves between cells", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "matcher-release-review-"));
  try {
    const paths = await writeReviewFixture(workspace);
    async function publish(root: string): Promise<Release> {
      const dataRoot = join(root, "data");
      // Replace the hand-authored declarations with a real matching pass over
      // these source partitions. Both sides must pass the same input audit.
      const publication = await runMatch({ dataRoot, workDir: join(root, "staging") });
      const links = await readSnapshot(dataRoot);
      expect(links.groups).toHaveLength(publication.clusters);
      expect(links.pairs).toHaveLength(publication.possible_duplicates);
      expect(links.inputDigest).toBe(publication.input_digest);
      expect(links.skippedCount).toBe(0);
      const inputs = await checkInputs(dataRoot, links.inputDigest, links.inputFiles);
      expect(inputs.status).toBe("matches");
      const registry = readProvenance(JSON.parse(await readFile(join(root, "sources/registry.json"), "utf8")));
      return { links, inputs, registry };
    }
    const before = await publish(paths.beforeRoot);
    const after = await publish(paths.afterRoot);
    const review = buildBook(before, after);
    expect(review.mode).toBe("comparison");
    expect(before.links.groups.length).toBeGreaterThan(after.links.groups.length);
    expect(before.links.pairs.length).toBeGreaterThan(after.links.pairs.length);
    expect(review.groupCounts?.absent).toBe(before.links.groups.length - after.links.groups.length);
    expect(review.pairCounts?.absent).toBe(before.links.pairs.length - after.links.pairs.length);
    expect(review.previous?.inputs?.observedDigest).not.toBe(review.candidate.inputs?.observedDigest);
    expect(review.cases.some(item => item.members.some(member => member.id === "fixture-alpha:move"))).toBe(true);
    for (const item of review.cases) {
      expect(item.accessibility).toBe("UNKNOWN");
      expect(item.restricted).toBe(false);
      expect(item.citations.every(c => c.previous?.verificationTier === 0 && c.candidate?.verificationTier === 0)).toBe(true);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("audits the real pack writer's filtered projections across cell boundaries", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "pack-link-review-"));
  try {
    const paths = await writeReviewFixture(workspace);
    const snapshot = await readSnapshot(paths.afterData);
    const registry = readProvenance(JSON.parse(await readFile(paths.afterRegistry, "utf8")));
    const out = join(workspace, "pack", "v1");
    const { links, withheld } = await stageReviewPack(paths.afterData, out, snapshot, registry);
    expect(withheld).toEqual([]);
    expect(links?.current).toBe(true);
    const report = await auditPublication(out, snapshot, registry);
    expect(report.status).toBe("checked");
    expect(report.cells).toHaveLength(2);
    expect(report.cells.every(row => row.status === "checked" && row.groups > 0)).toBe(true);
    expect(report.cells.flatMap(row => row.sourceIds)).not.toContain("fixture-delta");
    expect(report.issues).toEqual([]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
