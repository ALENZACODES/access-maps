# Evidence custody

The ledger records local evidence references, content and source digests, provenance, transfers, access history and redaction receipts. Each change refers to a previous revision. Registration dates, state transitions, event ordering and the correspondence between receipts and records are checked during replay.

The pack can include selected evidence items, access records and a digest of each event. Current packs carry the source, licence, retrieval date and tier. Legacy items with no tier export as `UNKNOWN`. Recorded restrictions on a label, reference, licence reference or digest suppress the field in every new pack, including packs produced without a separate manifest. The French summary uses « non inclus » for omitted access history.

To check a returned pack, supply the ledger revision it identifies, together with its manifest when one was used. The audit reconstructs the expected export and compares it with the returned fields. The custody review adapter also checks the ledger revision before creating source review proposals. Operator reports and APIs are described in `P15_SOURCE_REVIEW.md`.
