import { prototypeLabel, type ImportedRecord, type MapFeature } from "@access-maps/journey";
import { describeOutage, formatTime, outageCopy } from "./copy.js";
import { gtfsStopId } from "./journey.js";
import { blocksStepFree, currentOutages, expiresAt } from "./state.js";
import type { Locale, OutageSnapshot } from "./types.js";

export interface OutageFeatureOptions {
  locale: Locale;
  nowIso: string;
  /** True when the page is showing a saved copy. Every outage is then labelled last-checked. */
  offline: boolean;
}

/**
 * One list and map feature per current outage, placed at the first listed stop that has coordinates.
 * An outage whose stops have no coordinates still gets no invented position: it is left out of the
 * map and returned in `unplaced` so the text list can show it.
 */
export function outageFeatures(
  snapshot: OutageSnapshot,
  stops: ImportedRecord[],
  options: OutageFeatureOptions,
): { features: MapFeature[]; unplaced: string[] } {
  const text = outageCopy(options.locale);
  const asOf = formatTime(snapshot.asOf, options.locale);
  const features: MapFeature[] = [];
  const unplaced: string[] = [];
  for (const record of currentOutages(snapshot, options.nowIso)) {
    const stop = stops.find((item) => {
      const lat = item.fields.lat?.value;
      const lon = item.fields.lon?.value;
      return record.stopIds.includes(gtfsStopId(item)) && typeof lat === "number" && typeof lon === "number";
    });
    if (!stop) {
      unplaced.push(record.id);
      continue;
    }
    const end = expiresAt(record);
    const status = [
      describeOutage(record, options.locale),
      text.reported(formatTime(record.reportedAt, options.locale)),
      end ? text.expires(formatTime(end, options.locale)) : text.noEnd,
      blocksStepFree(record) ? "" : text.escalatorInfo,
      options.offline ? text.lastChecked(asOf) : snapshot.mayBeOutOfDate ? (snapshot.origin === "last-known" ? text.lastKnown(asOf) : text.manualSeed(asOf)) : "",
      snapshot.demonstration ? text.demonstration : "",
    ]
      .filter(Boolean)
      .join(" ");
    features.push({
      id: `outage:${record.id}`,
      name: `${text.equipment[record.equipment]}: ${record.stationName === "UNKNOWN" ? text.stationUnknownName : record.stationName}`,
      kind: "outage",
      status,
      statusCode: blocksStepFree(record) ? "not-step-free" : "info",
      source: record.provenance.sourceId,
      licence: record.provenance.licence,
      retrievedAt: record.provenance.retrievedAt,
      tier: 4,
      prototypeLabel: prototypeLabel(options.locale, 4),
      odbl: false,
      lon: stop.fields.lon?.value as number,
      lat: stop.fields.lat?.value as number,
    });
  }
  return { features, unplaced };
}
