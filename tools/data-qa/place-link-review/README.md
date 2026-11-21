# Offline place-link release review

A release folder contains the matcher’s `data/links/index.json`, its compressed link files, and `sources/registry.json`. Select that folder with `--candidate`. Adding `--previous` produces a comparison. A possible duplicate and a same-place group are distinct declarations. Neither establishes accessibility at a location.

- Use `--check-inputs` when the source partitions are available. The reviewer compares the exact compressed bytes to the matcher’s recorded input digest.
- Select a review case using its ID. `--inspect-members` checks the displayed window of records against the local partitions on each side. The result contains provenance and field counts. Place names, coordinates and field values stay in the source files.
- Use `--pack` with a generated `pack/v1` directory to check the candidate’s published link files and their copies across cells. A publisher may legitimately omit a member whose source record was withheld.
- An HTML report opens offline. Search and filter the displayed page, review the source declarations, then export the selected decisions. Import decision files with `--decisions`. A changed fingerprint or conflicting decisions requires another review. A source restriction always takes precedence.
- The case count is per change. The cell workload counts the change once for each affected cell. Cell pages cover the whole comparison independently of case pages. The JSON contains precise totals for each window.

# Examen hors ligne des liens entre fiches de lieux

Un dossier de version contient l’index `data/links/index.json`, ses fichiers de liens compressés et le registre `sources/registry.json`. Sélectionnez ce dossier avec `--candidate`. Ajoutez `--previous` pour comparer deux versions. Un doublon possible et un groupe de fiches désignant un même lieu sont deux déclarations distinctes. L’accessibilité du lieu demeure inconnue.

- Si les partitions sources sont disponibles, `--check-inputs` compare les octets compressés à l’empreinte enregistrée par le programme de correspondance.
- Sélectionnez un dossier d’examen par son identifiant. Avec `--inspect-members`, le contrôle porte sur la fenêtre de fiches affichée pour chaque version. Le résultat présente la provenance et le décompte des champs. Les noms de lieux, les coordonnées et les valeurs restent dans les fichiers sources.
- L’option `--pack` accepte un répertoire `pack/v1` généré. Elle contrôle les liens publiés et leurs copies entre cellules. La publication peut omettre un membre dont la fiche source a été retirée.
- Le rapport HTML s’ouvre hors ligne. Recherchez et filtrez les dossiers de la page, examinez les déclarations de source et exportez les décisions sélectionnées. Importez les fichiers avec `--decisions`. Une empreinte modifiée ou des décisions contradictoires demandent un nouvel examen. Une restriction de diffusion reste prioritaire.
- Le décompte des dossiers porte sur les changements. La charge par cellule compte chaque changement une fois par cellule concernée. Les pages de cellules couvrent la comparaison entière, indépendamment des pages de dossiers. Le JSON donne les totaux de chaque fenêtre.
