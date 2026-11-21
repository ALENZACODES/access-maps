import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { directoryNames, InputIssue, inputStamp, physicalRoot, readStablePart, sameFileStamp } from "./inputs.ts";
import { checkMirrors, type MirrorDeclaration } from "./mirrors.ts";
import { canDiscloseSources, type SourceCatalogue } from "./provenance.ts";
import { isLinkCell, publishedEdgeDigest, publishedPairDigest, type LinkGroup, type LinkMember,
  type LinkPair, type LinkSnapshot } from "./snapshot.ts";

export const PUBLICATION_ISSUES = [
  "manifest-unavailable", "manifest-format", "index-identity", "input-stale", "inventory", "unsafe-path",
  "cell-unavailable", "size", "digest", "compression", "cell-format", "cell-count", "source-held", "source-terms",
  "foreign-group", "foreign-pair", "foreign-member", "duplicate", "evidence", "mirror-missing", "mirror-conflict",
] as const;
export type PublicationIssue = typeof PUBLICATION_ISSUES[number];

export interface PublicationCell {
  cell: string;
  status: "checked" | "withheld" | "issues";
  issues: PublicationIssue[];
  sourceIds: string[];
  groups: number;
  pairs: number;
}

export interface PublicationAudit {
  status: "checked" | "withheld" | "undeclared" | "issues";
  issues: PublicationIssue[];
  cells: PublicationCell[];
}

class Fault extends Error {
  readonly code: PublicationIssue;
  constructor(code: PublicationIssue) {
    super(code);
    this.code = code;
  }
}

function need(ok: unknown, code: PublicationIssue): asserts ok {
  if (!ok) throw new Fault(code);
}

function object(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exact(raw: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(raw).length === fields.length && fields.every(field => Object.hasOwn(raw, field));
}

function fingerprint(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function json(bytes: Buffer, code: PublicationIssue): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Fault(code);
  }
}

function reason(error: unknown, fallback: PublicationIssue): PublicationIssue {
  if (error instanceof Fault) return error.code;
  if (error instanceof InputIssue) {
    if (error.reason === "unsafe-entry") return "unsafe-path";
    if (error.reason === "file-limit") return "size";
  }
  return fallback;
}

function getId(raw: LinkMember): string {
  return raw.tranche + "|" + raw.id;
}

function pairId(a: string, b: string): string {
  return JSON.stringify(a <= b ? [a, b] : [b, a]);
}

function member(raw: unknown): LinkMember {
  need(object(raw) && exact(raw, ["tranche", "id", "sourceId", "cell"]) && (raw.tranche === "venue" || raw.tranche === "transit" || raw.tranche === "washroom") &&
    typeof raw.id === "string" && raw.id.length > 0 && typeof raw.sourceId === "string" && isLinkCell(raw.cell), "cell-format");
  return { tranche: raw.tranche, id: raw.id, sourceId: raw.sourceId, cell: raw.cell };
}

interface Index {
  groups: Map<string, LinkGroup>;
  pairs: Map<string, LinkPair>;
  registry: SourceCatalogue;
  sourceRows: Map<string, Record<string, unknown>>;
}

function confirmMember(actual: LinkMember, original: LinkMember | undefined, index: Index, cell: PublicationCell): void {
  need(original && original.cell === actual.cell && original.sourceId === actual.sourceId, "foreign-member");
  const published = index.sourceRows.get(actual.sourceId);
  const registered = index.registry.get(actual.sourceId);
  need(published?.inWebPack === true && registered && canDiscloseSources(index.registry, [actual.sourceId]), "source-held");
  // Dropping the credit or loosening licence terms in the served manifest
  // cannot be repaired by displaying the registry's correct values here.
  need(published.name === registered.sourceName && published.licence === registered.licence &&
    published.licenceUrl === registered.licenceUrl && published.attribution === registered.attribution &&
    published.retrieved === registered.retrievedOn && published.heldReason === null &&
    published.shareAlike === (registered.licence === "ODbL-1.0"), "source-terms");
  if (!cell.sourceIds.includes(actual.sourceId)) cell.sourceIds.push(actual.sourceId);
}

