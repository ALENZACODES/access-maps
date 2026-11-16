import type { ManualSeed, SourceInfo } from "../src/feed.js";
import { TTC_ACCESSIBILITY_SNAPSHOT } from "./ttc-accessibility-snapshot.js";

/** The TTC accessibility alert source as recorded by access-maps pull request 1 (sources registry). */
export const TTC_SOURCE: SourceInfo = {
  networkId: "ttc",
  sourceId: "gtfs-rt-ttc-accessibility",
  licence: "OGL-Toronto-1.0",
};

/**
 * Manual seed: the 32 alerts in the 2026-11-13 snapshot. All share feed_timestamp 1794599309.
 * Used only when the feed cannot be read and no last-known feed snapshot exists. Always labelled
 * demonstration and may-be-out-of-date.
 */
export const TTC_MANUAL_SEED: ManualSeed = {
  alerts: TTC_ACCESSIBILITY_SNAPSHOT,
  capturedAt: new Date(1794599309 * 1000).toISOString(),
};
