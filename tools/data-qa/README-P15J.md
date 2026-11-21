# P15J: Offline handoff, resume and bilingual coverage gates

Run `npx tsx --test tools/data-qa/p15j-*.test.ts` to exercise the local gates.
Run `npx tsx tools/data-qa/p15j-cli.ts --help` for audit commands.
The CLI accepts only local JSON files and writes a new local report when requested.
No fetching, external hosting, background jobs or scheduled operations are used.

- `handoff`: requires dated open-licence provenance and packet-linked receipts;
  rejects conflicted known status, mismatched ODbL silos and held feeds.
- `resume`: checks ordered SHA-256 journal links, legal transition sequence,
  dependency closure, rollback, and available offline storage.
- `coverage`: checks English/French offline region parity, local paths,
  source retention, open-licence separation and UNKNOWN preservation.

A failed gate returns exit status 1; broken CLI input or file operations return 2.
Only a pass (exit 0) permits publication. Output does not contain user-identifying
submissions or accessibility guesses. Source dates describe observations, not
current conditions. Recheck information independently before relying upon it.
