import { normalizeAlerts } from "./normalize.js";
import type { OutageSnapshot } from "./types.js";

export interface FeedRead {
  alerts: readonly unknown[];
  /** ISO time of the feed header, when the reader has it. */
  feedTime: string | null;
}

export interface SourceInfo {
  networkId: string;
  sourceId: string;
  licence: string;
}

export interface ManualSeed {
  alerts: readonly unknown[];
  /** ISO time the seed was captured. Shown as the as-of time. */
  capturedAt: string;
}

export interface LoadOptions {
  source: SourceInfo;
  /** Reads the operator feed. Omit when no feed reader is connected. */
  readFeed?: () => Promise<FeedRead>;
  /** The last snapshot that came from the feed on this device, if any. */
  lastKnown?: OutageSnapshot | null;
  manualSeed: ManualSeed;
}

/**
 * Feed first. When the feed cannot be read, the last-known feed snapshot, then the dated manual seed.
 * Both fallbacks are marked may-be-out-of-date and keep their own as-of time.
 * A feed that returns nothing usable is a failure, not "no outages".
 */
export async function loadOutages(options: LoadOptions): Promise<OutageSnapshot> {
  const { source } = options;
  let feedError: string | null = null;
  if (options.readFeed) {
    try {
      const read = await options.readFeed();
      if (!Array.isArray(read.alerts)) throw new Error("feed-not-a-list");
      const { records, rejected } = normalizeAlerts(read.alerts, source.networkId);
      if (read.alerts.length > 0 && records.length === 0) throw new Error("feed-all-rejected");
      if (!read.feedTime || Number.isNaN(Date.parse(read.feedTime))) throw new Error("feed-time-missing");
      return {
        origin: "feed",
        asOf: new Date(read.feedTime).toISOString(),
        networkId: source.networkId,
        sourceId: source.sourceId,
        licence: source.licence,
        records,
        rejected,
        mayBeOutOfDate: false,
        demonstration: false,
        feedError: null,
      };
    } catch (error) {
      feedError = error instanceof Error ? error.message : "feed-error";
    }
  } else {
    feedError = "feed-not-connected";
  }

  if (options.lastKnown && options.lastKnown.origin === "feed" && options.lastKnown.networkId === source.networkId) {
    return { ...options.lastKnown, origin: "last-known", mayBeOutOfDate: true, feedError };
  }

  const { records, rejected } = normalizeAlerts(options.manualSeed.alerts, source.networkId);
  return {
    origin: "manual-seed",
    asOf: new Date(options.manualSeed.capturedAt).toISOString(),
    networkId: source.networkId,
    sourceId: source.sourceId,
    licence: source.licence,
    records,
    rejected,
    mayBeOutOfDate: true,
    demonstration: true,
    feedError,
  };
}

/** Replace one record, for example after an operator update. Returns a new snapshot. */
export function withRecord(snapshot: OutageSnapshot, record: OutageSnapshot["records"][number]): OutageSnapshot {
  const others = snapshot.records.filter((item) => item.id !== record.id);
  return { ...snapshot, records: [...others, record] };
}
