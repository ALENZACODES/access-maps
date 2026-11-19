# Local attribution asset closure

`asset-closure.mjs` scans the local files directly required by a published HTML
page and selected Node tests. It follows literal relative module imports,
stylesheet and script references, CSS imports, and local files read by tests.
It prevents the missing-page and missing-stylesheet failure that can otherwise
escape a JavaScript-only test run.

The audit is read-only and offline. It does not make network requests, modify
files, infer missing evidence, or make claims about physical accessibility.
Any missing or inaccessible dependency, attempted path escape, symlink, remote
script/style resource or configured resource-limit violation blocks the result.

```sh
node docs/attribution/asset-closure-cli.mjs docs/attribution claim-trace.html claim-trace-wiring.test.mjs
node docs/attribution/asset-closure-cli.mjs docs/attribution claim-trace.html --lang fr
node --test docs/attribution/asset-closure.test.mjs
```

The CLI returns 0 when this static dependency audit has no findings, 1 when
files are missing or the graph cannot be packaged safely, and 2 for invalid
arguments or input. The French text report uses a nonbreaking space before
colons. The scanner does not certify runtime behaviour; it is a bounded source
asset check. The existing root test command already discovers `*.test.mjs`.
