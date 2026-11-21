export const UI=Object.freeze({
  en:Object.freeze({
    title:'Attribution evidence chain',intro:'Review how source records connect to files, displayed credits and review receipts.',
    safety:'These are locally supplied records. Matching SHA-256 values do not establish authorship, legal permission or accessible conditions.',
    back:'Sources and licences',language:'Language',import:'Import evidence chain JSON',compareImport:'Compare with earlier chain JSON',
    new:'Start a new chain',save:'Export chain JSON',text:'Export findings as text',html:'Export standalone report',
    matrix:'Export coverage table',repairs:'Export repair plan JSON',summary:'Export audit JSON',
    source:'Sources',asset:'Files and derived assets',surface:'Publication views',notice:'Displayed notices',receipt:'Review receipts',
    add:'Add record',edit:'Edit record',remove:'Remove record',cancel:'Cancel',saveRecord:'Save record',
    empty:'No records have been supplied.',selected:'Select a record',selectAsset:'Choose an asset to check',file:'Choose a local file',
    measure:'Calculate SHA-256 locally',measurement:'Measurement result',measuredHash:'Calculated hash',recordedHash:'Recorded hash',
    fileUnknown:'No file is selected.',fileDifferent:'Measured file differs from the recorded values.',fileMatch:'Recorded digest and size match the selected file.',
    fileIncomplete:'Recorded digest or size is UNKNOWN. No conclusion about matching is possible.',
    status:'Audit status',block:'Blocking gaps',caution:'Review items',info:'Information findings',
    findings:'Evidence gaps',noFindings:'No gaps in the supplied records. Human review remains necessary.',
    missingNotices:'Missing credit placements',missingReceipts:'Missing review receipts',paths:'Source-to-view paths',
    graph:'Provenance relationships',sourceImpact:'Source impact',viewCoverage:'View coverage',
    filters:'Filter findings',search:'Search by code or record path',all:'All findings',
    importOk:'The evidence chain was loaded into temporary memory.',importBad:'The file was rejected; the current work is unchanged.',
    compareOk:'The comparison is ready.',compareBad:'The earlier file could not be read.',
    noEarlier:'No earlier package selected.',change:'Recorded changes',regression:'Changes requiring attention',
    update:'Selection changed',unknown:'UNKNOWN',external:'External link',
    mode:'Entry mode',json:'JSON record editor',chooseCollection:'Record collection',recordJson:'Record JSON',
    note:'Only explicit evidence is displayed. UNKNOWN remains UNKNOWN.',
    showGraph:'Show source paths',chooseSource:'Select source',noSource:'Choose a source to see its dependencies.',
    confirmRemoval:'Remove this record from the working chain?',downloadFailed:'Download unavailable.',
    touch:'Touch target',focus:'Visible focus',keyboard:'Keyboard checks',screenReader:'Screen-reader checks'
  }),
  fr:Object.freeze({
    title:'Chaîne des preuves d’attribution',intro:'Examinez les liens entre les fiches sources, fichiers, mentions affichées et reçus d’examen.',
    safety:'Ces fiches sont fournies localement. Des valeurs SHA-256 identiques n’établissent ni la provenance, ni les droits juridiques, ni les conditions d’accessibilité.',
    back:'Sources et licences',language:'Langue',import:'Importer la chaîne des preuves JSON',compareImport:'Comparer avec une chaîne précédente JSON',
    new:'Commencer une nouvelle chaîne',save:'Exporter la chaîne JSON',text:'Exporter les constats en texte',html:'Exporter le rapport autonome',
    matrix:'Exporter le tableau de couverture',repairs:'Exporter le plan de correction JSON',summary:'Exporter le résumé JSON',
    source:'Sources',asset:'Fichiers et éléments dérivés',surface:'Vues de publication',notice:'Mentions affichées',receipt:'Reçus d’examen',
    add:'Ajouter une fiche',edit:'Modifier la fiche',remove:'Retirer la fiche',cancel:'Annuler',saveRecord:'Enregistrer la fiche',
    empty:'Aucune fiche n’a été fournie.',selected:'Choisir une fiche',selectAsset:'Choisir un fichier à contrôler',file:'Choisir un fichier local',
    measure:'Calculer SHA-256 localement',measurement:'Résultat de la mesure',measuredHash:'Empreinte calculée',recordedHash:'Empreinte consignée',
    fileUnknown:'Aucun fichier n’est sélectionné.',fileDifferent:'Le fichier mesuré diffère des valeurs consignées.',fileMatch:'L’empreinte et la taille correspondent aux valeurs consignées.',
    fileIncomplete:'L’empreinte ou la taille consignée est UNKNOWN. Aucune conclusion de correspondance n’est possible.',
    status:'État de l’examen',block:'Lacunes bloquantes',caution:'Points à examiner',info:'Constats informatifs',
    findings:'Lacunes dans les preuves',noFindings:'Aucune lacune dans les fiches fournies. Un examen humain reste nécessaire.',
    missingNotices:'Mentions de source manquantes',missingReceipts:'Reçus d’examen manquants',paths:'Chemins des sources aux vues',
    graph:'Liens de provenance',sourceImpact:'Incidence sur les sources',viewCoverage:'Couverture des vues',
    filters:'Filtrer les constats',search:'Chercher par code ou chemin de fiche',all:'Tous les constats',
    importOk:'La chaîne des preuves est chargée temporairement en mémoire.',importBad:'Le fichier a été rejeté ; le travail en cours est conservé.',
    compareOk:'La comparaison est prête.',compareBad:'Le fichier précédent ne peut pas être lu.',
    noEarlier:'Aucun dossier précédent sélectionné.',change:'Changements consignés',regression:'Changements à examiner',
    update:'Sélection modifiée',unknown:'UNKNOWN',external:'Lien externe',
    mode:'Mode de saisie',json:'Éditeur de fiche JSON',chooseCollection:'Collection de fiches',recordJson:'Fiche JSON',
    note:'Seules les preuves explicites sont affichées. UNKNOWN reste UNKNOWN.',
    showGraph:'Afficher les chemins des sources',chooseSource:'Choisir une source',noSource:'Choisissez une source pour voir les dépendances.',
    confirmRemoval:'Retirer cette fiche de la chaîne en cours\u202f?',downloadFailed:'Téléchargement indisponible.',
    touch:'Cible tactile',focus:'Indicateur de focus visible',keyboard:'Contrôles au clavier',screenReader:'Contrôles au lecteur d’écran'
  })
});
export function parseLanguage(search){
  if(typeof search!=='string'||search.length>512)return 'en';
  return new URLSearchParams(search).get('lang')==='fr'?'fr':'en';
}
export function labelValue(locale,label,value){return `${label}${locale==='fr'?'\u00a0: ':': '}${value}`;}
export function parityKeys(){
  const a=Object.keys(UI.en).sort(),b=Object.keys(UI.fr).sort();
  return a.length===b.length&&a.every((key,i)=>key===b[i]);
}
export function noForbiddenClaims(){return !/vérif|verify|real-time|partnership|guarantee/iu.test(JSON.stringify(UI));}