function auditGroup(raw: unknown, index: Index, cell: PublicationCell): MirrorDeclaration {
  need(object(raw) && exact(raw, ["id", "members", "evidence"]) && typeof raw.id === "string" && Array.isArray(raw.members) && raw.members.length >= 2 &&
    Array.isArray(raw.evidence), "cell-format");
  const original = index.groups.get(raw.id);
  need(original, "foreign-group");
  const candidates = new Map(original.members.map(m => [getId(m), m]));
  // same-place-v1 embeds its anchor record's identity in the published group
  // ID. Omitting the member row alone does not suppress that identifier.
  const namedAnchor = candidates.get(raw.id);
  if (namedAnchor) need(index.sourceRows.get(namedAnchor.sourceId)?.inWebPack === true &&
    canDiscloseSources(index.registry, [namedAnchor.sourceId]), "source-held");
  const keys = new Set<string>();
  const memberCells = new Set<string>();
  for (const one of raw.members as unknown[]) {
    const value = member(one);
    const id = getId(value);
    need(!keys.has(id), "duplicate");
    confirmMember(value, candidates.get(id), index, cell);
    keys.add(id);
    memberCells.add(value.cell);
  }
  need(memberCells.has(cell.cell), "foreign-member");

  // The production writer filters edges when an endpoint did not enter the
  // record pack. A two-member remainder can legitimately have no direct edge.
  need(original.publicationEdges, "evidence");
  const expected = new Map(original.publicationEdges.filter(edge => keys.has(edge.a) && keys.has(edge.b))
    .map(edge => [pairId(edge.a, edge.b), edge.digest]));
  const evidence: string[] = [];
  for (const edge of raw.evidence as unknown[]) {
    need(object(edge) && typeof edge.a === "string" && typeof edge.b === "string" &&
      exact(edge, ["a", "b", "score", "distance_m", "name", "class_compat", "address", "code", "reason"]), "evidence");
    const edgeKey = pairId(edge.a, edge.b);
    const value = publishedEdgeDigest(edge);
    need(expected.get(edgeKey) === value, "evidence");
    expected.delete(edgeKey);
    evidence.push(JSON.stringify([edgeKey, value]));
  }
  need(expected.size === 0, "evidence");
  return { family: "group", key: raw.id, cell: cell.cell, memberCells: [...memberCells],
    digest: fingerprint(JSON.stringify([[...keys].sort(), evidence.sort()])) };
}

function auditPair(raw: unknown, index: Index, cell: PublicationCell): MirrorDeclaration {
  need(object(raw) && exact(raw, ["a", "b", "score", "distance_m", "why"]), "cell-format");
  const a = member(raw.a);
  const b = member(raw.b);
  const key = pairId(getId(a), getId(b));
  const original = index.pairs.get(key);
  need(original, "foreign-pair");
  const values = new Map([original.a, original.b].map(m => [getId(m), m]));
  confirmMember(a, values.get(getId(a)), index, cell);
  confirmMember(b, values.get(getId(b)), index, cell);
  need(a.cell === cell.cell || b.cell === cell.cell, "foreign-member");
  const value = publishedPairDigest(raw.score, raw.distance_m, raw.why);
  need(original.publicationDigest === value, "evidence");
  return { family: "pair", key, digest: value, cell: cell.cell, memberCells: [...new Set([a.cell, b.cell])] };
}

function issue(cell: PublicationCell, code: PublicationIssue) {
  cell.status = "issues";
  if (!cell.issues.includes(code)) cell.issues.push(code);
}

const CELL_LIMIT = 25 * 1024 * 1024;
const DECODED_CELL_LIMIT = 256 * 1024 * 1024;

async function cellFile(root: string, row: unknown, cell: PublicationCell, method: string,
  index: Index, observations: MirrorDeclaration[]): Promise<void> {
  need(object(row), "cell-format");
  const file = `links/${cell.cell}.json.gz`;
  need(row.path === "pack/v1/" + file, "unsafe-path");
  need(count(row.bytes) && row.bytes > 0 && row.bytes <= CELL_LIMIT, "size");
  need(digest(row.sha256), "digest");
  need(count(row.clusters) && count(row.possible), "cell-count");
  const stat = await inputStamp(root, file);
  need(Number(stat.size) === row.bytes, "size");
  const bytes = await readStablePart(root, file, stat);
  need(fingerprint(bytes) === row.sha256, "digest");
  let decoded: Buffer;
  try {
    decoded = gunzipSync(bytes, { maxOutputLength: DECODED_CELL_LIMIT });
  } catch {
    throw new Fault("compression");
  }
  const document = json(decoded, "cell-format");
  need(object(document) && exact(document, ["cell", "method", "clusters", "possible"]) && document.cell === cell.cell && document.method === method &&
    Array.isArray(document.clusters) && Array.isArray(document.possible), "cell-format");
  cell.groups = document.clusters.length;
  cell.pairs = document.possible.length;
  if (cell.groups !== row.clusters || cell.pairs !== row.possible) issue(cell, "cell-count");
  const seen = new Set<string>();
  for (const [family, rows] of [["group", document.clusters], ["pair", document.possible]] as const) {
    for (const raw of rows as unknown[]) {
      try {
        const observation = family === "group" ? auditGroup(raw, index, cell) : auditPair(raw, index, cell);
        const composite = family + ":" + observation.key;
        need(!seen.has(composite), "duplicate");
        seen.add(composite);
        observations.push(observation);
      } catch (error) {
        issue(cell, reason(error, "cell-format"));
      }
    }
  }
}

function emptyCell(cell: string): PublicationCell {
  return { cell, status: "checked", issues: [], sourceIds: [], groups: 0, pairs: 0 };
}

