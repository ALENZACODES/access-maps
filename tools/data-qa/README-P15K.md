# P15K: Offline publication integrity

Run `node --test tools/data-qa/p15k-*.test.mjs` and
`node tools/data-qa/p15k-cli.mjs --help` in a Node 22 environment.
The standalone CI job executes these tests on every change to this workstream.
It does not rely on pending PRs, external services, a lockfile, or a network fetch.

The history gate rejects unsupported access assertions, observation cycles,
retired events being reactivated, held feed content, provenance gaps, and
publication chronology problems. Compare-history checks that earlier evidence
is never silently rewritten, removed, or promoted from UNKNOWN without new evidence.

The refresh gate cross-checks manifest contents, declared ADD/REMOVE/REPLACE
operations, operation dependencies, journal state transitions, storage limits,
and complete local rollback inventory with a deterministic SHA-256 digest.
The disclosure gate checks the offline English/French page catalogue, source
licences, ODbL separation, references, 44px controls, keyboard focus order,
placeholder parity, unsafe markup, text privacy and French punctuation.

Use `--format en` or `--format fr` for human-readable diagnostics. JSON reports
retain bilingual messages. Block export whenever an audit reports `ok: false`.
The utilities never infer accessibility from missing evidence. Public source
information must include a non-held source, open licence, date and offline
reference. The utility does not perform any medical assessment.
