import { createHash } from "node:crypto";
import { groupEvidence, pairEvidence, type EvidenceSummary } from "./evidence.ts";
import { diffLinks, type GroupChange, type LinkDelta, type PairChange } from "./delta.ts";
import {
  canDiscloseSources, compareSources, resolveSources,
  type SourceCatalogue, type SourceChange, type SourceEvidence,
} from "./provenance.ts";
import type { InputCheck } from "./inputs.ts";
import type { LinkMember, LinkSnapshot } from "./snapshot.ts";

export interface Release {
  links: LinkSnapshot;
  registry: SourceCatalogue;
  inputs?: InputCheck;
}

export interface Citation {
  sourceId: string;
  previous: SourceEvidence | null;
  candidate: SourceEvidence | null;
}

export type Family = "group" | "pair" | "source";
export type Priority = "rights" | "identity" | "declaration";
export interface Location {
  sourceId: string;
  cell: string;
  groupId: string | null;
}

export interface MemberChange {
  tranche: LinkMember["tranche"];
  id: string;
  previous: Location | null;
  candidate: Location | null;
}

export interface ReviewCase {
  id: string;
  fingerprint: string;
  family: Family;
  kind: string;
  restricted: boolean;
  priority: Priority;
  citations: Citation[];
  cells: string[];
  members: MemberChange[];
  previousGroups: number;
  candidateGroups: number;
  fields: string[];
  accessibility: "UNKNOWN";
  matchingEvidence: EvidenceSummary | null;
}

export interface Inventory {
  method: string;
  inputDigest: string;
  groups: number;
  groupedMembers: number;
  possiblePairs: number;
  cells: number;
  sourceIds: string[];
  skippedInputs: number;
  inputs: InputCheck | null;
}

export interface ReviewBook {
  schema: "place-link-review/v1";
  mode: "inventory" | "comparison";
  previous: Inventory | null;
  candidate: Inventory;
  citations: Citation[];
  groupCounts: LinkDelta["groupCounts"] | null;
  pairCounts: LinkDelta["pairCounts"] | null;
  cases: ReviewCase[];
}

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function stable(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(lexical);
}

