# P18 — Offline attribution dependency inspector

This is a standalone, offline-capable notice-integrity feature for the App.
It is a human-facing release-evidence utility. It does **not** claim that a
publisher, organization, agency or municipality has assessed or endorsed any
content. A source credit is not permission to redistribute data; a recorded
observation is not a test of the accessibility of a physical location.

## What is new

A person can open a local `attribution-dependency-inventory/1` JSON file,
inspect the source and licence evidence inherited through asset dependencies,
see precisely which sources should have notices on each publication view,
and export findings without sending the inventory to an external service.
The browser deliberately begins empty; it does not guess a feed, date,
licence, publisher or relationship. There is no automated import of real-world
accessibility facts and no external request or background activity.

Unlike a flat source catalogue, the inspection follows a directed graph:
asset A may depend on B and C; B and C may cite different source records.
The view that uses A inherits both source obligations. Cycles, broken links,
duplicate IDs, malformed records and unsafe paths are rejected before any
new inventory replaces the one already open. The graph is bounded to protect
against accidental multi-megabyte input and excessive processing.

## Files and direct integration

- `dependency.html`, `dependency.css`, `dependency-route.mjs` provide a direct
  local interactive entry point, skip navigation, a main landmark, human-readable
  source and asset tables, findings filters, file inputs and explicit exports.
- `dependency-core.mjs` enforces strict, versioned inventory validation.
- `dependency-audit.mjs` traverses dependencies, calculates each view's
  inherited source obligations, and audits placement and provenance gaps.
- `dependency-report.mjs` produces localized reports and spreadsheet-safe TSV.
- `dependency-cli.mjs` supports explicit, on-demand local release checks.
- `dependency-link.css` styles the bilingual links added to the complete
  `index.html` from merged maps main `62893a87`.
- `dependency-fixture.mjs` contains **fictional** test evidence only.
- Five `dependency-*.test.mjs` files exercise the actual source modules.

All direct local module imports are included in this package. The existing
attribution page keeps its original CSS and route script plus all the merged
navigation (placement, trace, observation, conflict and parity). The feature
never imports unmerged checklist or packet branches.

## Contract

The root JSON object has five exact keys: `schema`, `title`, `sources`,
`assets`, and `surfaces`. Each source provides an ID, origin, source HTTPS URL,
licence and terms HTTPS URL, retrieval date, evidence tier, permission state,
exact credit text and notes. Each asset declares its ID, local path, kind,
source references, asset dependencies, byte count, included/held state and
notes. Each view declares its ID, route, locale, asset references, recorded
notice text, placement, observation date, visual/readability states,
keyboard, screen-reader and visible-focus states, a minimum target size and
notes. Missing evidence is explicitly `UNKNOWN`; the audit never fills it.

A view is held from automated publication assumptions when its transitive
source evidence or placement is incomplete. The tool reports missing source
rights, exact OpenStreetMap credit and map-adjacent placement, data provenance,
notice observation dates, 44px target evidence, and held dependency assets.
The ODbL source family is kept separate in the findings from other licences;
there is no automatic blending of independently licensed data.

The exact map credit when applicable is `© OpenStreetMap contributors`. It is
not merged with the text of the ODbL licence. GO Transit / UP Express and LTC
are not assigned a synthetic source; the inventory must explicitly supply
applicable source and licence evidence before an audit can evaluate them.
No MiWay feed or facts are introduced.

## Source-impact review

The user-facing Source impact paths section traces a selected source through
all declared local asset edges to its publication views. A source can have
multiple inherited paths, all of which are displayed as readable strings.
A source not referenced by any displayed view has an empty impact report,
not a fabricated association. The reviewer can export an individual source's
impact text or a full TSV impact matrix. This assists with identifying
publication surfaces to inspect after a source term or notice changes.

`dependency-impact.mjs` uses the same strict inventory schema, not an
independent source database; its tests cover shared ancestors, missing
source references, UNKNOWN values, safe TSV output, date provenance and
language-specific punctuation. The additional module is included in the ZIP.

## Local command-line use

Run the command deliberately, with an actual inventory supplied locally:

```
node docs/attribution/dependency-cli.mjs local-inventory.json --format text
node docs/attribution/dependency-cli.mjs local-inventory.json --format json
node docs/attribution/dependency-cli.mjs local-inventory.json --format coverage
node docs/attribution/dependency-cli.mjs local-inventory.json --format edges
node docs/attribution/dependency-cli.mjs next.json --before previous.json --format comparison --lang fr
```

Exit 0 means no blocking evidence gaps under these local rules; exit 1 means
blocking gaps; exit 2 means malformed input, unsupported options or I/O error.
An exit 0 is **not** a legal approval, accessibility certification, or claim
of freshness. A person must inspect the actual source terms and the published
view and assess the actual experience with assistive technologies.

No CI workflow, timer, timeout, budget, installation script, registry,
lockfile or service-worker configuration is changed by this feature.

## Accessibility and languages

The page supports English and French controls and reporting. French labels
use a nonbreaking space U+00A0 before a colon; mandatory source legal text
is never translated or changed. Buttons, file inputs, the view selector and
expanding details have at least 44px minimum height. A keyboard focus ring,
skip link, semantic headings, status announcements, responsive layout, high
contrast-aware colours, and reduced-motion fallback are provided. Final
WCAG 2.2 AA requires a manual keyboard and screen-reader review in the actual
host deployment; these source tests are not substitutes for browser axe scans.

## Testing and publication boundary

```
node --test docs/attribution/dependency-*.test.mjs
node --check docs/attribution/dependency-route.mjs
```

The root maps test command already discovers `docs/attribution/*.test.mjs`.
The new static files must be served together if they are added to an offline
bundle. Their mere presence in this source package does not automatically
precache them or expand an unrelated application's install payload.
