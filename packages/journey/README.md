# @access-maps/journey

Door-to-door journey-chain engine for the App. It plans legs over catalog records (GTFS stops, path segments, venues, washrooms) plus optional overlays for elevators, charging, parking, paratransit, and fares.

Step-free status is `step-free`, `unknown`, or `not-step-free`. A missing fact stays unknown. A straight-line distance is labelled straight-line and is not a route. Operator and open-data flags are not App surveys. Paratransit is a link and a policy summary, never a confirmed trip. Times are scheduled.

Routing engines that may be called as separate services are self-hosted Valhalla, OSRM, and GraphHopper. Their pedestrian geometry is not treated as step-free. OpenTripPlanner and OpenRouteService are rejected by name and are not vendored.

The open-data files under `data/` are produced by another change. This package does not write them. `JourneyDataSource` is the read interface. Tests use fixtures.

French sentences in `explain.ts` are a draft (`FRENCH_REVIEW = "draft-unreviewed"`).
