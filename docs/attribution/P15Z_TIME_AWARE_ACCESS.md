# P15Z: Time-aware Ontario access routing

This package is a local-only candidate implementation. Inputs are caller-supplied snapshots, not live traffic, weather, or elevator information. No network access, user account, timer, background polling, automatic retries, or publication action is performed.

## Layout

- `p15z-common.mjs`: fail-closed structure, bilingual text, French typography, dates, safe paths, licence boundaries, evidence tiers, diagnostics, immutability, and deterministic digests.
- `p15z-events.mjs`: bounded temporary event ingestion, window evaluation, conflicting reports, chronology, source review, and receipts.
- `p15z-routing.mjs`: bounded path alternatives, temporary overlay composition, profile limits, uncertainty propagation, timelines, and route-change reports.
- `p15z-fixtures.mjs`: fictional test network only, never presented as observed real-world access.
- Three `.test.mjs` suites run through the existing root `node --test docs/attribution/*.test.mjs` command.

## Inputs and guarantees

All records use explicit source IDs, open licences, silo, observation dates, tier and EN/FR names. A positive access claim needs matching dated evidence; tier 3 needs independent matching sources. The only unknown access token is `UNKNOWN`.

Events use exact UTC timestamps, with inclusive starts and exclusive ends. Inactive events do not imply that infrastructure works. An active closure is `NO`; unknown or conflicting event information stays `UNKNOWN`. A reopening notice does not override a concurrent closure without exposing the conflict.

Route requests must specify `allowUnknown`; they never silently opt into conditional results. Routes are bounded by distance, hop count, gradient, route count, queue size and explored states. No fabricated edge or transfer may connect two nodes. The open and ODbL licence groups are searched separately.

The following are examples of reporting values, not travel instructions or accessibility guarantees:

- `found`: every selected segment has supported positive access in the supplied candidate network and overlays.
- `conditional`: at least one selected segment or endpoint carries `UNKNOWN`.
- `absent`: no supported route fits the supplied request within its explicit limits.
- blocked result: input structure, time interval, evidence or resource budget is not suitable for safe processing.

A local receipt includes selected segment IDs, source IDs, event IDs and deterministic SHA-256 of canonical JSON. It does not prove the source records reflect current physical conditions.

## Commands

Run the isolated tests with:

```sh
node --test docs/attribution/p15z-*.test.mjs
```

The root project already includes all `docs/attribution/*.test.mjs`, so no package manifest, lockfile, script or workflow change is required.

## Integrating into route applications

Call `validateRoutingNetwork` and `validateEventFeed` before exposing route choices. `planTimeAwareRoutes` repeats both validation stages and returns a blocked result with bilingual diagnostics on failure. Display every route segment's `access`, `tier`, `sourceIds`, `eventIds`, and snapshot timestamp. Do not transform `conditional` into an unconditional accessible route. If a route is reviewed after source updates, compare complete route results and show changes explicitly; never reuse an old positive statement without its dated support.

## Limits

This module validates independently supplied metadata. It is not a substitute for a survey, operator data licence review, a physical journey, or an emergency-access plan. It does not fetch, parse, or overwrite external data. Existing P15V routing helpers remain available in main; this module adds temporary event and time-specific decision contracts without modifying those source files.
