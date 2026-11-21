import type { GroupChange, PairChange, PairDeclaration } from "./delta.ts";
import type { LinkGroup } from "./snapshot.ts";

export interface EvidenceSide {
  /** Full matcher evidence hashes for the groups involved on this side. */
  groups: Array<{ id: string; digest: string | null }>;
  /** Hash of a declared possible-pair observation, distinct from a group evidence hash. */
  possibleDigest: string | null;
}

export interface EvidenceSummary {
  previous: EvidenceSide;
  candidate: EvidenceSide;
  /** Counts compare only the edge fields the pack writer can publish.
   * A full matcher evidence hash may change even with the same projected edges. */
  edges: { unchanged: number; added: number; absent: number; changed: number } | null;
}

function side(groups: readonly LinkGroup[]): EvidenceSide {
  return {
    groups: groups.map(group => ({ id: group.id, digest: group.evidenceDigest }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    possibleDigest: null,
  };
}

function edges(groups: readonly LinkGroup[]): Map<string, string> | null {
  const result = new Map<string, string>();
  for (const group of groups) {
    if (!group.publicationEdges) return null;
    for (const edge of group.publicationEdges) {
      if (edge.a === edge.b) return null;
      const key = JSON.stringify(edge.a < edge.b ? [edge.a, edge.b] : [edge.b, edge.a]);
      const other = result.get(key);
      if (other !== undefined && other !== edge.digest) return null;
      result.set(key, edge.digest);
    }
  }
  return result;
}

/**
 * Match observed undirected edge declarations by endpoint identity across the
 * whole lineage component. Splits and merges need no all-pairs expansion.
 * Unavailable historical projections leave group digests available for review.
 */
export function groupEvidence(change: GroupChange): EvidenceSummary {
  const summary: EvidenceSummary = {
    previous: side(change.before),
    candidate: side(change.after),
    edges: null,
  };
  const previous = edges(change.before);
  const candidate = edges(change.after);
  if (previous === null || candidate === null) return summary;
  const counts = { unchanged: 0, added: 0, absent: 0, changed: 0 };
  for (const [key, digest] of previous) {
    const current = candidate.get(key);
    if (current === undefined) counts.absent++;
    else if (current === digest) counts.unchanged++;
    else counts.changed++;
  }
  for (const key of candidate.keys()) if (!previous.has(key)) counts.added++;
  summary.edges = counts;
  return summary;
}

function pairSide(declaration: PairDeclaration | null, groupDigest: string | null): EvidenceSide {
  return {
    groups: declaration?.groupId ? [{ id: declaration.groupId, digest: groupDigest }] : [],
    possibleDigest: declaration?.possibleDigest ?? null,
  };
}

/** Supporting group evidence explains a relation even when that side has no possible-pair row. */
export function pairEvidence(
  change: PairChange, previousGroupDigest: string | null, candidateGroupDigest: string | null,
): EvidenceSummary {
  return {
    previous: pairSide(change.before, previousGroupDigest),
    candidate: pairSide(change.after, candidateGroupDigest),
    edges: null,
  };
}
