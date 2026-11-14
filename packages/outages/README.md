# @access-maps/outages

Elevator and escalator outages for the journey engine (master plan Days 9 and 10).

- `normalizeAlerts` checks each TTC GTFS-Realtime accessibility alert against the service-alert shape and copies the operator text. Station name and asset label are read from that text. When the text does not give them, they stay `UNKNOWN` or null.
- `outageState` reads `active_periods`. An outage past its end time is not current. A planned one is not current yet. An outage with no end time leaves the current view 30 days after the feed time.
- `stationStatus` says "outage reported", "no outage reported" (with the source and time, and not as a check that the elevator works), or "unknown" when the source does not cover the station.
- `loadOutages` reads the feed first, then the last snapshot that came from the feed, then the dated manual seed. Both fallbacks are marked may-be-out-of-date. The seed is also marked demonstration.
- `planWithOutages` turns current elevator outages into elevator status for `planJourney`, marks the legs that pass an outage, and lists every usable option the engine found that avoids the affected stations. When there is none, it says so. Each profile flag names the setting it comes from.
- Escalator outages are listed on the leg. They do not change step-free status.

`seed/gtfs-rt-ttc-accessibility.2026-11-13.ndjson` is the 32-alert snapshot from access-main `packages/schema/fixtures/import/alerts` (commit 5dcd003), which came from access-maps pull request 1. `seed/ttc-stops.ts` holds 11 TTC stop records copied unchanged from pull request 1. Both are under the Open Government Licence – Toronto. Trips in the tests and the demo are scenario fixtures.

Run `npm test` and `npm run lint` from this folder. The browser checks live in `packages/map-ui` (`npm run test:e2e`, demo page `outages.html`).
