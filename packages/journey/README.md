# @access-maps/journey

Door-to-door journey-chain engine for the App. It plans legs over catalog records (GTFS stops, path segments, venues, washrooms) plus optional overlays for elevators, charging, parking, paratransit, and fares.

Step-free status is `step-free`, `unknown`, or `not-step-free`. A missing fact stays unknown. A straight-line distance is labelled straight-line and is not a route. Operator and open-data flags are not App surveys. Paratransit is a link and a policy summary, never a confirmed trip. Times are scheduled.

`createHttpRouter` is a stub. Its synchronous `route()` does not call the network and returns a straight-line gap. `routeWithFetch` posts to a placeholder `/access-route` path, not the Valhalla, OSRM, or GraphHopper request APIs, and `planJourney` does not call it. A real self-hosted service would send the origin and destination off the device. That path is not connected, so this package does not present a privacy notice for it. Pedestrian geometry from those engines would not be treated as step-free.

A routed walking leg (`approach`, `roll`) cites the path record that decided its status, carried through `RouterResult.provenance`. The router's id is never a source. When that record is OpenStreetMap data (a source id starting `osm-`, or an ODbL licence stamp), the leg's provenance carries `licence: "ODbL-1.0"`, `attribution: "© OpenStreetMap contributors"`, `retrievedOn` (the record's own retrieval date, or `UNKNOWN`), and the record's `tier`. A leg decided by a barrier report cites the report, and `geometryAttribution` still carries the credit for the drawn line.

A paratransit leg shows the booking window from the catalog. The catalog has no booking-cutoff field, so the cutoff is shown as unknown with the operator's phone. The departure time is not a deadline.

A barrier report dated in the future makes its path or stop unknown. `UNKNOWN` is the data value. `displayValue(locale, value)` gives the word to show.

OpenTripPlanner (LGPL) and OpenRouteService (GPL) are rejected by name and are not vendored. The plan allows a self-hosted Valhalla, OSRM, or GraphHopper service. Those two projects are excluded because their licences do not fit this repository.

The open-data files under `data/` are produced by another change. This package does not write them. `JourneyDataSource` is the read interface. Tests use fixtures.

French sentences in `explain.ts` are a draft (`FRENCH_REVIEW = "draft-unreviewed"`).
