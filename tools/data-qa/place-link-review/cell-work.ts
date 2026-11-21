import { isLinkCell } from "./snapshot.ts";
import type { ReviewBook, ReviewCase } from "./review.ts";

export interface CellWorkRow {
  cell: string;
  /** Distinct review cases referring to this cell on either side. */
  cases: number;
  previousOnly: number;
  candidateOnly: number;
  both: number;
  groups: number;
  pairs: number;
  splits: number;
  merges: number;
  regrouped: number;
  /** Cases referring to this cell and at least one other cell across the two releases. */
  crossCell: number;
}

export interface CellWork {
  totalCases: number;
  locatedCases: number;
  /** One assignment per (case, member cell) combination. */
  assignments: number;
  crossCellCases: number;
  unlocated: { restricted: number; source: number; unknown: number };
  rows: CellWorkRow[];
}

export interface CellWorkPage extends CellWork {
  totalCells: number;
  matchedCells: number;
  page: number;
  pages: number;
  perPage: number;
}

type Sides = { previous: Set<string>; candidate: Set<string> };

function locations(item: ReviewCase): Sides | undefined {
  const previous = new Set<string>();
  const candidate = new Set<string>();
  for (const member of item.members) {
    if (member.previous) {
      if (!isLinkCell(member.previous.cell)) return undefined;
      previous.add(member.previous.cell);
    }
    if (member.candidate) {
      if (!isLinkCell(member.candidate.cell)) return undefined;
      candidate.add(member.candidate.cell);
    }
  }
  return { previous, candidate };
}

function emptyRow(cell: string): CellWorkRow {
  return {
    cell, cases: 0, previousOnly: 0, candidateOnly: 0, both: 0,
    groups: 0, pairs: 0, splits: 0, merges: 0, regrouped: 0, crossCell: 0,
  };
}

/**
 * Assign the reviewed declarations to their named cache cells. The input is
 * the full book so case pagination and member clipping cannot remove work.
 * Restriction and source-only decisions precede all access to member positions.
 * A single changing place declaration can create tasks for multiple cell reviewers.
 */
export function cellWork(book: ReviewBook): CellWork {
  const cells = new Map<string, CellWorkRow>();
  const caseIds = new Set<string>();
  const unlocated = { restricted: 0, source: 0, unknown: 0 };
  let assignments = 0;
  let crossCellCases = 0;
  let locatedCases = 0;
  for (const item of book.cases) {
    if (caseIds.has(item.id)) throw new TypeError("duplicate-case");
    caseIds.add(item.id);
    if (item.restricted) {
      unlocated.restricted++;
      continue;
    }
    if (item.family === "source") {
      unlocated.source++;
      continue;
    }
    const sides = locations(item);
    if (!sides || !(sides.previous.size + sides.candidate.size)) {
      unlocated.unknown++;
      continue;
    }
    const affected = new Set([...sides.previous, ...sides.candidate]);
    locatedCases++;
    assignments += affected.size;
    if (affected.size > 1) crossCellCases++;
    for (const cell of affected) {
      const row = cells.get(cell) ?? emptyRow(cell);
      row.cases++;
      if (sides.previous.has(cell) && sides.candidate.has(cell)) row.both++;
      else if (sides.previous.has(cell)) row.previousOnly++;
      else row.candidateOnly++;
      if (item.family === "group") {
        row.groups++;
        if (item.kind === "split") row.splits++;
        if (item.kind === "merged") row.merges++;
        if (item.kind === "regrouped") row.regrouped++;
      } else {
        row.pairs++;
      }
      if (affected.size > 1) row.crossCell++;
      cells.set(cell, row);
    }
  }
  const rows = [...cells.values()].sort((a, b) => b.cases - a.cases ||
    (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0));
  return { totalCases: caseIds.size, locatedCases, assignments, crossCellCases, unlocated, rows };
}

/** A cell filter and row window independent of the case review's filters and page. */
export function selectCellWork(
  work: CellWork, options: { cell?: string; page?: number; perPage?: number } = {},
): CellWorkPage {
  const { cell, page = 1, perPage = 25 } = options;
  if (cell !== undefined && !isLinkCell(cell)) throw new RangeError("cell");
  if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("page");
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new RangeError("per-page");
  const matched = cell === undefined ? work.rows : work.rows.filter(row => row.cell === cell);
  const pages = Math.max(1, Math.ceil(matched.length / perPage));
  if (page > pages) throw new RangeError("page");
  const start = (page - 1) * perPage;
  return {
    ...work, unlocated: { ...work.unlocated },
    rows: matched.slice(start, start + perPage).map(row => ({ ...row })),
    totalCells: work.rows.length, matchedCells: matched.length, page, pages, perPage,
  };
}
