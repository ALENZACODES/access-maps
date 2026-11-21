import type { LinkGroup, LinkMember, LinkPair, LinkSnapshot } from "./snapshot.ts";

export const GROUP_KINDS = [
  "retained", "added", "absent", "split", "merged", "regrouped",
  "expanded", "contracted", "membership", "rekeyed", "metadata", "evidence",
] as const;
export const PAIR_KINDS = [
  "retained", "added", "absent", "promoted", "demoted", "relationship", "metadata", "evidence",
] as const;

export type GroupKind = (typeof GROUP_KINDS)[number];
export type PairKind = (typeof PAIR_KINDS)[number];

export interface ReleaseInfo {
  method: string;
  inputDigest: string;
  skippedCount: number;
  groups: number;
  pairs: number;
}

export interface MemberCounts {
  shared: number;
  added: number;
  absent: number;
  sourceChanged: number;
  cellChanged: number;
}

export interface GroupOverlap {
  before: string;
  after: string;
  members: number;
}

export interface GroupChange {
  kind: Exclude<GroupKind, "retained">;
  before: LinkGroup[];
  after: LinkGroup[];
  sources: string[];
  memberCounts: MemberCounts;
  overlaps: GroupOverlap[];
}

export interface PairDeclaration {
  a: LinkMember;
  b: LinkMember;
  possibleDigest: string | null;
  groupId: string | null;
}

export interface PairChange {
  kind: Exclude<PairKind, "retained">;
  before: PairDeclaration | null;
  after: PairDeclaration | null;
  sources: string[];
}

export interface LinkDelta {
  previous: ReleaseInfo;
  candidate: ReleaseInfo;
  coverage: "no-skips-reported" | "skips-reported";
  /** Each connected component counts once, including a many-to-many regrouping. */
  groupCounts: Record<GroupKind, number>;
  /** The domain is the union of explicitly listed possible pairs in either index. */
  pairCounts: Record<PairKind, number>;
  groups: GroupChange[];
  pairs: PairChange[];
}

function releaseInfo(snapshot: LinkSnapshot): ReleaseInfo {
  return {
    method: snapshot.method,
    inputDigest: snapshot.inputDigest,
    skippedCount: snapshot.skippedCount,
    groups: snapshot.groups.length,
    pairs: snapshot.pairs.length,
  };
}

