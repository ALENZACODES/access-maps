import { once } from "node:events";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { createGzip, type Gzip } from "node:zlib";
import { TRANCHE_DIR, type DataRecord } from "../model/records.js";

interface OpenPart {
  gzip: Gzip;
  output: NodeJS.WritableStream;
}

interface PartState {
  filePath: string;
  uncompressed: number;
  part: number;
}

const MAX_GZIP_BYTES = 24 * 1024 * 1024;

/**
 * Writes gzip NDJSON partitioned by tranche, source, and region.
 * Reopening a region appends another gzip member to the same file.
 * A new part file starts only after the uncompressed budget is spent.
 */
export class PartitionWriter {
  private readonly open = new Map<string, OpenPart>();
  private readonly openedOrder: string[] = [];
  private readonly states = new Map<string, PartState>();
  readonly files: string[] = [];

  constructor(
    private readonly root: string,
    private readonly maxUncompressed = 32_000_000,
    private readonly maxOpen = 256,
  ) {}

  async write(record: DataRecord, sourceId: string): Promise<void> {
    const directory = TRANCHE_DIR[record.tranche];
    const key = `${directory}/${sourceId}/${record.region}`;
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    let state = this.states.get(key);
    if (!state) {
      state = {
        filePath: this.partPath(directory, sourceId, record.region, 1),
        uncompressed: 0,
        part: 1,
      };
      this.states.set(key, state);
      this.files.push(state.filePath);
    }
    if (state.uncompressed > 0 && state.uncompressed + bytes > this.maxUncompressed) {
      await this.closeKey(key);
      state.part += 1;
      state.uncompressed = 0;
      state.filePath = this.partPath(directory, sourceId, record.region, state.part);
      this.files.push(state.filePath);
    }
    let part = this.open.get(key);
    if (!part) {
      if (this.open.size >= this.maxOpen) await this.closeKey(this.openedOrder[0] as string);
      part = this.openStream(state.filePath);
      this.open.set(key, part);
      this.openedOrder.push(key);
    }
    const ok = part.gzip.write(line);
    state.uncompressed += bytes;
    if (!ok) await once(part.gzip, "drain");
  }

  async close(): Promise<void> {
    for (const key of [...this.open.keys()]) await this.closeKey(key);
    const oversized = this.files
      .filter((file) => statSync(file, { throwIfNoEntry: false })?.isFile())
      .map((file) => ({ file, bytes: statSync(file).size }))
      .filter((item) => item.bytes > MAX_GZIP_BYTES);
    if (oversized.length > 0) {
      const listed = oversized.map((item) => `${item.file} (${item.bytes})`).join(", ");
      throw new Error(`partition exceeded ${MAX_GZIP_BYTES} bytes: ${listed}`);
    }
  }

  private partPath(directory: string, sourceId: string, region: string, part: number): string {
    const suffix = part === 1 ? "" : `.p${String(part).padStart(2, "0")}`;
    return path.join(this.root, directory, sourceId, `${region}${suffix}.ndjson.gz`);
  }

  private openStream(filePath: string): OpenPart {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const output = createWriteStream(filePath, { flags: "a" });
    const gzip = createGzip({ level: 9 });
    gzip.pipe(output);
    return { gzip, output };
  }

  private async closeKey(key: string): Promise<void> {
    const part = this.open.get(key);
    if (!part) return;
    this.open.delete(key);
    const index = this.openedOrder.indexOf(key);
    if (index >= 0) this.openedOrder.splice(index, 1);
    part.gzip.end();
    await once(part.output, "finish");
  }
}
