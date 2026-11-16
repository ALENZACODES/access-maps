# Offline attribution bundle gate

This lane adds a local publication-bundle inspection command implemented in
`docs/attribution/offline-cli.ts`. The single
source catalogue is `index.ts`; source and surface metadata come from the
existing `evidence-contract.ts` release schema. No licence or permission is
inferred from an asset name, route name, or hash.

Each input JSON object declares `schema: "attribution-offline-bundle/1"`, a
`release` (using `attribution-evidence/1`), `assets` and `routes`. Asset
entries contain `path`, `kind`, `bytes`, `sha256`, `dependencies`, `sourceIds`
and `disposition`; route entries contain `id`, `path`, `entry`, `locale`,
`sourceIds`, `offline` and `surfaceId`. Every key is required. UNKNOWN is
permitted for unavailable bytes or digests but blocks an included asset.

The graph audit checks that every route references an existing publication
surface, the entry is included HTML, dependencies are present, an included
asset does not depend on excluded content, and used source IDs are linked to
the published route. The evidence audit still governs source rights, OSM
credit/ODbL, the separate Metrolinx GTFS AUA and OGL notices, LTC terms,
acquisition dates, and accessibility evidence. No MiWay dataset is added.

The filesystem option reads files in a local directory, checks byte sizes and
SHA-256 values, and blocks symlinked paths, missing files, and unexpected
changes. It does not download data or create outputs on disk. Keep the
manifest and actual files from the **same** release; do not use the report as
a claim about conditions at a location or about outside provider permission.

```sh
npm run audit:offline-attribution -- build/offline-bundle.json --root build/public --lang fr --format text
npm run audit:offline-attribution -- build/offline-bundle.json --format json
npm run test:offline-attribution
```

Exit status: **0** means no blocking findings in supplied records and, when
`--root` is provided, the inspected local files. **1** means blocked. **2**
means invalid input, unsupported options, or inability to read the manifest.
Without `--root`, actual file existence and hashes are not checked. This
option must be supplied by deployment jobs when asserting bundle integrity.

The standalone HTML report is created in memory and includes EN/FR labels,
explicit UNKNOWN fields, semantic headings, a skip link, visible keyboard
focus and 44 px interactive target dimensions. No external CSS, scripts,
remote tiles, or analytics are loaded. Source URLs are shown as text because
an offline report must not silently fetch them.

The offline tests run as Node tests through `tsx --test`; they use `.spec.ts`
filenames to avoid accidental discovery by the repository's Vitest runner.
Root `npm test` invokes this set before workspace tests. These automated
checks do not replace manual browser and assistive-technology evaluation.
