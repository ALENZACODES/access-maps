/** Page copy only: never a second catalogue of provider licences or notices. */
export const RECEIPT_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Source receipts', subtitle: 'A local record of the source information shown for a publication surface.',
    app: 'the App', skip: 'Skip to main content', language: 'Language', choose: 'Choose a language',
    back: 'Sources and licences', provenance: 'Dataset provenance', publication: 'Publication surfaces',
    impact: 'Change review', select: 'Choose a surface', package: 'Import release package',
    packageHelp: 'Choose a local JSON release package containing an inventory and publication register. Nothing is uploaded.',
    browse: 'Choose JSON file', size: 'File size limit: 2 MiB', loaded: 'Release package loaded.',
    invalid: 'The file could not be read as a release package.', empty: 'No release package has been selected.',
    noSurfaces: 'This package contains no publication surfaces.', held: 'On hold', ready: 'No blocking receipt findings',
    blocked: 'Receipt has blocking findings', titleLabel: 'Surface', route: 'Route',
    dataset: 'Dataset', source: 'Source', licence: 'Licence', terms: 'Terms',
    acquired: 'Acquired on', asOf: 'Data as of', reviewed: 'Terms reviewed on',
    permission: 'Redistribution permission', status: 'Record status', delivery: 'Delivery',
    keyboard: 'Keyboard assessment', screenReader: 'Screen reader assessment', target: 'Minimum target size',
    credits: 'Displayed credits', notices: 'Displayed notices', providerNotices: 'Provider notices',
    sourceLink: 'View source', licenceLink: 'View licence', unknown: 'UNKNOWN',
    unknownHelp: 'UNKNOWN means that the supplied record does not establish this value.',
    audit: 'Receipt findings', noFindings: 'No receipt findings for the supplied data.',
    errors: 'Blocking findings', warnings: 'Warnings', info: 'Information',
    exportJson: 'Save receipt JSON', exportText: 'Save receipt text', exportAudit: 'Save findings',
    print: 'Print receipt', clear: 'Clear imported package', details: 'Receipt details',
    noData: 'No sources are linked to this surface.', accessibility: 'Documented access fields',
    accessHelp: 'These fields describe supplied assessment records. They are not observations of current conditions.',
    disclaimer: 'A source receipt does not establish accessibility, accuracy, freshness or redistribution rights. Review the underlying terms before publication.',
    offline: 'Local-only, usable offline when the page files have been saved together.',
    external: 'External website opens only when selected', fileError: 'Could not save this file.',
    evidence: 'Evidence is taken only from the imported package.', rejected: 'Unsupported language was ignored.',
    summary: 'Summary', sourceCount: 'Linked datasets', unknownDates: 'Unknown dataset dates',
    invalidLink: 'Link unavailable', none: 'No surface selected',
    imported: 'Imported file', heldHelp: 'The publication surface is held or excluded in the supplied register.',
    on: 'Included', off: 'Excluded', focus: 'Return to surface selection',
  }),
  fr: Object.freeze({
    title: 'Reçus des sources', subtitle: 'Un relevé local des sources présentées pour une surface publiée.',
    app: 'l’App', skip: 'Aller au contenu principal', language: 'Langue', choose: 'Choisir une langue',
    back: 'Sources et licences', provenance: 'Provenance des données', publication: 'Surfaces publiées',
    impact: 'Examen des changements', select: 'Choisir une surface', package: 'Importer le dossier de publication',
    packageHelp: 'Choisissez un fichier JSON local contenant l’inventaire et le registre des surfaces. Aucun transfert n’est effectué.',
    browse: 'Choisir un fichier JSON', size: 'Taille limite du fichier : 2 Mio', loaded: 'Dossier de publication chargé.',
    invalid: 'Le fichier ne peut pas être lu comme dossier de publication.', empty: 'Aucun dossier de publication choisi.',
    noSurfaces: 'Ce dossier ne contient aucune surface publiée.', held: 'En attente', ready: 'Aucune lacune bloquante relevée',
    blocked: 'Le reçu présente des lacunes bloquantes', titleLabel: 'Surface', route: 'Parcours',
    dataset: 'Jeu de données', source: 'Source', licence: 'Licence', terms: 'Conditions',
    acquired: 'Acquis le', asOf: 'Données en date du', reviewed: 'Conditions consultées le',
    permission: 'Permission de redistribution', status: 'Statut de l’enregistrement', delivery: 'Distribution',
    keyboard: 'Évaluation au clavier', screenReader: 'Évaluation au lecteur d’écran', target: 'Taille minimale des cibles',
    credits: 'Crédits affichés', notices: 'Mentions affichées', providerNotices: 'Mentions des fournisseurs',
    sourceLink: 'Consulter la source', licenceLink: 'Consulter la licence', unknown: 'UNKNOWN',
    unknownHelp: 'UNKNOWN signifie que le dossier fourni ne permet pas d’établir cette valeur.',
    audit: 'Constats du reçu', noFindings: 'Aucun constat pour les données fournies.',
    errors: 'Constats bloquants', warnings: 'Avertissements', info: 'Informations',
    exportJson: 'Enregistrer le reçu JSON', exportText: 'Enregistrer le reçu texte', exportAudit: 'Enregistrer les constats',
    print: 'Imprimer le reçu', clear: 'Effacer le dossier importé', details: 'Détails du reçu',
    noData: 'Aucune source n’est liée à cette surface.', accessibility: 'Champs d’accès documentés',
    accessHelp: 'Ces champs décrivent les évaluations fournies. Ils ne représentent pas des observations des conditions actuelles.',
    disclaimer: 'Un reçu de sources n’établit ni l’accessibilité, ni l’exactitude, ni l’actualité, ni les droits de redistribution. Consultez les conditions applicables avant publication.',
    offline: 'Fonctionnement local, possible hors ligne lorsque tous les fichiers sont enregistrés ensemble.',
    external: 'Le site externe s’ouvre uniquement sur demande', fileError: 'Impossible d’enregistrer ce fichier.',
    evidence: 'Les renseignements proviennent uniquement du dossier importé.', rejected: 'Langue non prise en charge ignorée.',
    summary: 'Résumé', sourceCount: 'Jeux de données liés', unknownDates: 'Dates des données UNKNOWN',
    invalidLink: 'Lien indisponible', none: 'Aucune surface choisie',
    imported: 'Fichier importé', heldHelp: 'La surface publiée est en attente ou exclue dans le registre fourni.',
    on: 'Inclus', off: 'Exclu', focus: 'Revenir au choix de la surface',
  }),
});

export function receiptLocale(input) {
  return typeof input === 'string' && input.toLowerCase().split(/[-_]/u)[0] === 'fr' ? 'fr' : 'en';
}
export function receiptCopy(locale) { return RECEIPT_COPY[receiptLocale(locale)]; }
export function receiptCodes(locale, findings, rules) {
  const t = receiptCopy(locale);
  return findings.map((finding) => ({
    ...finding,
    // Rule identifiers remain stable across locales; concise description is
    // operator-facing detail, not a substitute for the original evidence.
    label: rules[finding.code] ?? finding.code,
    level: finding.severity === 'error' ? t.errors : finding.severity === 'warning' ? t.warnings : t.info,
  }));
}
