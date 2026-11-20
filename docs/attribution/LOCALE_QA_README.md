# Bilingual attribution quality audit

This is an offline publication-quality gate for the recorded presentation of source and licence notices. It does not inspect physical access conditions, offer medical advice, or establish rights that were not explicitly supplied. It shares the merged `attribution-utils.mjs` source catalogue; there is no copied provider notice catalogue.

The `attribution-locale-qa/1` schema contains release ID, whether bilingual parity is required, source records and publication page records. Each source has origin, provider, licence family, source and licence URLs, permission, licence evidence, dates, evidence tier and publication status. Each page has a language, explicit pair ID, relative route, declared sources, offline status, 44px or larger target evidence and notices. Each notice records the source ID, notice type, actual text, licence URL, visible and near-content evidence, keyboard, contrast and screen-reader checks, review state and date, and supporting evidence URL.

No source's licence or permission is inferred from its provider name. Included sources must have explicit permission and licence evidence. The audit requires the exact `© OpenStreetMap contributors` credit separate from ODbL terms, checks the Metrolinx AUA section 3 legend and both applicable-laws lines independently from the OGL line, and checks LTC's language-specific credit. A dataset date may remain `UNKNOWN`; the audit preserves it and reports it without inventing a date. Unknown permissions, visibility, or required manual observations block release.

## Browser route

`locale-qa.html` is a directly loadable static page; mount or publish it together with `locale-qa.css`, `locale-qa-route.mjs`, the public `locale-qa-index.mjs` and the source modules. The route uses file pickers for local JSON documents. It does not fetch data or persist records. It shows findings and optional before/after changes. Report downloads and print are explicit controls. Controls and links have 44px minimum dimensions, focus styles, skip navigation, reduced-motion treatment and a restrictive Content Security Policy. Test the hosted UI manually with assistive technologies as well.

## Local release gate

```sh
node docs/attribution/locale-qa-cli.mjs release.json --lang fr --format text
node docs/attribution/locale-qa-cli.mjs new.json --before old.json --format json
node --test docs/attribution/locale-qa-*.test.mjs
```

Exit 0 means no blocking finding in supplied metadata, 1 means a blocker or regression, and 2 means invalid input. Input data is never transmitted or written by the CLI. Run explicitly when preparing a release; no task or schedule is created.

The existing root `npm test` already discovers `docs/attribution/*.test.mjs`. All sources and tests are local. This feature does not modify `package.json`, other scripts, other packages or generated datasets.
