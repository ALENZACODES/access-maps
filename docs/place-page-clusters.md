# Place page: one page per real place (change needed in access-tools `packages/place`)

This repository now ships same-place links in the web pack (see [places-identity.md](places-identity.md)). This file is the change the place-page package in access-tools needs to use them. It has not been made there; this repository does not edit other repositories.

Today `packages/place/src/react/PackPlaceView.tsx` renders one pack record (`PackPlaceView({ record, sources, lang, profile })`) and `src/pack/projection.ts` (`fromPackRecord`) maps one record's fields. After the change, a place page renders a cluster: every linked record, each with its own source, licence, retrieval date and tier, side by side. Values from different sources are never merged into one value. Where known values disagree the page says so and does not pick one.

## 1. Types (`src/pack/pack-types.ts`)

Add, copying the contract from access-maps `src/pack/links.ts`:

```ts
export interface PackLinkMember { tranche: PackTranche; id: string; sourceId: string; cell: string }
export interface PackLinkEvidence {
  a: string; b: string; score: number; distance_m: number; name: number | null;
  class_compat: number; address: string; code: string; reason: string;
}
export interface PackCluster { id: string; members: PackLinkMember[]; evidence: PackLinkEvidence[] }
export interface PackPossible { a: PackLinkMember; b: PackLinkMember; score: number; distance_m: number; why: string }
export interface PackLinkCell { cell: string; method: string; clusters: PackCluster[]; possible: PackPossible[] }
```

Record keys in links are `${tranche}|${id}`.

## 2. Projection (`src/pack/cluster.ts`, new)

```ts
export type ClusterFactStatus = "agree" | "conflict" | "single" | "unknown";
export interface ClusterFactValue { key: string; sourceId: string; detail: PackDetail }   // one per record
export interface ClusterFact { name: PackFactName; values: ClusterFactValue[]; status: ClusterFactStatus }
export interface ClusterProjection {
  id: string;                       // cluster id, or the record key for a record in no cluster
  members: PackPlaceProjection[];   // fromPackRecord for each record, held-source fields dropped first
  names: string[];                  // distinct known names, original spelling, in member order
  facts: Record<PackFactName, ClusterFact>;
  possible: PackPossible[];         // possible duplicates of any member; never merged
}
export function fromPackCluster(
  records: PackRecord[], cluster: PackCluster | null, possible: PackPossible[], sources: PackSourceEntry[],
): ClusterProjection;
```

Rules:

- Members are the cluster's records that are present in `records` and whose source is accepted (`inWebPack !== false` and no `heldReason`), in cluster order. With fewer than two, the result is the single record (status `single` everywhere), exactly as today.
- For each fact, `values` holds every member's detail, including Unknown. Compare only known values, after the same normalisation the page already uses for decisions (`booleanStatus` for step-free, washroom, adult change table and parking; `doorWidthMm` for door width; case- and accent-folded text for name and address). Display always shows the original values.
- `agree`: two or more known values and they are equal after normalisation. `conflict`: two known values differ. `single`: one known value. `unknown`: none known. A known value on one record and Unknown on another is not a conflict: both rows are shown.
- Nothing is inferred: a fact one source states is not copied to another source's column.

## 3. Fit (`src/pack/fit.ts`)

Add `fitWithProfileCluster(cluster, profile)`. A need is `known-yes` only when at least one member says yes and no member says no; `known-no` when at least one says no and none says yes; otherwise `unknown`. When members say both yes and no the status is `unknown` and the item carries `conflict: true`, so the page shows "Sources disagree" next to Unknown. A conflict is never shown as a yes. The deciding-field link points to the fact row.

## 4. Component (`src/react/PackClusterView.tsx`, new; `PackPlaceView` unchanged)

Props: `{ cluster: ClusterProjection; sources; lang?; locale?; profile?; photoRequest? }`.

