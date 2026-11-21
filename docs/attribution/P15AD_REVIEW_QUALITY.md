# P15AD — Offline reviewer-quality calibration and drift review

## Purpose

P15AD provides a local, deterministic way to measure the consistency and calibration of blinded human reviews against a separately adjudicated reference sample. It is an audit aid for the P15 offline evidence-review lane. It does not establish accessibility facts, publish evidence, determine reviewer intent, or automatically restrict a reviewer.

A `YES`, `NO`, or `UNKNOWN` reference value is supplied by an authorized human adjudication process. P15AD never creates or upgrades reference values. `UNKNOWN` remains a distinct category and is measured separately from known-state accuracy.

## Modules

- `p15ad-contract.mjs`: bounded JSON contracts, canonical digests, safe text, dates, French typography and Wilson intervals.
- `p15ad-reference.mjs`: versioned adjudicated reference sets, blinded response sets, evidence binding and coverage.
- `p15ad-agreement.mjs`: confusion matrices, per-class precision/recall/F1, Cohen kappa, Fleiss kappa and stratified analysis.
- `p15ad-calibration.mjs`: policy-bound per-reviewer accuracy, coverage, abstention, unknown-state recall and confidence intervals.
- `p15ad-sampling.mjs`: deterministic stratified sampling with inclusion probabilities and replay verification.
- `p15ad-drift.mjs`: adjacent-window comparisons and cohort drift summaries with explicit no-automatic-action boundaries.
- `p15ad-report.mjs`: English/French offline report rendering with privacy and interpretation caveats.
- `p15ad-fixtures.mjs`: fictional test data only.
- `p15ad-*.test.mjs`: Node's built-in test suites.

## Measurement semantics

Known-state accuracy is calculated only from reference items adjudicated `YES` or `NO`, where the reviewer supplied a non-abstaining, known-state response. Coverage is the fraction of known-reference items with a scored response. Abstentions and `UNKNOWN` observations are not counted as correct known-state decisions.

Unknown-state recall is measured separately on reference items adjudicated `UNKNOWN`. A correct unknown response is an explicit `insufficient` decision with observed state `UNKNOWN`. A positive or negative assertion on an unknown reference counts as a failure in this separate measure; it does not rewrite the reference state.

Cohen kappa is pairwise nominal agreement. Fleiss kappa is calculated only for complete item panels where every reviewer supplied a non-abstaining rating. These agreement statistics are descriptive and are not a substitute for case-level adjudication.

Wilson intervals are descriptive 95% score intervals. They do not account for dependence between records or sampling design effects. Results must be interpreted with the declared sample size, coverage, strata and reference provenance.

## Sampling and drift

Sampling is deterministic for a given reference digest, seed, requested size and stratum set. A sample records population size, allocation and item inclusion probabilities. Validation rebuilds the selection from the supplied reference set rather than trusting the sample's listed membership.

Drift comparisons require non-overlapping, ordered date windows and the same opaque reviewer token. Small samples are labelled insufficient rather than being treated as a performance decline. Any watch or regression signal asks for human review only. No suspension, removal, access restriction or publication decision is automated.

## Privacy and safety

All reviewer references are pseudonymous tokens. Reports do not contain legal names, email addresses, phone numbers or free-form personal identifiers. User-supplied rationales are bounded and reject contact details, markup and control characters. Test fixtures use fictional labels and digests.

The modules use only Node built-ins and local inputs. They do not access a network, browser storage, timers, background services, schedules or connected accounts. No package scripts, dependency files, workflows, application source or precache inputs are modified.

## Test command

From the repository root:

```sh
node --test docs/attribution/p15ad-*.test.mjs
```

The existing root test command discovers `docs/attribution/*.test.mjs`, so the P15AD tests are included without editing `package.json`.