function countKinds<K extends string>(kinds: readonly K[]): Record<K, number> {
  return Object.fromEntries(kinds.map(kind => [kind, 0])) as Record<K, number>;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function memberKey(member: LinkMember): string {
  // Tranche is one of three fixed labels. The remainder, including separators, is the opaque ID.
  return member.tranche + "|" + member.id;
}

function compareMembers(a: LinkMember, b: LinkMember): number {
  return cmp(a.tranche, b.tranche) || cmp(a.id, b.id);
}

function sameMetadata(a: LinkMember, b: LinkMember): boolean {
  return a.sourceId === b.sourceId && a.cell === b.cell;
}

function pairKey(pair: LinkPair | PairDeclaration): string {
  const left = memberKey(pair.a);
  const right = memberKey(pair.b);
  // IDs can contain punctuation, including pipes and colons. Encoding the tuple is injective.
  return left <= right ? JSON.stringify([left, right]) : JSON.stringify([right, left]);
}

interface Membership {
  group: LinkGroup;
  member: LinkMember;
}

interface Index {
  members: Map<string, Membership>;
  possible: Map<string, LinkPair>;
}

function index(snapshot: LinkSnapshot): Index {
  const members = new Map<string, Membership>();
  const ids = new Set<string>();
  for (const group of snapshot.groups) {
    if (ids.has(group.id) || group.members.length < 2) throw new Error("Invalid group declaration");
    ids.add(group.id);
    for (const member of group.members) {
      const key = memberKey(member);
      if (members.has(key)) throw new Error("Repeated group membership");
      members.set(key, { group, member });
    }
  }
  const possible = new Map<string, LinkPair>();
  for (const pair of snapshot.pairs) {
    const key = pairKey(pair);
    if (memberKey(pair.a) === memberKey(pair.b) || possible.has(key)) throw new Error("Invalid possible pair");
    possible.set(key, pair);
  }
  return { members, possible };
}

function copyGroup(group: LinkGroup): LinkGroup {
  return {
    id: group.id,
    members: group.members.map(member => ({ ...member })).sort(compareMembers),
    evidenceDigest: group.evidenceDigest,
    ...(group.publicationEdges === undefined ? {} : {
      publicationEdges: group.publicationEdges.map(edge => edge.a <= edge.b ? { ...edge } :
        { a: edge.b, b: edge.a, digest: edge.digest }).sort((a, b) =>
        cmp(a.a, b.a) || cmp(a.b, b.b) || cmp(a.digest, b.digest)),
    }),
  };
}

function orderedGroups(groups: readonly LinkGroup[]): LinkGroup[] {
  return groups.map(copyGroup).sort((a, b) => cmp(a.id, b.id));
}

interface Component {
  before: LinkGroup[];
  after: LinkGroup[];
}

/**
 * Follow only actual shared members. Equal group IDs in different releases
 * can name unrelated records. They never create a lineage edge on their own.
 * Iterative traversal visits each observed member a bounded number of times.
 */
function* components(old: LinkSnapshot, next: LinkSnapshot, from: Index, to: Index): Generator<Component> {
  const visitedOld = new Set<LinkGroup>();
  const visitedNext = new Set<LinkGroup>();
  for (const seed of old.groups) {
    if (visitedOld.has(seed)) continue;
    visitedOld.add(seed);
    const before = [seed];
    const after: LinkGroup[] = [];
    let i = 0;
    let j = 0;
    while (i < before.length || j < after.length) {
      while (i < before.length) {
        for (const member of before[i++]!.members) {
          const match = to.members.get(memberKey(member));
          if (match && !visitedNext.has(match.group)) {
            visitedNext.add(match.group);
            after.push(match.group);
          }
        }
      }
      while (j < after.length) {
        for (const member of after[j++]!.members) {
          const match = from.members.get(memberKey(member));
          if (match && !visitedOld.has(match.group)) {
            visitedOld.add(match.group);
            before.push(match.group);
          }
        }
      }
    }
    yield { before, after };
  }
  for (const group of next.groups) {
    if (!visitedNext.has(group)) yield { before: [], after: [group] };
  }
}

function memberCounts(component: Component, next: Index): MemberCounts {
  let shared = 0;
  let sourceChanged = 0;
  let cellChanged = 0;
  let previousSize = 0;
  for (const group of component.before) {
    previousSize += group.members.length;
    for (const member of group.members) {
      const candidate = next.members.get(memberKey(member))?.member;
      if (!candidate) continue;
      shared++;
      if (member.sourceId !== candidate.sourceId) sourceChanged++;
      if (member.cell !== candidate.cell) cellChanged++;
    }
  }
  const candidateSize = component.after.reduce((sum, group) => sum + group.members.length, 0);
  return { shared, added: candidateSize - shared, absent: previousSize - shared, sourceChanged, cellChanged };
}

function groupKind(component: Component, counts: MemberCounts): GroupKind {
  const { before, after } = component;
  if (!before.length) return "added";
  if (!after.length) return "absent";
  if (before.length > 1 && after.length > 1) return "regrouped";
  if (after.length > 1) return "split";
  if (before.length > 1) return "merged";
  if (counts.added && counts.absent) return "membership";
  if (counts.added) return "expanded";
  if (counts.absent) return "contracted";
  if (before[0]!.id !== after[0]!.id) return "rekeyed";
  if (counts.sourceChanged || counts.cellChanged) return "metadata";
  if (before[0]!.evidenceDigest !== after[0]!.evidenceDigest) return "evidence";
  return "retained";
}

function overlaps(component: Component, next: Index): GroupOverlap[] {
  const rows: GroupOverlap[] = [];
  for (const oldGroup of component.before) {
    const counts = new Map<string, number>();
    for (const member of oldGroup.members) {
      const candidate = next.members.get(memberKey(member));
      if (candidate) counts.set(candidate.group.id, (counts.get(candidate.group.id) ?? 0) + 1);
    }
    for (const [id, members] of counts) rows.push({ before: oldGroup.id, after: id, members });
  }
  return rows.sort((a, b) => cmp(a.before, b.before) || cmp(a.after, b.after));
}

function groupSources(component: Component): string[] {
  const sources = new Set<string>();
  for (const groups of [component.before, component.after]) {
    for (const group of groups) {
      for (const member of group.members) sources.add(member.sourceId);
    }
  }
  return [...sources].sort();
}

function compareGroups(a: GroupChange, b: GroupChange): number {
  // Each nonempty side is a partition with unique group IDs.
  return cmp(a.before[0]?.id ?? "", b.before[0]?.id ?? "")
    || cmp(a.after[0]?.id ?? "", b.after[0]?.id ?? "");
}

function compareGroupDeclarations(
  previous: LinkSnapshot, candidate: LinkSnapshot, old: Index, next: Index,
): Pick<LinkDelta, "groupCounts" | "groups"> {
  const groupCounts = countKinds(GROUP_KINDS);
  const groups: GroupChange[] = [];
  for (const component of components(previous, candidate, old, next)) {
    const counts = memberCounts(component, next);
    const kind = groupKind(component, counts);
    groupCounts[kind]++;
    if (kind === "retained") continue;
    groups.push({
      kind,
      before: orderedGroups(component.before),
      after: orderedGroups(component.after),
      sources: groupSources(component),
      memberCounts: counts,
      overlaps: overlaps(component, next),
    });
  }
  return { groupCounts, groups: groups.sort(compareGroups) };
}

function findDeclaration(published: LinkPair | undefined, exemplar: LinkPair, at: Index): PairDeclaration | null {
  // The exemplar fixes identity across releases. All metadata below comes from this side only.
  const pair = published ?? exemplar;
  const [a, b] = compareMembers(pair.a, pair.b) <= 0 ? [pair.a, pair.b] : [pair.b, pair.a];
  const first = at.members.get(memberKey(a));
  const second = at.members.get(memberKey(b));
  const sameGroup = first && second && first.group === second.group;
  if (!published && !sameGroup) return null;
  return {
    a: published ? a : first!.member,
    b: published ? b : second!.member,
    possibleDigest: published?.evidenceDigest ?? null,
    groupId: sameGroup ? first.group.id : null,
  };
}

function pairKind(old: PairDeclaration | null, next: PairDeclaration | null): PairKind {
  if (!old) return "added";
  if (!next) return "absent";
  if (old.groupId === null && next.groupId !== null && next.possibleDigest === null) return "promoted";
  if (next.groupId === null && old.groupId !== null && old.possibleDigest === null) return "demoted";
  if (old.groupId !== next.groupId || (old.possibleDigest === null) !== (next.possibleDigest === null)) {
    return "relationship";
  }
  if (!sameMetadata(old.a, next.a) || !sameMetadata(old.b, next.b)) return "metadata";
  return old.possibleDigest === next.possibleDigest ? "retained" : "evidence";
}

function copyDeclaration(row: PairDeclaration | null): PairDeclaration | null {
  return row ? { ...row, a: { ...row.a }, b: { ...row.b } } : null;
}

function comparePossibleDeclarations(old: Index, next: Index): Pick<LinkDelta, "pairCounts" | "pairs"> {
  const pairCounts = countKinds(PAIR_KINDS);
  const pairs: PairChange[] = [];
  function compare(previous: LinkPair | undefined, candidate: LinkPair | undefined, exemplar: LinkPair): void {
    const before = findDeclaration(previous, exemplar, old);
    const after = findDeclaration(candidate, exemplar, next);
    const kind = pairKind(before, after);
    pairCounts[kind]++;
    if (kind === "retained") return;
    const sources = new Set<string>();
    for (const side of [before, after]) {
      if (side) {
        sources.add(side.a.sourceId);
        sources.add(side.b.sourceId);
      }
    }
    pairs.push({ kind, before: copyDeclaration(before), after: copyDeclaration(after), sources: [...sources].sort() });
  }
  for (const [key, pair] of old.possible) compare(pair, next.possible.get(key), pair);
  for (const [key, pair] of next.possible) {
    if (!old.possible.has(key)) compare(undefined, pair, pair);
  }
  pairs.sort((a, b) => {
    const left = (a.before ?? a.after)!;
    const right = (b.before ?? b.after)!;
    return compareMembers(left.a, right.a) || compareMembers(left.b, right.b);
  });
  return { pairCounts, pairs };
}

/**
 * Compare declarations from two authenticated link indexes. Absence describes
 * the supplied indexes only. A missing association makes no claim about a
 * place, its accessibility, or whether the upstream record still exists.
 */
export function diffLinks(previous: LinkSnapshot, candidate: LinkSnapshot): LinkDelta {
  const old = index(previous);
  const next = previous === candidate ? old : index(candidate);
  return {
    previous: releaseInfo(previous),
    candidate: releaseInfo(candidate),
    coverage: previous.skippedCount || candidate.skippedCount ? "skips-reported" : "no-skips-reported",
    ...compareGroupDeclarations(previous, candidate, old, next),
    ...comparePossibleDeclarations(old, next),
  };
}
