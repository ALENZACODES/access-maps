import { describe, expect, it } from "vitest";
import { GTFS_FEEDS } from "../src/gtfs/feeds.js";
import { readRegistry } from "../src/registry.js";

describe("Milton Transit GTFS", () => {
  it("is a listed tier 1 feed under the Town's open licence", () => {
    expect(GTFS_FEEDS.some((feed) => feed.id === "milton-transit-gtfs")).toBe(true);
    const source = readRegistry(process.cwd()).sources.find((entry) => entry.id === "milton-transit-gtfs");
    expect(source).toMatchObject({ kind: "gtfs", tier: 1, licence_id: "OGL-Milton-2.0" });
    expect(source!.notes).toMatch(/6d91cda9496043a395710d0a73a7699f/);
  });
});