- Header: the first known name; when members carry other names, a line "Also recorded as: …" with each name and its source. Category line as today. "Recorded by N sources" with the source names.
- Fit section from `fitWithProfileCluster`; a conflicting need reads "Unknown — sources disagree" (text, not colour alone).
- "Recorded fields": one table, one row per fact, one column per member. Column header: source name, licence, retrieval date and tier (the existing `Evidence` content), with the licence link and, for OpenStreetMap, the exact credit "© OpenStreetMap contributors". A cell shows the member's original value or Unknown. A conflicting row has a row header suffix "Sources disagree" and `aria-describedby` pointing to a sentence above the table: "Where sources disagree, both values are shown. Neither is chosen." Rows stay keyboard-reachable through the existing `#pack-field-…` anchors.
- On narrow screens the table scrolls horizontally (existing `overflowX: auto` wrapper); the member columns are also available as a stacked list per source for screen widths below 480 px.
- "Other recorded details": the existing `FactTable` once per member, headed by the source name.
- "Why these records are shown together": for each evidence edge, the distance in metres and the matcher's reason (catalogued below).
- "May be the same place as": each possible duplicate, with a link to its page and its distance. These are not merged.
- Photo panel: the first member with a Commons field, as today.
- Corrections link: `/contribute?place=<cluster id>&records=<member keys, comma-separated>&action=correction`.

## 5. Strings (`src/i18n.ts`, EN and FR)

```ts
"pack.cluster-sources": { en: "Recorded by {n} sources", fr: "Consigné par {n} sources" },
"pack.also-named": { en: "Also recorded as", fr: "Aussi consigné sous le nom" },
"pack.conflict": { en: "Sources disagree", fr: "Les sources ne concordent pas" },
"pack.conflict-note": { en: "Where sources disagree, both values are shown. Neither is chosen.", fr: "Lorsque les sources ne concordent pas, les deux valeurs sont affichées. Aucune n’est retenue." },
"pack.linked-why": { en: "Why these records are shown together", fr: "Pourquoi ces fiches sont présentées ensemble" },
"pack.linked-distance": { en: "{distance} m apart", fr: "à {distance} m l’une de l’autre" },
"pack.possible-heading": { en: "May be the same place as", fr: "Pourrait être le même lieu que" },
"pack.link-reason.name": { en: "Names, distance and type agree", fr: "Les noms, la distance et le type concordent" },
"pack.link-reason.address": { en: "No distinctive name; the address agrees", fr: "Aucun nom distinctif; l’adresse concorde" },
"pack.link-reason.identifier": { en: "No distinctive name; the identifier agrees", fr: "Aucun nom distinctif; l’identifiant concorde" },
"pack.link-reason.same-spot": { en: "No distinctive name; the same kind of feature at the same spot", fr: "Aucun nom distinctif; le même type d’élément au même endroit" },
```

Map the link `reason` strings to these keys: "name, distance and class agree" → `pack.link-reason.name`; "no distinctive name; address agrees" → `.address`; "no distinctive name; identifier agrees" → `.identifier`; "no distinctive name; the same kind of feature at the same spot" → `.same-spot`. Any other reason is shown in English with the existing `pack.english-only-note`.

## 6. Exports (`src/index.ts`)

`export { PackClusterView } from "./react/PackClusterView.js"; export { fromPackCluster } from "./pack/cluster.js"; export { fitWithProfileCluster } from "./pack/fit.js";` and the new types.

## 7. Tests (`test/packCluster.test.tsx`)

- Two members that agree: one row per fact, two source columns, no "Sources disagree".
- `wheelchair` yes on one member and no on the other: the row says "Sources disagree", both values shown, the step-free need is Unknown with the conflict note, never yes.
- Yes on one member, Unknown on the other: no conflict; the need is yes; both columns shown.
- A member from a held source: dropped; with one member left the page renders like `PackPlaceView`.
- A possible duplicate is listed with a link and not merged.
- French: every new string, typography as in the existing catalogue.
- axe: no violations; the conflict is announced in text.

## 8. Loading (the app shell, for reference)

The page component takes already-loaded records. The shell that opens a place page should:

1. Read `manifest.links.cells[cell]` for the record's cell and fetch that file (size and SHA-256 checked like other parts). Without `manifest.links`, or when the file fails its check, keep one page per record, as today.
2. If the record's key is in a cluster, fetch the parts of the other members' cells and sources (`manifest.tranches[tranche].cells[cell].parts`, filtered by `sourceId`), then render `PackClusterView`. The canonical page id is the cluster id; a member's own id should open the same page.
3. In search, collapse hits whose keys are in one cluster of the same cell's link file into one result.
4. `manifest.links.current === false` means records added since the last matcher run are not linked yet; nothing needs to be shown for it.
