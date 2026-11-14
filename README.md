# access-maps

Part of the unbranded Ontario accessibility super-app (with access-main, access-tools, and access-help). This repository holds map and journey work. Call the product "the App".

## packages/journey

TypeScript door-to-door journey-chain engine: step-free status that defaults to unknown, GTFS transit plus rolling and walking legs, a router adapter (in-catalog graph, straight-line gap, or a self-hosted Valhalla, OSRM, or GraphHopper HTTP service), elevator status, washroom waypoints, timing limits the person sets, winter mode, charging warnings, and paratransit as links only.

OpenTripPlanner (LGPL) and OpenRouteService (GPL) are not vendored and are rejected if named as an engine.

## packages/map-ui

React and MapLibre GL components. Every map feature is also a button in a list, with keyboard arrow keys and a polite status announcement.

## Data

Imported records, when present, live in `data/` and follow the field-value shape (`value`, `source_id`, `licence`, `retrieved_at`, `tier`). This journey work reads that shape through `JourneyDataSource`. It does not edit `data/` or the import pipelines. Tests use fixtures, and unknown stays `UNKNOWN`.

## Checks

```bash
npm test
npm run lint
```

CI runs on pull requests only.
