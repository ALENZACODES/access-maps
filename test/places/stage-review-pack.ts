import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPackLinks } from "../../src/pack/links.js";
import { sha256File } from "../../src/places/links.js";
import { type SourceCatalogue } from "../../tools/data-qa/place-link-review/provenance.ts";
import { type LinkMember, type LinkSnapshot } from "../../tools/data-qa/place-link-review/snapshot.ts";

/** Exercise the repository's pack publisher with a filtered synthetic source.
 * No record from fixture-delta enters the generated link files. */
export async function stageReviewPack(
  dataRoot: string, out: string, snapshot: LinkSnapshot, registry: SourceCatalogue,
) {
  const packed = new Map<string, string>();
  const admit = (member: LinkMember) => {
    if (member.sourceId !== "fixture-delta") packed.set(member.tranche + "|" + member.id, member.cell);
  };
  for (const group of snapshot.groups) group.members.forEach(admit);
  for (const pair of snapshot.pairs) { admit(pair.a); admit(pair.b); }
  const withheld: string[] = [];
  const links = await buildPackLinks({
    dataRoot, out, packed, digest: sha256File, limit: 25 * 1024 * 1024,
    withhold: part => withheld.push(part.path),
  });
  const sources = [...registry.values()].map(row => ({
    sourceId: row.sourceId, name: row.sourceName, licence: row.licence, licenceUrl: row.licenceUrl,
    attribution: row.attribution, retrieved: row.retrievedOn, shareAlike: row.licence === "ODbL-1.0",
    inWebPack: row.sourceId !== "fixture-delta", heldReason: row.sourceId === "fixture-delta" ? "synthetic hold" : null,
  }));
  await writeFile(join(out, "manifest.json"), JSON.stringify({ version: 1, links, sources }));
  return { links, withheld };
}
