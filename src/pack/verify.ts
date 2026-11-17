import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { digest, PACK_FILE_LIMIT, recordsIn } from "./build.js";
import { TILE_FILE_PATTERN } from "../tiles/build.js";
import type { PackManifest, PackPart } from "./types.js";
import { PACK_LINKS_DIR, type PackLinkCell } from "./links.js";

export async function verifyWebPack(options: { data: string; out: string }): Promise<void> {
  const root = path.resolve(options.data);
  const out = path.resolve(options.out);
  const manifest = JSON.parse(await readFile(path.join(out, "manifest.json"), "utf8")) as PackManifest;
  if (manifest.version !== 1) throw new Error("Unsupported manifest version");
  const held = new Set(manifest.sources.filter((entry) => !entry.inWebPack).map((entry) => entry.sourceId));
  let total = 0;
  const trancheCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const searchCounts: Record<string, number> = {};
  async function check(file: string, part: { bytes: number; sha256: string }): Promise<void> {
    const actual = await digest(file);
    if (actual.bytes !== part.bytes || actual.sha256 !== part.sha256) throw new Error(`Digest mismatch: ${file}`);
  }
  const withheld = new Set((manifest.withheld ?? []).map((part) => part.path));
  /** tranche|id of every packed record, with its cell and source. */
  const packedRecords = new Map<string, { cell: string; sourceId: string }>();
  for (const [tranche, group] of Object.entries(manifest.tranches)) {
    for (const [cell, entry] of Object.entries(group.cells)) {
      for (const part of entry.parts) {
        if (held.has(part.sourceId)) throw new Error(`Held source included: ${part.sourceId}`);
        if (withheld.has(part.path)) throw new Error(`Withheld part included: ${part.path}`);
        const file = path.resolve(root, part.path);
        if (!file.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe path: ${part.path}`);
        await check(file, part);
        let count = 0;
        for await (const record of recordsIn(file)) {
          if (record.tranche !== tranche || record.region !== cell) throw new Error(`Incorrect partition: ${file}`);
          packedRecords.set(`${record.tranche}|${record.id}`, { cell, sourceId: part.sourceId });
          count++;
        }
        if (count !== part.count) throw new Error(`Count mismatch: ${file}`);
        total += count;
        searchCounts[cell] = (searchCounts[cell] ?? 0) + count;
        trancheCounts[tranche] = (trancheCounts[tranche] ?? 0) + count;
        sourceCounts[part.sourceId] = (sourceCounts[part.sourceId] ?? 0) + count;
      }
    }
  }
  for (const [cell, part] of Object.entries(manifest.search)) {
    const expected = `pack/v1/search/${cell}.json.gz`;
    if (part.path !== expected) throw new Error(`Invalid search path: ${part.path}`);
    const file = path.join(out, "search", `${cell}.json.gz`);
    await check(file, part);
    if (part.count !== searchCounts[cell]) throw new Error(`Search count mismatch: ${cell}`);
    const { createReadStream } = await import("node:fs");
    const { createGunzip } = await import("node:zlib");
    const { Writable } = await import("node:stream");
    let elements = 0;
    // Validate count without collecting the decompressed array in memory.
    // Index hits contain no nested JSON objects, so count object starts.
    let inString = false;
    let escaped = false;
    let depth = 0;
    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(file).pipe(createGunzip());
      input.on("error", reject);
      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          for (const char of chunk.toString("utf8")) {
            if (escaped) { escaped = false; continue; }
            if (char === "\\" && inString) { escaped = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (!inString) {
              if (char === "{") { if (depth === 0) elements++; depth++; }
              if (char === "}") depth--;
            }
          }
          callback();
        },
      });
      sink.on("finish", resolve);
      sink.on("error", reject);
      input.pipe(sink);
    });
    if (elements !== part.count || depth !== 0 || inString) throw new Error(`Invalid search count: ${cell}`);
  }
  if (Object.keys(searchCounts).some((cell) => !manifest.search[cell])) throw new Error("Missing search cell");
  if (total !== manifest.counts.records) throw new Error("Total count mismatch");
  const aggregates: Array<[Record<string, number>, Record<string, number>]> = [
    [manifest.counts.bySource, sourceCounts],
    [manifest.counts.byTranche, trancheCounts],
  ];
  for (const [expected, actual] of aggregates) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      if (Object.keys(expected).length !== Object.keys(actual).length || Object.entries(expected).some(([key, n]) => actual[key] !== n)) {
        throw new Error("Aggregate count mismatch");
      }
    }
  }
  if (manifest.links) await verifyLinks(out, manifest, packedRecords, held, withheld, check);
  for (const [key, tile] of Object.entries(manifest.tiles)) {
    const file = path.resolve(root, tile.path);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe tile path");
    if (withheld.has(tile.path)) throw new Error(`Withheld tile included: ${tile.path}`);
    // The key, the path and the licence agree, so an ODbL file is never listed as open data or the other way round.
    const [family, band] = key.split("/");
    const name = path.posix.basename(tile.path);
    const match = TILE_FILE_PATTERN.exec(name);
    if ((family !== "open" && family !== "odbl") || !match || tile.path !== `tiles/${family}/${name}` || (match[1] ?? undefined) !== band) throw new Error(`Tile key does not match its path: ${key}`);
    if (tile.licence !== (family === "odbl" ? "ODbL-1.0" : "mixed-open")) throw new Error(`Tile licence does not match its family: ${key}`);
    const size = (await stat(file)).size;
    if (size > PACK_FILE_LIMIT || size !== tile.bytes) throw new Error(`Tile size mismatch: ${tile.path}`);
    await check(file, tile);
  }
}

/**
 * Every link file is listed with its size and hash; every member it names is
 * a packed record in the cell it says, from a source that is in the pack;
 * a cluster has at least two members from different sources and appears in
 * the file of every cell it touches.
 */
async function verifyLinks(
  out: string,
  manifest: PackManifest,
  packed: ReadonlyMap<string, { cell: string; sourceId: string }>,
  held: ReadonlySet<string>,
  withheld: ReadonlySet<string>,
  check: (file: string, part: { bytes: number; sha256: string }) => Promise<void>,
): Promise<void> {
  const { gunzipSync } = await import("node:zlib");
  const links = manifest.links!;
  const clustersByCell = new Map<string, Set<string>>();
  const expected: Array<{ id: string; cells: string[] }> = [];
  for (const [cell, part] of Object.entries(links.cells)) {
    if (part.path !== `pack/v1/${PACK_LINKS_DIR}/${cell}.json.gz`) throw new Error(`Invalid link path: ${part.path}`);
    if (withheld.has(`links/${cell}.json.gz`)) throw new Error(`Withheld link file included: ${cell}`);
    const file = path.join(out, PACK_LINKS_DIR, `${cell}.json.gz`);
    await check(file, part);
    const body = JSON.parse(gunzipSync(await readFile(file)).toString("utf8")) as PackLinkCell;
    if (body.cell !== cell || body.method !== links.method) throw new Error(`Link file header mismatch: ${cell}`);
    if (body.clusters.length !== part.clusters || body.possible.length !== part.possible) throw new Error(`Link count mismatch: ${cell}`);
    const ids = new Set<string>();
    for (const cluster of body.clusters) {
      if (cluster.members.length < 2) throw new Error(`Cluster with fewer than two records: ${cluster.id}`);
      const sources = new Set<string>();
      for (const member of cluster.members) {
        const key = `${member.tranche}|${member.id}`;
        const record = packed.get(key);
        if (!record) throw new Error(`Link names a record that is not packed: ${key}`);
        if (record.cell !== member.cell || record.sourceId !== member.sourceId) throw new Error(`Link member does not match its record: ${key}`);
        if (held.has(member.sourceId)) throw new Error(`Link names a held source: ${member.sourceId}`);
        if (sources.has(member.sourceId)) throw new Error(`Cluster has two records from one source: ${cluster.id}`);
        sources.add(member.sourceId);
      }
      if (!cluster.members.some((member) => member.cell === cell)) throw new Error(`Cluster listed in a cell it does not touch: ${cluster.id}`);
      ids.add(cluster.id);
      expected.push({ id: cluster.id, cells: [...new Set(cluster.members.map((member) => member.cell))] });
    }
    for (const item of body.possible) {
      for (const member of [item.a, item.b]) {
        const record = packed.get(`${member.tranche}|${member.id}`);
        if (!record || record.cell !== member.cell || held.has(member.sourceId)) throw new Error(`Possible duplicate names a record that is not packed: ${member.id}`);
      }
    }
    clustersByCell.set(cell, ids);
  }
  for (const item of expected) {
    for (const cell of item.cells) {
      // A cell whose link file was withheld (listed in manifest.withheld) has no file to check.
      if (!links.cells[cell] && withheld.has(`links/${cell}.json.gz`)) continue;
      if (!clustersByCell.get(cell)?.has(item.id)) throw new Error(`Cluster ${item.id} is missing from the link file of ${cell}`);
    }
  }
}
