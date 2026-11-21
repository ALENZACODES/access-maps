# Offline review sessions

A coordinator can assign independent reviewers to individual source fields and collect their decisions without a network connection. Reviewers open their own HTML files in a browser, select a response and save a small JSON file. The coordinator imports the responses on the same computer that holds the review session.

## Coordinator workflow

The package entry point is `data-qa:session`. Its help lists the operations and their arguments. Each operation reads the source registry and the selected evidence again. Use `--registry` for the local maps registry. Use `--shard` and `--field` to review one field across a plain or gzipped NDJSON shard. For a curated batch, `--selections` accepts a JSON array whose members each contain a maps `record` and a `field` key. Each input file is limited to 16 MiB, including decompressed shards. A batch can contain up to 4,096 selected fields. The two JSON files in `fixtures/` form a complete synthetic practice input with one explicit Unknown and no location.

| Operation | Result |
| --- | --- |
| `intake` | Inspect the projected evidence and its provenance in stable case order. |
| `locate` | Find each case’s one-based row in the original selections or shard. Keep this index alongside its exact local input. |
| `prepare` | Start a new session. The generated policy has empty rosters and an unchecked conflict declaration for each case. |
| `plan` | Inspect suggested assignments, missing seats and reviewer loads. |
| `seal` | Lock a complete allocation and bind each case to the evidence, roles, exclusions and quorum. Keep a copy of this initial file. |
| `desk` | Generate the file for one assigned reviewer. Choose HTML for a keyboard-operable offline response form. |
| `submit` | Import a saved response into the current sealed session and produce the next complete session file. Repeating the same current response is safe. |
| `audit` | Inspect the effective outcome, current counts, evidence and ordered history. The HTML audit includes an independent ruling form when a case qualifies. |
| `merge` | Reconcile two coordinator copies against their exact common base. Independent replies survive. Conflicting edits to an actor’s history require coordinator review. |

After preparing a session, set the reviewer roster to objects such as `{"reviewerId":"r-001","capacity":3}`. Capacity includes locked assignments. Use separate aliases in `adjudicators`. Use at least two distinct voting reviewers per case. For each case, set `ownerId` when a reviewer supplied the evidence, list any other conflicted aliases in `excluded`, and set `conflictsChecked` after checking those relationships. Enter previously agreed assignments in `locked`. When the plan shows missing seats, adjust capacity or recruit another independent reviewer before sealing.

The default output is JSON on standard output. The `out` option creates a new file. For a desk or audit, choose `html` and either `en` or `fr`. Give each reviewer only their desk. Keep the sealed session and audit with the coordinator. The coordinator tracks who holds each alias outside these files. An alias identifies a response within a trusted handoff. A digest binds it to a session and a history. Neither proves the identity of the person who supplied it.

A reviewer can withdraw a vote and then submit a replacement from a fresh desk. A mixed vote remains disputed even when one side has a majority. An independent adjudicator can issue a ruling after quorum. The ruling closes the case for that evidence revision. If the source evidence changes, prepare a new session and retain the old audit separately.

## Evidence and interpretation

The tool supports selected OSM Ontario fields and supported TTC and Toronto municipal fields that use the Toronto open government licence. It matches the source identity, licence, attribution, retrieval date, verification tier and supported value vocabulary before displaying a value. The case reference and `locate` output let a reviewer consult the exact local row. Output omits free text, coordinates and contributor identifiers.

A ready decision advances work to the next review stage. The original source value, date and verification tier remain attached to the case. Explicit Unknown can complete review as Unknown. A source, licence, tier, derivation or value hold remains in force after any vote or ruling. The OSM attribution is © OpenStreetMap contributors.

## Séances de révision hors ligne

La personne qui coordonne la séance choisit les champs du registre local à examiner. L’opération `locate` associe chaque dossier à sa ligne dans le fichier source. La numérotation commence à 1. Les deux fichiers JSON de `fixtures/` permettent d’essayer le processus avec une donnée fictive inconnue, sans lieu réel. L’opération `prepare` crée un dossier de séance et des listes de rôles vides.

1. Attribuez un identifiant distinct à chaque personne et indiquez sa capacité de révision. Réservez une liste distincte aux personnes chargées de l’arbitrage. Pour chaque dossier, indiquez la personne qui a fourni la donnée, le cas échéant, et les autres personnes en conflit d’intérêts. Confirmez que vous avez vérifié ces liens.
2. Examinez les affectations avec `plan`. Chaque dossier exige au moins deux votes indépendants. Corrigez les places vacantes avant de figer les affectations avec `seal`. Conservez le fichier de départ.
3. Préparez un fichier HTML avec `desk` pour chaque personne affectée. Choisissez `fr` comme langue. Chaque personne ouvre son fichier hors ligne, consulte la provenance, sélectionne sa réponse et enregistre le fichier JSON à transmettre à la coordination.
4. Intégrez chaque réponse avec `submit`. Conservez le nouveau fichier de séance. Un vote peut être retiré, puis remplacé à partir d’une nouvelle fiche. L’opération `merge` rapproche deux copies de coordination à partir de leur version commune.
5. Consultez les décisions et leur historique avec `audit`. En cas de désaccord, la personne chargée de l’arbitrage peut trancher dès que le quorum est atteint. Conservez le journal avec la coordination. Chaque personne affectée reçoit seulement sa propre fiche.

Un dossier prêt peut passer à l’étape de révision suivante. Une valeur inconnue reste inconnue. Une mise en attente liée à la provenance reste en vigueur après le vote ou l’arbitrage. Si la donnée source change, créez une nouvelle séance. Les fichiers utilisent des identifiants locaux. La coordination vérifie séparément l’identité de la personne qui remet une réponse.
