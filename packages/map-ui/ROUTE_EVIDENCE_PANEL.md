# Route evidence and uncertainty panel (P15AB)

This feature mounts in the live `JourneyResult` component, after the map, attribution and route-comparison control. It does not change route planning or the location of the emergency link. The new panel starts collapsed to preserve the established keyboard and reading order.

## Use

`RouteEvidencePanel` accepts a `JourneyPlan` produced by the existing `@access-maps/journey` engine and an optional explicit `onExport` callback. Its pure `buildRouteEvidence` helper returns a structured dashboard suitable for additional visualisations. The barrel exports the component, pure helpers and their types.

The panel shows outbound and return evidence separately, with the route segment, stated accessibility value (`YES`, `NO`, `UNKNOWN`), source identifier, open licence, source date, observation tier, surface and stated distance. It shows unknown and contradictory records conservatively, without claiming that a journey is appropriate for any particular person. It does not provide medical advice or eligibility decisions.

Issue categories include access status, recorded barriers, missing source identifiers, unsupported licences, missing dates, unreported tiers, unknown surfaces and gradients, incomplete routed distances, missing schedules, single points of failure and existing journey warnings. Users can filter all issues by direction, severity, category and searchable text. Each option shows three matching issues per page, with its own count and navigation. The segment and source disclosures load their contents when opened. The local JSON export includes every issue across all pages. Several routes can be ordered by uncertainty, stated distance or source count, and two can be selected for an evidence comparison.

## Data boundaries

The panel performs no fetch, upload, account access or scheduled work. No inferred positive access is substituted for `UNKNOWN`. If a leg claims positive access but supplies no supporting observation references, the panel reports `UNKNOWN` for that segment. Source licences outside the repository's enumerated open-licence set are also represented as `UNKNOWN` in the review. Malformed, contact-like, unsafe or overly long source identifiers are not copied into the derived local export.

The original route result and its separate map view remain unchanged. A source's retrieval date is displayed as a provenance fact, not evidence that conditions remain unchanged. The review does not establish accessibility on site.

## Local JSON export

The user explicitly presses the export control. It creates a bounded derived report containing option status, segment identifiers, explicit uncertainty, source IDs, open licence identifiers, retrieval dates, evidence tiers and issue codes. Each exported segment and issue carries these source fields. Options and legs use report-local identifiers so their rows can be matched without exposing the origin, destination or requested departure time encoded in planner IDs. It does not contain the user's equipment profile, registration details, telephone numbers or full raw input. When `onExport` is supplied, the parent can handle the JSON; otherwise the browser's local download capability is used when available. The JSON is also presented in a read-only text area for copying.

No external endpoints are contacted by the module. There are no background timers, scheduled checks or implicit downloads.

## Keyboard and language

The initial disclosure, filters, comparison buttons and export control are native controls with at least a 44-by-44 CSS pixel target. Focus rings, forced colours, narrow screens and reduced-motion preferences are supported. English and French have matching copy keys. French uses typographic apostrophes and nonbreaking spaces before colons, exclamation points and question marks and inside guillemets. Unknown field values remain the explicit token `UNKNOWN`.

## Test coverage

`packages/map-ui/test/routeEvidence.test.ts` exercises the pure model, uncertainties, route/return combinations, source identity, date parsing, licence handling, filters, comparisons, deterministic JSON, and bilingual copy. `RouteEvidencePanel.test.tsx` covers disclosure state, native controls, filtering, sorting, comparisons, segment details, local export and French labels. Fixtures in `routeEvidenceFixtures.ts` are synthetic and make no statement about actual Ontario conditions.

Run the existing map-ui test, lint and typecheck scripts after applying the complete files. No changes to package scripts, lockfiles or scheduled workflows are necessary.
