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
