import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMirrors, type MirrorDeclaration } from "./mirrors.ts";

function row(cell: string, members: string[], patch: Partial<MirrorDeclaration> = {}): MirrorDeclaration {
  return { family: "group", key: "fixture-id", digest: "same", cell, memberCells: members, ...patch };
}
function published(...cells: string[]): Map<string, "published" | "invalid" | "withheld"> {
  return new Map(cells.map(c => [c, "published"]));
}

test("a singleton-cell copy and unordered multi-cell mirrors agree on set membership", () => {
  assert.deepEqual(checkMirrors([
    row("a", ["a", "a", "b", "c"]), row("c", ["c", "b", "a"]), row("b", ["a", "c", "b"]),
    row("b", ["b"], { key: "second" }),
  ], published("a", "b", "c")), []);
});

test("membership requires copies in both a listed cell and an unlisted cell", () => {
  assert.deepEqual(checkMirrors([row("a", ["a", "b", "c"])], published("a", "b")), [
    { cell: "b", code: "mirror-missing" }, { cell: "c", code: "mirror-missing" },
  ]);
});

test("withheld and unreadable mirrors have separate evidence and never produce a false missing-copy error", () => {
  const cells = published("a", "b");
  cells.set("b", "withheld");
  cells.set("c", "invalid");
  const visible = row("a", ["a", "b", "c", "d"]);
  const inaccessible = [row("b", ["b", "z"], { digest: "wrong" }), row("c", ["z"], { key: "other" })];
  assert.deepEqual(checkMirrors([visible, ...inaccessible], cells), [{ cell: "d", code: "mirror-missing" }]);
});

test("an unlisted observing cell cannot certify declarations or impose extra mirrors on other cells", () => {
  const observation = row("not-declared", ["not-declared", "candidate"]);
  assert.deepEqual(checkMirrors([observation], published("candidate")), [
    { cell: "not-declared", code: "mirror-conflict" },
  ]);
});

test("a copy in an unrelated published cell is reported even when the declared member cells have copies", () => {
  const observations = ["a", "b", "other"].map(c => row(c, ["a", "b"]));
  assert.deepEqual(checkMirrors(observations, published("a", "b", "other")), [
    { cell: "other", code: "mirror-conflict" },
  ]);
});

test("only a misplaced copy can reveal both misplaced publication and omissions", () => {
  const result = checkMirrors([row("wrong", ["a", "b"])], published("a", "b", "wrong"));
  assert.deepEqual(result, [
    { cell: "a", code: "mirror-missing" }, { cell: "b", code: "mirror-missing" },
    { cell: "wrong", code: "mirror-conflict" },
  ]);
});

test("contradictory evidence marks every observed copy regardless of input order", () => {
  const copies = [
    row("a", ["d", "a", "b", "c"]), row("b", ["a", "b", "c", "d"]),
    row("c", ["a", "b", "c", "d"], { digest: "revised" }),
  ];
  const cells = published("a", "b", "c", "d");
  const expected = [
    { cell: "a", code: "mirror-conflict" }, { cell: "b", code: "mirror-conflict" },
    { cell: "c", code: "mirror-conflict" }, { cell: "d", code: "mirror-missing" },
  ];
  assert.deepEqual(checkMirrors(copies, cells), expected);
  assert.deepEqual(checkMirrors([...copies].reverse(), cells), expected);
});

test("different member cells conflict even when a caller supplies the same digest", () => {
  const copies = [row("a", ["a", "b", "c", "contested"]), row("b", ["a", "b", "c"])];
  const cells = published("a", "b", "c", "contested");
  assert.deepEqual(checkMirrors(copies, cells), [
    { cell: "a", code: "mirror-conflict" }, { cell: "b", code: "mirror-conflict" },
    { cell: "c", code: "mirror-missing" },
  ]);
});

test("two copies in one published cell cannot replace a missing copy in another", () => {
  assert.deepEqual(checkMirrors([row("a", ["a", "b"]), row("a", ["a", "b"])], published("a", "b")), [
    { cell: "a", code: "mirror-conflict" }, { cell: "b", code: "mirror-missing" },
  ]);
});

test("group identities and possible-pair identities occupy separate namespaces", () => {
  const changes = [row("a", ["a"]), row("b", ["b", "c"], { family: "pair", digest: "pair-digest" })];
  assert.deepEqual(checkMirrors(changes, published("a", "b", "c")), [{ cell: "c", code: "mirror-missing" }]);
});

test("issues are bounded per cell and code without exporting source record keys", () => {
  const copies = Array.from({ length: 80 }, (_, i) => row("a", ["a", "b"], { key: "private-synthetic-" + i }));
  copies.push(row("b", ["a"], { key: "unrelated" }));
  const result = checkMirrors(copies, published("a", "b"));
  assert.deepEqual(result, [
    { cell: "a", code: "mirror-missing" }, { cell: "b", code: "mirror-conflict" }, { cell: "b", code: "mirror-missing" },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private-synthetic|unrelated/u);
});

test("an empty publication creates no mirror obligation from cells alone", () => {
  assert.deepEqual(checkMirrors([], published("a", "b")), []);
});