function heldFiles(raw: unknown): { whole: boolean; cells: Set<string> } {
  const cells = new Set<string>();
  let whole = false;
  if (raw === undefined) return { whole, cells };
  need(Array.isArray(raw), "manifest-format");
  for (const part of raw as unknown[]) {
    need(object(part) && typeof part.path === "string", "manifest-format");
    if (!part.path.startsWith("links/")) continue;
    need(typeof part.reason === "string" && part.reason.trim().length > 0, "manifest-format");
    if (part.path === "links/index.json" || part.path === "links/same-place" || part.path === "links/possible-duplicates") {
      whole = true;
      continue;
    }
    const name = /^links\/(.+)\.json\.gz$/u.exec(part.path)?.[1];
    need(isLinkCell(name) && name === part.cell && !cells.has(name), "manifest-format");
    cells.add(name);
  }
  return { whole, cells };
}

async function inventory(root: string): Promise<string[]> {
  try {
    return (await directoryNames(root, "links")).filter(name => name.endsWith(".json.gz"));
  } catch (error) {
    if (object(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function publishedSources(rows: unknown): Map<string, Record<string, unknown>> {
  need(Array.isArray(rows), "manifest-format");
  const sources = new Map<string, Record<string, unknown>>();
  for (const row of rows as unknown[]) {
    need(object(row) && typeof row.sourceId === "string" && typeof row.inWebPack === "boolean" &&
      !sources.has(row.sourceId), "manifest-format");
    sources.set(row.sourceId, row);
  }
  return sources;
}

function ordered(codes: PublicationIssue[]): PublicationIssue[] {
  return PUBLICATION_ISSUES.filter(code => codes.includes(code));
}

/** packRoot points to the staged pack/v1 directory. Only referenced link projections
 * are examined. A source match can be omitted when one of its records is withheld. */
export async function auditPublication(packRoot: string, snapshot: LinkSnapshot, registry: SourceCatalogue): Promise<PublicationAudit> {
  const cells = new Map<string, PublicationCell>();
  const global: PublicationIssue[] = [];
  let status: PublicationAudit["status"] = "checked";
  function at(name: string): PublicationCell {
    const existing = cells.get(name) ?? emptyCell(name);
    cells.set(name, existing);
    return existing;
  }
  try {
    const root = await physicalRoot(packRoot);
    const stat = await inputStamp(root, "manifest.json");
    const raw = json(await readStablePart(root, "manifest.json", stat), "manifest-format");
    need(object(raw) && raw.version === 1, "manifest-format");
    const sourceRows = publishedSources(raw.sources);
    const held = heldFiles(raw.withheld);
    for (const name of held.cells) at(name).status = "withheld";
    const names = await inventory(root);
    const declarations = raw.links;
    if (declarations === undefined) {
      status = held.whole || held.cells.size ? "withheld" : "undeclared";
      if (names.length) global.push("inventory");
    } else {
      need(object(declarations) && typeof declarations.method === "string" && digest(declarations.inputDigest) &&
        digest(declarations.dataDigest) && typeof declarations.current === "boolean" && object(declarations.cells), "manifest-format");
      if (declarations.method !== snapshot.method || declarations.inputDigest !== snapshot.inputDigest) global.push("index-identity");
      if (!declarations.current || declarations.inputDigest !== declarations.dataDigest) global.push("input-stale");
      if (held.whole) global.push("inventory");
      const staged = new Set(names);
      const observed: MirrorDeclaration[] = [];
      const index: Index = {
        groups: new Map(snapshot.groups.map(group => [group.id, group])),
        pairs: new Map(snapshot.pairs.map(pair => [pairId(getId(pair.a), getId(pair.b)), pair])),
        registry, sourceRows,
      };
      for (const [name, part] of Object.entries(declarations.cells)) {
        if (!isLinkCell(name)) { global.push("unsafe-path"); continue; }
        const cell = at(name);
        staged.delete(name + ".json.gz");
        if (held.cells.has(name)) {
          issue(cell, "inventory");
          continue;
        }
        try {
          await cellFile(root, part, cell, declarations.method, index, observed);
        } catch (error) {
          issue(cell, reason(error, "cell-unavailable"));
        }
      }
      if (staged.size) global.push("inventory");
      const availability = new Map([...cells].map(([name, cell]) => [
        name, cell.status === "checked" ? "published" as const : cell.status === "issues" ? "invalid" as const : "withheld" as const,
      ]));
      for (const finding of checkMirrors(observed, availability)) issue(at(finding.cell), finding.code);
      if (!Object.keys(declarations.cells).length && held.cells.size) status = "withheld";
    }
    // Confirm the examined reference version is still named by the staged manifest.
    const final = await inputStamp(root, "manifest.json");
    if (!sameFileStamp(final, stat)) global.push("inventory");
  } catch (error) {
    global.push(reason(error, "manifest-unavailable"));
  }
  const sorted = [...cells.values()].sort((a, b) => a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0);
  for (const cell of sorted) {
    cell.sourceIds.sort();
    cell.issues = ordered(cell.issues);
  }
  if (global.length || sorted.some(cell => cell.status === "issues")) status = "issues";
  return { status, issues: ordered(global), cells: sorted };
}
