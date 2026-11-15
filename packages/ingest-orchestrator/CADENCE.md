# Suggested human review cadence (not automation)

These are reminders for an operator, not a schedule executed by software.

- Monthly: manually review available OSM Ontario extract dates, attribution and ODbL silo handling before starting a run.
- When a new licence document appears: verify TTC GTFS, TTC alerts, GO Transit, UP Express, MiWay and LTC individually; record the URL, review date and a short evidence note before setting any to `confirmed`. As of 2026-11-15: GO and UP Express are AUA-accepted but packed only by I14 in separate metrolinx-go / metrolinx-up files; LTC Open Data Terms of Use are confirmed (hook still pending); MiWay remains unconfirmed and out.
- On integration of D, H or J12: ask the owning lane for a local importer hook, source provenance, licence proof and tier handling. Keep placeholders held until reviewed.
- After each manual run: inspect `reports/` for held sources, importer errors and record counts; do not interpret missing values as accessibility failures.

Never use cron, CI `on: schedule`, periodic polling or server keep-alive calls.
