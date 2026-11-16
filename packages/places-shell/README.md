# @access-maps/places-shell

Text search and place detail over the published web pack, returned in the shape the access-main shell expects on `/places` (`ModuleResult<PlaceHit>` and `ModuleResult<PlaceDetail>`, contract 1.2.0).

```ts
import { createPlacesModule } from "@access-maps/places-shell";

const places = createPlacesModule(source);
const result = await places.search({ text: "pharmacie" }, { locale: "fr", offline: true, nowIso });
const detail = await places.get("venue:example", { locale: "fr", offline: true, nowIso });
```

- `source` is a `PackSource` from the web pack data client. Loading pack files is left to the caller. This package does not download, edit, or bundle data.
- Search uses the pack's public index across venues, washrooms, and transit stops, then loads each record to attach provenance. A detail view returns the original record with held or un-evidenced fields removed. Missing fields stay `UNKNOWN`.
- Each hit carries the name's source, licence, retrieval date, tier, and the source's attribution. The pack records only the retrieval day, so that day is the source date. Category and city are copied as stored, and `UNKNOWN` stays `UNKNOWN`.
- A record is left out, not filled in, when its name is `UNKNOWN`, its source is not in the published pack or is held, or its tier is above 1 without evidence. `diagnostics()` counts each reason so a data-status page can show it.
- Empty text returns an empty list, not every place. Results are capped (50 by default), sorted by name, and `truncated` says how many were cut.
- Near me is available only when the caller sets `geolocationGranted`. Coordinates are supplied in memory for that search only and are not stored, logged, or sent to a geolocation endpoint by this package.
- There is no accessibility ranking and no step-free claim. A search hit is not a statement that a place is accessible.
- Live status is always `unavailable`.

The output was checked with access-main's `checkModuleResult` on 14 November 2026. Test fixtures are described in `test/fixtures/README.md`.

`npm ci`, `npm run lint`, and `npm test` run from this folder. CI runs on pull requests and on pushes to main.
