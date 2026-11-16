# @access-maps/writeback

Local-only export of person-reviewed accessibility facts. A human submits this file. The App never logs in to OSM.

OpenStreetMap attribution: **© OpenStreetMap contributors, ODbL**. ODbL data remains in its own silo and is subject to ODbL share-alike; do not merge it into separately licensed OGL/CC datasets. Review both data licensing and provenance before making any edit. Other allowed source licences do not automatically authorize importing their content into OSM: a person must establish compatibility and permission first.

## Usage

`toOsmChange(edits, '2026-11-15')` returns an OSMChange v0.6 XML string suitable for local review in JOSM before a human uploads. Each edit supplies `osmType`, optional `osmId`, original `lat`/`lon`, `tags` keyed by field IDs, `confirmedFields`, `personReviewed`, and `comment`. A new point needs coordinates; existing nodes need their original coordinates, positive OSM id, and a **complete** `existingTags` snapshot so unrelated tags are retained. Way and relation modification is intentionally refused: their geometry and members cannot be safely reconstructed from the supplied fields. There is no API call or account creation. A comment names the App, date, and ODbL attribution; the human must still review the editor's final changeset comment and confirm tagging conventions.

Fields map to `wheelchair`, `toilets:wheelchair`, `door:width` (metres), `ramp`, `kerb`, and `wheelchair:description:en` / `wheelchair:description:fr`. Only `confirmedFields` are written. UNKNOWN, tier 0, missing provenance, missing licence, and unsupported values fail closed. The caller must not raise evidence tiers; tier 2–3 must be backed by its original review protocol. External licence compatibility remains the submitter's responsibility.

`toAgencyReport(events, { name })` produces `{ csv, text }` for a person to download and send. Events use the same fact shape `{ value, source_id, licence, retrieved_at, tier, source_key?, raw?, derived? }`, plus place/stop id, last checked date, field and short observation. Neither report asserts endorsement or live status.

`WritebackPanel` renders local EN/FR checkbox selection, factual provenance preview, and file downloads with browser Blob URLs. No token inputs, upload routes, remote calls, or background jobs. Ensure caller-provided drafts are not rendered as established facts until independently reviewed; the component should only receive person-reviewable selected drafts. Official editor help: https://wiki.openstreetmap.org/wiki/JOSM/Guide
