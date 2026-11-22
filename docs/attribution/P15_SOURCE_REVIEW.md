# Offline source review

## English

A source reviewer starts with a local catalogue and a review date. The source review compares captured bytes, licence, verification tier and dates with the selected catalogue revision. Results identify affected records and the reason for reviewing them. A change to a source can put a journey connection in the queue even when only one of its segments directly uses that source. Each record keeps its original accessibility value.

The offline tools run directly in Node 22.18 or later. The source review entry point is `p15al-cli.mjs`. It accepts a local registry, an explicit review input or a saved report. A registry input requires a review interval and date. Use the lead window to identify sources approaching their due date. A receipt batch can add dated local observations. A saved report can be replayed against its inputs or compared with another review. English and French summaries and machine-readable proposals are available.

The queue entry point is `p15am-cli.mts`. It reads one JSON request and returns one JSON result. The `open` operation accepts proposals, an opening timestamp and the available desks. Each desk has an opaque identifier, a capacity and a list of excluded sources. `plan` returns assignments for the current revision. A claim takes effect after `apply` accepts it. A submission needs another desk to confirm it. Returning or reopening a proposal records a reason. None of these operations changes a map record.

For a review backed by the custody ledger, `open-custody` takes two objects.

| Input | Contents |
|---|---|
| `input.review` | A source review input with a review date, source baselines, record links and optional existing captures in its captures array. |
| `input.ledger` | The local custody ledger. |
| `input.selection` | The expected ledger digest and the selected item IDs. |
| `setup` | The queue identifier, opening timestamp and desks. |

The selected items must be source captures for the specified baseline. A custodian can record `baselineHash(source)` as the item's source digest at intake. The content digest identifies the captured bytes. The selection receipt identifies the ledger revision and the exact evidence behind each new observation. A withheld fingerprint, a withdrawn capture or a stale selection stops intake. Missing legacy tiers remain `UNKNOWN`.

To transfer completed work between offline desks, export the events after the receiving desk’s last shared revision. The recipient supplies its local queue to `receive`. The importer checks the common history and replays the events. A second delivery of the same events is idempotent. Divergent histories remain available for comparison. `resume-custody` rechecks the review and the returned queue against independently supplied evidence and setup. SHA-256 checks establish content consistency. Desk tokens identify roles within the file.

## Français

La personne chargée du contrôle choisit un catalogue local et une date. Le contrôle compare les octets recueillis, la licence, le niveau de vérification et les dates avec la version retenue du catalogue. Le rapport indique les fiches concernées et le motif du contrôle. Si un segment dépend d’une source modifiée, la correspondance qui emploie ce segment peut aussi devoir être examinée. La valeur d’accessibilité de chaque fiche est conservée.

Les outils hors ligne fonctionnent directement avec Node 22.18 ou une version ultérieure. Le point d’entrée `p15al-cli.mjs` accepte un registre local, un dossier de contrôle ou un rapport enregistré. Pour un registre, indiquez la date du contrôle et l’intervalle de révision. Un lot de justificatifs peut ajouter des observations datées. Le rapport fournit un résumé en français ou en anglais ainsi que les propositions à traiter.

Le point d’entrée `p15am-cli.mts` lit une demande JSON et renvoie un résultat JSON. L’opération `open` reçoit les propositions, la date et l’heure d’ouverture, puis la liste des postes. Chaque poste a un identifiant, une capacité et une liste de sources exclues. L’opération `plan` propose une répartition. L’affectation est enregistrée lorsque `apply` accepte la demande. Un deuxième poste doit confirmer le travail soumis.

L’opération `open-custody` reçoit les objets `input` et `setup`. Le premier contient le dossier de contrôle, le registre de conservation et la sélection avec son empreinte attendue. Le second indique l’identifiant de la file, l’horodatage d’ouverture et les postes. Une capture retirée, une empreinte masquée ou une sélection périmée interrompt l’ouverture. Un niveau de vérification absent dans un ancien registre conserve la valeur « Inconnu ».

Pour transférer le travail, le poste émetteur exporte les événements consignés depuis la dernière version commune. Le poste destinataire fournit sa file locale à l’opération `receive`. Un second envoi identique conserve le même résultat. En cas de divergence, les deux historiques peuvent être comparés. L’opération `resume-custody` contrôle le dossier et la file à partir des éléments de preuve fournis séparément.
