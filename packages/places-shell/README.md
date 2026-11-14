# @access-maps/places-shell

Text search over imported venue records, returned in the shape the access-main shell expects on `/places` (`ModuleResult<PlaceHit>`, contract 1.1.0).

```ts
import { createPlacesSearch } from "@access-maps/places-shell";

const places = createPlacesSearch({ venues, sources });
const { result, skipped, truncated } = places.search({ locale: "fr", offline: true, nowIso, query: "pharmacie" });
// places.module can be passed to access-main's createModules({ places: places.module }).
```

- Input is the import shape in access-main `packages/schema/schema/import`: venue records whose fields are FieldValue objects, and source-registry entries. Loading `data/` files is left to the caller. This package does not download, edit, or bundle data.
- Each hit carries the name's source, licence, retrieval date, tier, and the source's attribution. The import records only the retrieval day, so that day is the source date. Category and city are copied as stored, and `UNKNOWN` stays `UNKNOWN`.
- A venue is left out, not filled in, when its name is `UNKNOWN`, its source is not in the registry, or its tier is 2, 3, or 4. `skipped` counts each reason so a data-status page can show it.
- Empty text returns an empty list, not every place. Results are capped (50 by default), sorted by name, and `truncated` says how many were cut.
- There is no accessibility ranking and no step-free claim. A search hit is not a statement that a place is accessible.
- Live status is always `unavailable`.

The output was checked with access-main's `checkModuleResult` on 14 November 2026. Test fixtures are described in `test/fixtures/README.md`.

`npm ci`, `npm run lint`, and `npm test` run from this folder. CI runs on pull requests only.
