import { cellWork, selectCellWork, type CellWorkPage } from "./cell-work.ts";
import { reconcileDecisions, type DecisionFile } from "./decisions.ts";
import type { Family, Priority, ReviewBook, ReviewCase } from "./review.ts";
import type { PublicationAudit } from "./publication.ts";
import type { SourceEvidence } from "./provenance.ts";
import type { MemberInspection } from "./members.ts";

export const STATES = ["open", "follow-up", "reviewed", "restricted", "stale", "conflict"] as const;
export type CaseState = typeof STATES[number];
export interface Selection {
  family?: Family;
  priority?: Priority;
  state?: CaseState;
  source?: string;
  cell?: string;
  id?: string;
  page?: number;
  perPage?: number;
  memberOffset?: number;
  memberLimit?: number;
  cellPage?: number;
  cellsPerPage?: number;
}
export interface CasePage extends ReviewCase {
  state: CaseState;
  memberCount: number;
  memberOffset: number;
}
export interface SourceInspection {
  caseId: string;
  previous: MemberInspection[];
  candidate: MemberInspection[];
}
export interface ReviewPage {
  schema: "place-link-page/v1";
  mode: ReviewBook["mode"];
  previous: ReviewBook["previous"];
  candidate: ReviewBook["candidate"];
  citations: ReviewBook["citations"];
  groupCounts: ReviewBook["groupCounts"];
  pairCounts: ReviewBook["pairCounts"];
  counts: Record<CaseState, number>;
  orphanDecisions: number;
  totalCases: number;
  matchedCases: number;
  page: number;
  pages: number;
  perPage: number;
  cases: CasePage[];
  cellWork: CellWorkPage;
  inspection: SourceInspection | null;
  publication: { audit: PublicationAudit; sources: SourceEvidence[] } | null;
}

export class SelectionError extends Error {
  constructor(readonlyCode: "case" | "page" | "members" | "limit") {
    super(readonlyCode);
    this.name = "SelectionError";
  }
}
function integer(n: number, min: number, max: number): boolean {
  return Number.isSafeInteger(n) && n >= min && n <= max;
}

export function selectPage(book: ReviewBook, options: Selection = {}, files: readonly DecisionFile[] = []): ReviewPage {
  const perPage = options.perPage ?? 25;
  const page = options.page ?? 1;
  const memberOffset = options.memberOffset ?? 0;
  const memberLimit = options.memberLimit ?? 32;
  if (!integer(perPage, 1, 200) || !integer(memberLimit, 1, 250)) throw new SelectionError("limit");
  if (!integer(page, 1, Number.MAX_SAFE_INTEGER)) throw new SelectionError("page");
  if (!integer(memberOffset, 0, Number.MAX_SAFE_INTEGER) || (memberOffset && !options.id)) {
    throw new SelectionError("members");
  }
  const reconciled = reconcileDecisions(book.cases, files);
  const counts: Record<CaseState, number> = { open: 0, "follow-up": 0, reviewed: 0, restricted: 0, stale: 0, conflict: 0 };
  const selected: ReviewCase[] = [];
  let found = false;
  for (const item of book.cases) {
    const state = reconciled.status.get(item.id)!;
    counts[state]++;
    if (options.id === item.id) found = true;
    if (options.id && item.id !== options.id) continue;
    if (options.priority && item.priority !== options.priority) continue;
    if (options.family && item.family !== options.family) continue;
    if (options.source && !item.citations.some(row => row.sourceId === options.source)) continue;
    if (options.cell && !item.cells.includes(options.cell)) continue;
    if (options.state && state !== options.state) continue;
    selected.push(item);
  }
  if (options.id && !found) throw new SelectionError("case");
  const pages = Math.max(1, Math.ceil(selected.length / perPage));
  if (page > pages) throw new SelectionError("page");
  const start = (page - 1) * perPage;
  const cases = selected.slice(start, start + perPage).map(item => {
    if (memberOffset && memberOffset >= item.members.length) throw new SelectionError("members");
    return {
      ...item,
      matchingEvidence: item.matchingEvidence && {
        ...item.matchingEvidence,
        previous: { ...item.matchingEvidence.previous, groups: item.matchingEvidence.previous.groups.slice(memberOffset,memberOffset + memberLimit) },
        candidate: { ...item.matchingEvidence.candidate, groups: item.matchingEvidence.candidate.groups.slice(memberOffset,memberOffset + memberLimit) },
      },
      state: reconciled.status.get(item.id)!, memberCount: item.members.length, memberOffset,
      members: item.members.slice(memberOffset, memberOffset + memberLimit),
    };
  });
  let workload: CellWorkPage;
  try {
    workload = selectCellWork(cellWork(book), { cell: options.cell, page: options.cellPage, perPage: options.cellsPerPage });
  } catch { throw new SelectionError("page"); }
  return {
    schema: "place-link-page/v1", mode: book.mode, previous: book.previous, candidate: book.candidate,
    citations: book.citations, groupCounts: book.groupCounts, pairCounts: book.pairCounts, counts,
    orphanDecisions: reconciled.orphanCount, totalCases: book.cases.length, matchedCases: selected.length,
    page, pages, perPage, cases, cellWork: workload, inspection: null, publication: null,
  };
}
