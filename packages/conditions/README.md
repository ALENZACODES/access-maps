# Conditions — the App

Local, manually imported Ontario winter, road and construction conditions,
plus person-controlled obstacle-draft export.

No backend, scheduled job, network submission, third-party map tiles,
account or automatic publication is implemented.

## Candidate official sources

These are **candidates**, not authorised or currently ingested feeds:

| Candidate | Possible information | Initial status |
| --- | --- | --- |
| Ontario 511 | Road restrictions, closures, construction | HELD |
| Environment Canada | Weather and winter observations | HELD |
| Municipal open-data portals | Snow clearing and plough areas | HELD |
| Municipal open-data portals | Road restrictions and construction | HELD |

All candidate feeds stay out of git until a confirmed open licence,
its exact licence URL and a real manual fetch are recorded.
An agency's general open-data policy does not automatically establish
the licence of every dataset it hosts.

An importer source registry entry requires:

```ts
{
  sourceId: "example",
  sourceName: "Example municipal feed",
  licence: null,
  licenceUrl: null,
  status: "held",
  heldReason: "Dataset-specific licence not confirmed"
}
```

Only ODbL, OGL-Ontario, OGL-Canada, CC-BY and CC0 may be confirmed.
ODbL-derived records must remain in the separate `odbl` silo;
ODbL share-alike obligations apply. Never combine or relicense
ODbL-derived data as OGL or CC data.

## Manual imports

`importConditions` accepts exactly one local file path or fixture string,
a format (`geojson` or `csv`), a registry entry and an explicit fetch
timestamp. It returns records plus source, licence, silo and any hold reason.

The importer never performs a network request and checks licence status
**before reading the input file**. Unconfirmed feeds yield zero records.
No source data is downloaded or committed automatically.

Two bundled inputs are explicitly synthetic:

- `fixtures/synthetic-511-restriction.geojson`
- `fixtures/synthetic-snow-plough.csv`

They must not be represented as observations, official Ontario 511
data, municipal operations or current conditions. A synthetic fixture's
CC0 registry entry describes only the fixture itself, not the official
source that the example resembles.

For a real feed, record the actual source licence and URL, fetch timestamp,
attribution, source key and manual import log before distributing any
records. Do not infer current conditions from old observations.

## Condition records

Each condition carries type, location, a fact using the shared provenance
shape, fetch/check dates and a short expiry in hours.
An unverified imported source claim is tier 1; this package never assigns
evidence-backed tiers 2 or 3.

`conditionsNear` returns records with a distance and a status:

- `last_fetched`: fetched or checked within its expiry window;
- `needs_check`: outside the window, in the future or invalid timestamp.

Expired records remain visible **only as needing a check**. A recent
fetch does not constitute a live status claim. Cell-only records
without coordinates cannot be located by a point-radius query.

The UI displays source, licence, date and tier for each fact.
Missing or `UNKNOWN` values appear as Unknown / Inconnu.

## Obstacle drafts

`ObstacleDraft` is local data, tier 0, not a published condition.
Photo handles are local IDs only, reserved for the separate photo
conventions. No photo content is sent or included in this JSON export.

The user explicitly checks each draft before export. `serializeDrafts`
rejects unverified drafts. `exportDrafts` downloads a JSON file through
the browser; it does not upload or publish anything.
The person decides whether and where to share the saved file.

## Integration and accessibility

Import `ConditionsList` from `@access-maps/conditions`. Supply locally
available records, optional drafts and `language="en"` or `"fr"`.
The component uses ordinary semantic headings, lists, labelled controls
and a live region for export feedback.

The package includes a Playwright/axe integration contract for a host
route `/conditions-test`, tested at 320 and 1280 pixels in both languages.
The host must mount the component with synthetic data for that test.
This lane does not edit the host shell.

Regional packs are on-demand only. Do not add them to service-worker
precache. The initial precache limit remains 4,141,875 bytes.

## Route reports from people

`RouteReport` is one person's observation of a route condition: a snowbank,
a blocked curb cut, ice, a surface problem, a steep or tilted section, an
obstruction or something else. `schema/route-report.schema.json` and
`validateReport` apply the same rules.

- `observed_at` is the time the person saw the condition and is kept exactly
  as given. `observation.retrieved_at` is when the report was saved. A photo's
  capture time never replaces `observed_at`; a difference of more than one
  hour only produces a warning.
- `observation` uses the field-value shape (`value`, `source_id`, `licence`,
  `retrieved_at`, `tier`). A report is always tier 0; any other tier is
  rejected.
- Photo data is metadata only: a local handle, media type, capture time and
  pixel size. No image bytes and no embedded position are kept.
- The reporter role is self-declared, never checked and never changes a tier.
- The licence that applies to reports saved on a device is supplied by the
  host. This package does not decide it.

### Freshness

`reportFreshness` lowers a report's confidence with age on the curve set for
its kind (`exponential`, `linear` or `step`) and marks it `expired` at the
configured expiry. `DEFAULT_DECAY` holds adjustable product settings; they
are not measurements of how long any condition lasts. Confidence is a
relative weight from 0 to 1, not a probability.

