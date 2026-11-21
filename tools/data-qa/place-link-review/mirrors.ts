/**
 * Per-cell link files repeat a cross-cell cluster or possible pair in every
 * member cell. Observations come from locally inspected published cells.
 * The caller computes the digest from the whole canonical declaration.
 */
export interface MirrorDeclaration {
  family: "group" | "pair";
  key: string;
  digest: string;
  cell: string;
  memberCells: readonly string[];
}

type CellState = "published" | "invalid" | "withheld";
export interface MirrorIssue {
  cell: string;
  code: "mirror-missing" | "mirror-conflict";
}

type Copies = MirrorDeclaration | MirrorDeclaration[];

function required(cells: ReadonlyMap<string, CellState>, cell: string): boolean {
  const status = cells.get(cell);
  // A member cell without any file declaration is an observable omission.
  return status !== "withheld" && status !== "invalid";
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function reconcile(
  copies: readonly MirrorDeclaration[], states: ReadonlyMap<string, CellState>,
  add: (cell: string, code: MirrorIssue["code"]) => void,
): void {
  const first = copies[0]!;
  const canonicalCells = new Set(first.memberCells);
  const agreed = new Set(canonicalCells);
  const seen = new Set<string>();
  let disagree = false;

  for (const copy of copies) {
    const claimed = new Set(copy.memberCells);
    if (!claimed.has(copy.cell) || seen.has(copy.cell)) add(copy.cell, "mirror-conflict");
    seen.add(copy.cell);
    if (copy.digest !== first.digest || !sameSet(canonicalCells, claimed)) disagree = true;
    // A disputed member cell does not establish an omission. If all versions
    // name a cell, a missing copy there is still meaningful despite disagreement.
    for (const cell of agreed) if (!claimed.has(cell)) agreed.delete(cell);
  }
  if (disagree) for (const cell of seen) add(cell, "mirror-conflict");
  for (const cell of agreed) {
    if (!seen.has(cell) && required(states, cell)) add(cell, "mirror-missing");
  }
}

/** Returns at most two issues per cell. Keys, source IDs and member records never enter the output. */
export function checkMirrors(
  observations: readonly MirrorDeclaration[],
  cells: ReadonlyMap<string, CellState>,
): MirrorIssue[] {
  const families = { group: new Map<string, Copies>(), pair: new Map<string, Copies>() };
  const issues = new Map<string, Set<MirrorIssue["code"]>>();
  function add(cell: string, code: MirrorIssue["code"]) {
    const existing = issues.get(cell);
    if (existing) existing.add(code);
    else issues.set(cell, new Set([code]));
  }

  for (const row of observations) {
    const status = cells.get(row.cell);
    if (status !== "published") {
      if (status === undefined) add(row.cell, "mirror-conflict");
      continue;
    }
    // Single-cell rows, the common case, need no per-key array or copied payload.
    const family = families[row.family];
    const existing = family.get(row.key);
    if (existing === undefined) family.set(row.key, row);
    else if (Array.isArray(existing)) existing.push(row);
    else family.set(row.key, [existing, row]);
  }

  for (const family of [families.group, families.pair]) {
    for (const copies of family.values()) {
      if (Array.isArray(copies)) {
        reconcile(copies, cells, add);
      } else {
        if (!copies.memberCells.includes(copies.cell)) add(copies.cell, "mirror-conflict");
        for (const member of copies.memberCells) {
          if (member !== copies.cell && required(cells, member)) add(member, "mirror-missing");
        }
      }
    }
  }
  const result: MirrorIssue[] = [];
  for (const cell of [...issues.keys()].sort()) {
    for (const code of [...issues.get(cell)!].sort()) result.push({ cell, code });
  }
  return result;
}
