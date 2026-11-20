# P15AD — Route preference and evidence comparison

This feature is mounted in `JourneyResult` and exported from `src/index.ts`. It compares the route options in an existing `JourneyPlan` using requirements explicitly chosen by the visitor. It never upgrades a missing observation into a positive accessibility claim. `UNKNOWN` is retained as a data value in both English and French.

## What is included

The pure `routeNeeds.ts` engine handles selected preferences, provenance quality, source dates, route distances, reported gradients, surfaces, transfer counts, return legs and destination details. `RouteNeedsPanel.tsx` renders the preferences and route-by-route evidence with native form elements, keyboard support and a locally triggered JSON export. `routeNeedsReview.ts` builds a compact source inventory, compares two locally supplied plans and tracks changes to source dates.

The comparison deliberately does not infer personal suitability. A person's selected maximum slope, distance or transfer count is a preference used only for this comparison. It is not a medical assessment, admission criterion or official accessibility rating.

## Connection to existing code

- `JourneyResult.tsx` mounts the component after the existing map and attribution, leaving emergency calling and focus order intact.
- `index.ts` exposes the React panel and the pure comparison, review and inventory functions.
- `route-needs.css` supplies 44px minimum input and button dimensions, strong keyboard focus indicators, reduced-motion handling and forced-colour borders.
- Existing `@access-maps/journey` types are reused. The package does not create a second journey graph, invent coordinates or connect to a remote service.

## Missing evidence and source limitations

A leg whose status is unknown stays `UNKNOWN`. A positive leg status without an observation, source identifier, acceptable open licence, date or nonzero evidence tier also becomes `UNKNOWN` in the comparison. A reported barrier remains a barrier even if other information is missing. Future-dated and old source records do not qualify as current supporting information. A reported distance is considered only if its kind is a routed distance, not a straight-line estimate. Unknown route distances are never added to a numeric total.

An entrance needs an explicitly recorded step count, supporting dated source and relevant entrance leg. Washroom information cannot be considered supported from a boolean alone: source provenance is required. All alternative comparisons preserve a route's original observations, and the comparison never modifies the original `JourneyPlan`.

The selection is a ranking of conflicts with the visitor's chosen preferences, not a statement that a journey is safe or suitable. If no route supports each essential preference, there is no preferred route.

## EN/FR

English and French copy is maintained in `routeNeedsCopy.ts`. The French copy uses curly apostrophes, a nonbreaking space before a colon, narrow nonbreaking spaces before semicolon/exclamation/question punctuation and within guillemets. `UNKNOWN` remains `UNKNOWN` rather than being turned into a positive access claim or assigned an evidence tier.

## Local test commands

In a complete repository checkout with package dependencies installed:

```bash
npm run lint -w @access-maps/map-ui
npm test -w @access-maps/map-ui
npm run lint
npm test
```

The new tests cover dates, provenance, strict requirement normalization, leg assessment, route comparison, snapshot review, source inventory, export, user interaction, bilingual copy, focus behavior and mounting. Pure tests do not use network requests or actual place data. Fixtures are fictional.

## Export behavior

The visitor triggers the export button. The exported JSON includes a declared report date, selected preferences, each route's requirement states and only the source inventory needed to review those requirements. No connection to a remote endpoint is introduced. The source inventory status remains `UNKNOWN` when relevant citations or observation dates are missing.

No scheduled workflows, links to medical eligibility decisions, automatic submissions, purchases or account changes are introduced.
