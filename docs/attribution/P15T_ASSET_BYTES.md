# P15T — offline asset byte gate

This module checks the **actual supplied bytes** of every locally declared offline asset. Existing metadata-only gates inspect file sizes and declared digests; P15T supplements them by calculating SHA-256 over caller-supplied `Uint8Array` values. The module performs no network operations, filesystem reads, writes, uploads, or publishing.

## Contract

```js
import { auditOfflineAssetBytes, assetByteReportText } from './p15t-asset-bytes.mjs';

const inventory = {
  schemaVersion: 1,
  asOf: '2026-11-19',
  sources: [{
    id: 'civic', name: 'Civic open data', licence: 'OGL-ON-1.0',
    observedOn: '2026-11-19', reference: 'sources/civic.json',
  }],
  assets: [{
    id: 'guide', path: 'offline/guide.json', en: 'Offline guide',
    fr: 'Guide hors ligne', sha256: '<replace with actual lowercase hex digest>',
    bytes: 23, sourceIds: ['civic'], silo: 'open',
  }],
};
const suppliedBytes = new Map([['guide', new TextEncoder().encode('...')]]);
const report = auditOfflineAssetBytes(inventory, suppliedBytes);
if (!report.ok) throw new Error(assetByteReportText(report, 'en'));
```

The byte count and digest in a real inventory must be calculated independently and must match the actual local payload. The illustrative placeholders above are not a passing inventory.

The caller supplies an exact-key inventory and a `Map` from asset ID to bytes. A `Buffer` also works because it subclasses `Uint8Array`. A typed array with an unexpected element type, a string, an `ArrayBuffer`, or a sparse JavaScript number array is not accepted.

The report contains `ok`, a stable `findings` array with English and French descriptions, and summary counts for sources, assets, successful byte matches, total declared bytes and total supplied bytes. It never includes the bytes themselves. A failed gate must not cause publication, display claims, or partial export.

## Input boundaries

- Supported source licences are CC0-1.0, CC-BY-4.0, OGL-Canada-2.0, OGL-ON-1.0 and ODbL-1.0. ODbL stays in its separate export silo.
- Observation dates must be real `YYYY-MM-DD` calendar dates, at or before the inventory date and within the configured age window. This module evaluates a supplied date and never reads the system clock.
- Asset IDs, source IDs and local paths are bounded and cannot include directory traversal, URL schemes, query fragments or control characters.
- Every asset has EN/FR descriptions, one or more source references, an exact lowercase 64-character SHA-256 digest, a positive declared size and a matching `Uint8Array`.
- Default limits are 2,048 sources, 2,048 assets, 8 MiB per asset, 32 MiB total bytes and a 365-day age window. The optional strict policy object can only lower these maximums.
- Extra supplied assets, omitted expected assets, repeated identifiers and repeated paths fail. No partial success is returned.
- Text is checked for unsafe markup and personal contact patterns. French punctuation requires U+00A0 before colons and U+202F before semicolons, exclamation points and question marks.

## Integration

Files are self-contained: `p15t-asset-bytes.mjs` imports only `node:crypto`, and its test imports only Node built-ins plus the module beside it. The existing root `node --test docs/attribution/*.test.mjs` test command picks up `p15t-asset-bytes.test.mjs`. No package script, dependency, configuration, or workflow replacement is needed.

Run the module-specific suite:

```sh
node --check docs/attribution/p15t-asset-bytes.mjs
node --check docs/attribution/p15t-asset-bytes.test.mjs
node --test docs/attribution/p15t-asset-bytes.test.mjs
```

For a repository-wide gate, run the existing `npm run lint`, `npm run typecheck` if available, and `npm test` on a complete checkout with its lockfile. This module is additive and is not a substitute for existing offline evidence, record, publication or licence checks.