An expired report stays in every result, labelled expired, with zero
confidence. A report dated in the future (beyond a five-minute clock
allowance) or with an unreadable time is `needs_check`. Neither is treated as
current.

### Corroboration

`corroborateReports` groups reports of the same kind, source and licence at
the same segment id, feature id, or within `radius_m` (default 15 m) for
point reports.

| Situation | Result |
| --- | --- |
| One current report | `active`, tier 0 |
| Current reports from at least `min_independent` (default 2, minimum 2) distinct reporters | `active`, tier 2 |
| Several reports from one reporter | one voice; tier 0 |
| Reports without a reporter reference | at most one voice in total, and none once a referenced reporter is counted |
| A later "cleared" report | `reported_cleared`; earlier reports are `superseded` |
| "Present" from someone else within `dispute_window_hours` (default 2) of a "cleared" | `disputed`; tier 0; confidence multiplied by `disputed_factor` |
| "Present" later than that window | a new condition; counted normally |
| Only expired reports | `expired` |

Tier 2 here means only that independent people reported the same thing. The
package never assigns tier 1, 3 or 4 to a report, and the interface never
calls a report verified. Whether corroborated reports should count toward
any verified total elsewhere is a product decision this package does not
take.

### Routing facts

`routingFacts` turns each group into one fact for a planner:

- `hint`: `penalty` for a current group, `avoid_if_possible` only for a tier 2
  group of a kind in `may_avoid` with confidence at or above
  `avoid_threshold`, otherwise `none`;
- `penalty`: kind weight multiplied by confidence, zero when the hint is
  `none`;
- `fact`: the field-value shape with `derived: true`;
- `provenance`: all report ids, the counted report ids, independent reporter
  count, confidence, latest observation, expiry and whether a photo exists.

`passable` is always `UNKNOWN`. A fact can make a way less attractive; it
never states that a way can or cannot be used. A `reported_cleared` fact
carries no bonus, and the absence of a fact means no report, not a clear way.
`DEFAULT_ROUTING_WEIGHTS` holds adjustable settings, not measurements;
whether a condition matters for a given person and device is the planner's
decision.

## Accessible taxi and on-demand accessible vehicles

`WavServiceRecord` describes one service. Every field (`municipality`,
`service_name`, `service_type`, `availability`, `booking_phone`,
`booking_url`, `service_hours`) is a field-value object with its own
`source_id`, `licence`, `retrieved_at` (YYYY-MM-DD) and `tier`.
`schema/wav-service.schema.json` and `validateWavDataset` apply the same
rules.

Availability is a closed vocabulary: `on_demand`, `advance_booking_only`,
`limited`, `effectively_unavailable`, `UNKNOWN`.
`effectively_unavailable` is accepted only when the field also carries
`source_dated`, the date the source itself gives for the statement, no later
than `retrieved_at`. Without a dated source the value is `UNKNOWN`.

`datasets/wav-services.json` is the real dataset and **contains no records**.
No operator page has been read for it. Add a record only from a source that
has actually been read, with its licence and retrieval date; the loader
rejects any record marked synthetic.
`fixtures/synthetic-wav-services.json` and
`fixtures/synthetic-route-reports.json` are synthetic, labelled
`synthetic: true`, used only by tests, and must never be shown as real
services or observations. The interface prints a sample-data label on any
synthetic record.

`searchWav` filters by municipality, service type and positive availability
values:

- `UNKNOWN` never matches a positive filter, and a filter cannot ask for
  `UNKNOWN` or `effectively_unavailable`;
- a value retrieved more than 180 days ago (or with an unreadable or future
  date) is `stale`: still listed without a filter, never matched as current;
- an empty result has `coverage: "no_records"`, shown as unknown and never
  as "no service exists".

Results are ordered by name. Nothing is ranked or recommended, and the
package does not book rides.

## Report and finder components

- `RouteReportsList` shows assessed groups with state, tier, expiry, source
  and licence written as text.
- `RouteReportFormView` is a stateless form; `RouteReportForm` holds its
  state and hands the validated tier 0 report to `onSave`. The host supplies
  the place and decides storage. No device location is read and nothing is
  sent.
- `WavFinderView` is a stateless finder; `WavFinder` holds the filter state.

All text is in English and French (`reportStrings`, `wavStrings`); the
French is a draft. Controls are native elements with labels, errors are
linked to their fields and summarised in an alert, status changes use a
polite live region, and control targets are at least 24 pixels.

After a rejected submission `RouteReportForm` moves focus to the error
summary, so the errors are read next and the first field is one Tab away.
After a saved report focus stays where it was and the status region
announces the save.

## Tests

This package is an npm workspace with its own test run
(`npm test -w @access-maps/conditions`, also part of the root `npm test`).
The component tests render with React in a simulated DOM: the report form,
the finder and the conditions list are operated through their controls in
English and French, including Tab order, rejected and corrected submissions,
announcements, focus after each action, and an axe run on each state.

Limits of that environment: colour contrast and rendered target sizes are
not computed (target sizes are read from the declared minimum sizes), the
date-and-time control's value is set directly because the simulated DOM has
no picker, and select options are chosen through the testing library rather
than by arrow keys. The Playwright contract in
`test/conditions.a11y.test.tsx` still needs a host route and is not part of
this run.
