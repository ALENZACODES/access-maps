# Evidence custody checks

The ledger tests check the order and identity of registration, access, redaction, transfer and checkpoint events. They include changed snapshots whose SHA-256 values have been recomputed. The pack tests compare disclosed fields with the exact ledger revision and verify that withheld values stay hidden when a manifest is omitted.

Historical ledgers and version-one packs retain their recorded checksums during validation. New packs carry an explicit verification tier. The French summary distinguishes an omitted access history from an included history with zero accesses.

The fourteen filename changes from merged main are recorded in `P15_CUSTODY_MOVES.json`. Each destination is a complete replacement file. When integrating into an existing checkout, each source path in the mapping must be retired. A fresh extraction already contains the final names.