function token(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function inventory(release: Release): Inventory {
  const cells = new Set<string>();
  const sources = new Set<string>();
  const include = (member: LinkMember) => { cells.add(member.cell); sources.add(member.sourceId); };
  let groupedMembers = 0;
  for (const group of release.links.groups) {
    groupedMembers += group.members.length;
    group.members.forEach(include);
  }
  for (const pair of release.links.pairs) { include(pair.a); include(pair.b); }
  return {
    method: release.links.method,
    inputDigest: release.links.inputDigest,
    groups: release.links.groups.length,
    groupedMembers,
    possiblePairs: release.links.pairs.length,
    cells: cells.size,
    sourceIds: stable(sources),
    skippedInputs: release.links.skippedCount,
    inputs: release.inputs ?? null,
  };
}

function citationsFor(ids: string[], previous: Release | null, candidate: Release): Citation[] {
  const before = previous ? resolveSources(previous.registry, ids) : [];
  const after = resolveSources(candidate.registry, ids);
  const indexed = (items: SourceEvidence[]) => new Map(items.map(item => [item.sourceId, item]));
  const previousById = indexed(before);
  const candidateById = indexed(after);
  return ids.map(sourceId => ({
    sourceId, previous: previousById.get(sourceId) ?? null, candidate: candidateById.get(sourceId) ?? null,
  }));
}

interface MemberAt { member: LinkMember; groupId: string | null; }
function key(member: LinkMember): string {
  return JSON.stringify([member.tranche, member.id]);
}
function groupMembers(groups: GroupChange["before"]): MemberAt[] {
  return groups.flatMap(group => group.members.map(member => ({ member, groupId: group.id })));
}
function pairMembers(side: PairChange["before"]): MemberAt[] {
  return side ? [side.a, side.b].map(member => ({ member, groupId: side.groupId })) : [];
}

function joinMembers(before: MemberAt[], after: MemberAt[]): MemberChange[] {
  const left = new Map(before.map(item => [key(item.member), item]));
  const right = new Map(after.map(item => [key(item.member), item]));
  const location = (entry: MemberAt | undefined): Location | null => entry ? {
    sourceId: entry.member.sourceId, cell: entry.member.cell, groupId: entry.groupId,
  } : null;
  return stable([...left.keys(), ...right.keys()]).map(id => {
    const a = left.get(id);
    const b = right.get(id);
    const identity = (b ?? a)!.member;
    return { tranche: identity.tranche, id: identity.id, previous: location(a), candidate: location(b) };
  });
}

interface Changes {
  family: Family;
  kind: string;
  keys: unknown;
  evidence: unknown;
  previousMembers: MemberAt[];
  candidateMembers: MemberAt[];
  previousGroups: number;
  candidateGroups: number;
  fields: string[];
  sources: string[];
  archivedGroupSources?: string[];
  summary?: () => EvidenceSummary;
}

function groupCase(change: GroupChange): Changes {
  const before = groupMembers(change.before);
  const after = groupMembers(change.after);
  const groupDigests = (list: GroupChange["before"]) => list.map(g => [g.id, g.evidenceDigest])
    .sort(([a], [b]) => lexical(a!, b!));
  return {
    family: "group", summary: () => groupEvidence(change),
    kind: change.kind,
    keys: [stable(change.before.map(g => g.id)), stable(change.after.map(g => g.id))],
    evidence: [groupDigests(change.before), groupDigests(change.after)],
    previousMembers: before, candidateMembers: after,
    previousGroups: change.before.length, candidateGroups: change.after.length,
    sources: change.sources, fields: [],
  };
}

interface GroupSupport { sources: string[]; evidence: string; groupDigest: string; }
function owningSources(release: Release, groupIds: Set<string>): Map<string, GroupSupport> {
  const owners = new Map<string,GroupSupport>();
  if (!groupIds.size) return owners;
  for (const g of release.links.groups) {
    if (!groupIds.has(g.id)) continue;
    const members = stable(g.members.map(m => JSON.stringify([m.tranche,m.id,m.sourceId,m.cell])));
    owners.set(g.id, { sources: stable(g.members.map(m => m.sourceId)), evidence: token([g.evidenceDigest,members]), groupDigest: g.evidenceDigest });
  }
  return owners;
}

function pairCase(change: PairChange, oldOwners: Map<string,GroupSupport>, nextOwners: Map<string,GroupSupport>): Changes {
  const before = pairMembers(change.before);
  const after = pairMembers(change.after);
  const previousGroup = oldOwners.get(change.before?.groupId ?? "");
  const candidateGroup = nextOwners.get(change.after?.groupId ?? "");
  return {
    family: "pair", kind: change.kind,
    summary: () => pairEvidence(change,previousGroup?.groupDigest ?? null,candidateGroup?.groupDigest ?? null),
    keys: stable([...before, ...after].map(row => key(row.member))),
    evidence: [change.before?.possibleDigest ?? null, change.after?.possibleDigest ?? null,
      previousGroup?.evidence ?? null, candidateGroup?.evidence ?? null],
    previousMembers: before, candidateMembers: after,
    previousGroups: Number(Boolean(change.before?.groupId)), candidateGroups: Number(Boolean(change.after?.groupId)),
    // A group identifier may identify a third member, outside the pair itself.
    archivedGroupSources: previousGroup?.sources ?? [],
    sources: stable([...change.sources, ...(previousGroup?.sources ?? []), ...(candidateGroup?.sources ?? [])]), fields: [],
  };
}

function sourceCase(change: SourceChange): Changes {
  return {
    family: "source", kind: change.kind, keys: change.sourceId, evidence: change.fields,
    previousMembers: [], candidateMembers: [], previousGroups: 0, candidateGroups: 0,
    sources: [change.sourceId], fields: [...change.fields].sort(lexical),
  };
}

function buildCase(
  raw: Changes, previous: Release, candidate: Release, catalogue: Map<string, Citation>,
): ReviewCase {
  const ids = stable(raw.sources);
  const citations = ids.map(id => catalogue.get(id)!);
  const archivedIds = new Set(raw.previousMembers.map(row => row.member.sourceId));
  for (const source of raw.archivedGroupSources ?? []) archivedIds.add(source);
  if (raw.family === "source" && previous.registry.has(ids[0]!)) archivedIds.add(ids[0]!);
  // Current source holds also suppress historical record IDs in a comparison.
  const restricted = !canDiscloseSources(candidate.registry, ids) ||
    (archivedIds.size > 0 && !canDiscloseSources(previous.registry, archivedIds));
  const joined = joinMembers(raw.previousMembers, raw.candidateMembers);
  const id = token(["place-link-case/v1", raw.family, raw.keys]);
  const fingerprint = token([
    id, raw.kind, raw.evidence, joined, citations,
    previous.links.method, candidate.links.method, previous.links.skippedCount, candidate.links.skippedCount,
    previous.inputs?.status ?? null, candidate.inputs?.status ?? null,
  ]);
  const members = restricted ? [] : joined;
  const cells = stable(members.flatMap(row =>
    [row.previous?.cell, row.candidate?.cell].filter((v): v is string => v !== undefined),
  ));
  let priority: Priority = "declaration";
  if (restricted || raw.family === "source") priority = "rights";
  else if (["split", "merged", "regrouped", "promoted", "demoted", "membership", "relationship"].includes(raw.kind)) {
    priority = "identity";
  }
  return {
    id, fingerprint, family: raw.family, kind: raw.kind, restricted, priority,
    citations, members, cells, previousGroups: raw.previousGroups, candidateGroups: raw.candidateGroups,
    fields: raw.fields, accessibility: "UNKNOWN", matchingEvidence: restricted ? null : raw.summary?.() ?? null,
  };
}

export function buildBook(previous: Release | null, candidate: Release): ReviewBook {
  const baseline = previous ? inventory(previous) : null;
  const next = previous === candidate && baseline ? baseline : inventory(candidate);
  const ids = stable([...(baseline?.sourceIds ?? []), ...next.sourceIds]);
  const citations = citationsFor(ids, previous, candidate);
  const book: ReviewBook = {
    schema: "place-link-review/v1", mode: previous ? "comparison" : "inventory",
    previous: baseline, candidate: next, citations, groupCounts: null, pairCounts: null, cases: [],
  };
  if (!previous) return book;
  const delta = diffLinks(previous.links, candidate.links);
  const bySource = new Map(citations.map(row => [row.sourceId, row]));
  const oldOwners = owningSources(previous, new Set(delta.pairs.flatMap(p => p.before?.groupId ? [p.before.groupId] : [])));
  const newOwners = owningSources(candidate, new Set(delta.pairs.flatMap(p => p.after?.groupId ? [p.after.groupId] : [])));
  const changes = [
    ...delta.groups.map(groupCase), ...delta.pairs.map(p => pairCase(p,oldOwners,newOwners)),
    ...compareSources(previous.registry, candidate.registry, ids).map(sourceCase),
  ];
  book.groupCounts = delta.groupCounts;
  book.pairCounts = delta.pairCounts;
  book.cases = changes.map(change => buildCase(change, previous, candidate, bySource));
  const priorities: Record<Priority, number> = { rights: 0, identity: 1, declaration: 2 };
  book.cases.sort((a, b) => priorities[a.priority] - priorities[b.priority] || lexical(a.id, b.id));
  return book;
}
