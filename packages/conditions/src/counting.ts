import type { ReportGroup, RouteReport, RoutingFact } from "./reportTypes";

/** What one item adds to a count of pieces and to a verified total. */
export interface CountContribution {
  pieces: number;
  verified: number;
}

export type ReportCountable = RouteReport | ReportGroup | RoutingFact;

/**
 * The contribution of a route-condition report, a report group or the
 * routing fact made from one. It is zero for both totals at every tier,
 * including a tier 2 group: independent reports confirm an observation for
 * as long as it lasts; they do not make it a standing accessibility fact.
 */
export function reportCountContribution(
  _item: ReportCountable,
): CountContribution {
  return { pieces: 0, verified: 0 };
}

/** Sum of {@link reportCountContribution} over any number of items. */
export function tallyReportContributions(
  items: readonly ReportCountable[],
): CountContribution {
  return items.reduce<CountContribution>(
    (total, item) => {
      const part = reportCountContribution(item);
      return {
        pieces: total.pieces + part.pieces,
        verified: total.verified + part.verified,
      };
    },
    { pieces: 0, verified: 0 },
  );
}
