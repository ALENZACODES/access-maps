/** UI translations only. Publisher credits always display literally. */
export const COPY=Object.freeze({
 en:Object.freeze({
 title:'Local source file integrity',intro:'Compare locally selected source files with an explicit attribution manifest. The App does not infer licence rights, dates or access conditions.',
 language:'Language',back:'Sources and licences',warning:'A recorded file digest is evidence of matching bytes only. It does not establish permission, dataset currency or accessibility.',
 import:'Import register JSON',baseline:'Compare with earlier register',export:'Export register JSON',exportText:'Export findings as text',exportMatrix:'Export coverage table (TSV)',
 exportHtml:'Export accessible review page',download:'Download',source:'Source',asset:'Asset',check:'Notice observation',measurement:'File measurement',
 addSource:'Add source',addAsset:'Add asset',addCheck:'Add observation',addMeasurement:'Add measurement',edit:'Edit',remove:'Remove',save:'Save record',cancel:'Cancel',
 sourceId:'Source ID',name:'Origin name',sourceUrl:'Source HTTPS address',licence:'Licence or terms',licenceUrl:'Licence HTTPS address',retrievedOn:'Retrieved on',tier:'Evidence tier',credit:'Recorded credit',permission:'Distribution permission',
 assetId:'Asset ID',label:'Asset label',fileName:'Local file name',kind:'File type',sourceIds:'Source IDs, separated by commas',sha256:'Expected SHA-256 digest',byteLength:'Expected file size in bytes',status:'Publication state',route:'Local publication route',
 checkId:'Observation ID',method:'Interaction method',noticeText:'Displayed notice text',placement:'Notice location',observedOn:'Observed on',creditPresent:'Credit observed',licenceShown:'Licence information observed',focusVisible:'Visible keyboard focus',targetPx:'Smallest touch target in CSS pixels',evidence:'Observation reference or note',
 measurementId:'Measurement ID',checkedOn:'Measured on',notes:'Notes',measure:'Measure local file',chooseAsset:'Asset to measure',file:'Choose file',measureAction:'Calculate SHA-256',
 calculated:'Local file digest calculated.',notStored:'Measurement is not retained until you choose to add it.',pending:'No file measurement selected.',recordMeasurement:'Record measured values',
 hashMatch:'Digest matches the recorded manifest.',hashMismatch:'Digest differs from the recorded manifest.',hashUnknown:'Manifest digest or length is UNKNOWN.',
 gaps:'Evidence gaps',filter:'Filter by asset',all:'All assets',none:'No records to display.',noGaps:'No blocking gaps in supplied records. Manual review is still necessary.',missing:'Missing observations',
 compare:'Comparison',introduced:'New findings',resolved:'Findings no longer recorded',regressions:'Changed or missing evidence',impact:'Source impact',selectSource:'Source to inspect',
 importOk:'Local register imported.',invalid:'The file was not accepted. Existing work is unchanged.',saved:'Record saved.',removed:'Record removed.',empty:'Opened a blank local register.',clear:'Start a blank register',
 confirmation:'Replace the current in-memory register?',fileTooLarge:'The file is too large.',error:'The action could not be completed.',
 unknown:'UNKNOWN',statusBlocked:'Evidence gaps block this release review.',statusReview:'Recorded evidence has no blocking gaps; a manual review is still needed.',
 privacy:'Files are processed locally and are not uploaded. Only digests and metadata are exported when you choose an export.',
 contents:'Records',actions:'Page actions',footer:'No source, licence, retrieval date or observation is filled in from a publisher name.',
 }),
 fr:Object.freeze({
 title:'Intégrité locale des fichiers sources',intro:'Comparez des fichiers choisis sur cet appareil avec un registre explicite des mentions. L’App ne déduit ni les droits de licence, ni les dates, ni les conditions d’accès.',
 language:'Langue',back:'Sources et licences',warning:'Une empreinte identique indique seulement que les octets correspondent. Elle ne démontre ni une autorisation, ni l’actualité des données, ni l’accessibilité.',
 import:'Importer le registre JSON',baseline:'Comparer avec un registre antérieur',export:'Exporter le registre JSON',exportText:'Exporter les écarts en texte',exportMatrix:'Exporter le tableau de couverture (TSV)',
 exportHtml:'Exporter la page de revue accessible',download:'Télécharger',source:'Source',asset:'Fichier',check:'Observation des mentions',measurement:'Mesure du fichier',
 addSource:'Ajouter une source',addAsset:'Ajouter un fichier',addCheck:'Ajouter une observation',addMeasurement:'Ajouter une mesure',edit:'Modifier',remove:'Retirer',save:'Enregistrer la fiche',cancel:'Annuler',
 sourceId:'ID de la source',name:'Nom de l’origine',sourceUrl:'Adresse HTTPS de la source',licence:'Licence ou conditions',licenceUrl:'Adresse HTTPS de la licence',retrievedOn:'Récupération le',tier:'Niveau de preuve',credit:'Mention consignée',permission:'Autorisation de diffusion',
 assetId:'ID du fichier',label:'Nom du fichier',fileName:'Nom local du fichier',kind:'Type de fichier',sourceIds:'ID des sources, séparés par des virgules',sha256:'Empreinte SHA-256 attendue',byteLength:'Taille attendue en octets',status:'État de publication',route:'Chemin local de publication',
 checkId:'ID de l’observation',method:'Méthode d’interaction',noticeText:'Texte exact de la mention affichée',placement:'Emplacement de la mention',observedOn:'Observation le',creditPresent:'Mention constatée',licenceShown:'Renseignements sur la licence constatés',focusVisible:'Focus clavier visible',targetPx:'Plus petite cible tactile en pixels CSS',evidence:'Référence ou note de l’observation',
 measurementId:'ID de la mesure',checkedOn:'Mesurée le',notes:'Notes',measure:'Mesurer un fichier local',chooseAsset:'Fichier à mesurer',file:'Choisir un fichier',measureAction:'Calculer SHA-256',
 calculated:'Empreinte locale calculée.',notStored:'La mesure n’est pas conservée avant son ajout explicite.',pending:'Aucune mesure sélectionnée.',recordMeasurement:'Consigner les valeurs calculées',
 hashMatch:'L’empreinte correspond au registre.',hashMismatch:'L’empreinte diffère du registre.',hashUnknown:'L’empreinte ou la taille attendue est UNKNOWN.',
 gaps:'Lacunes dans les preuves',filter:'Filtrer par fichier',all:'Tous les fichiers',none:'Aucune fiche à afficher.',noGaps:'Aucune lacune bloquante dans les données fournies. Une revue humaine reste nécessaire.',missing:'Observations manquantes',
 compare:'Comparaison',introduced:'Nouveaux écarts',resolved:'Écarts qui ne sont plus consignés',regressions:'Preuves modifiées ou manquantes',impact:'Effets par source',selectSource:'Source à examiner',
 importOk:'Registre local importé.',invalid:'Le fichier a été refusé. Le travail en cours est conservé.',saved:'Fiche enregistrée.',removed:'Fiche retirée.',empty:'Registre local vide ouvert.',clear:'Commencer un registre vide',
 confirmation:'Remplacer le registre en mémoire actuel ?',fileTooLarge:'Le fichier est trop volumineux.',error:'Impossible de terminer l’action.',
 unknown:'UNKNOWN',statusBlocked:'Les lacunes empêchent l’examen de cette publication.',statusReview:'Aucune lacune bloquante dans les preuves consignées ; une revue humaine reste nécessaire.',
 privacy:'Les fichiers sont traités localement et ne sont pas téléversés. Seules les empreintes et les métadonnées sont exportées sur demande.',
 contents:'Fiches',actions:'Actions de la page',footer:'Aucune source, licence, date de récupération ou observation n’est déduite d’un nom de fournisseur.',
 }),
});
export const FIELDS=Object.freeze({
 sources:['id','name','sourceUrl','licence','licenceUrl','retrievedOn','tier','credit','permission'],
 assets:['id','label','fileName','kind','sourceIds','sha256','byteLength','status','route'],
 checks:['id','assetId','sourceId','method','noticeText','placement','observedOn','creditPresent','licenceShown','focusVisible','targetPx','evidence'],
 measurements:['id','assetId','sha256','byteLength','checkedOn','notes'],
});
export const LABELS=Object.freeze({en:Object.freeze({id:'ID',fileName:'File name',assetId:'Asset ID',sourceId:'Source ID',checkedOn:'Measured on',notes:'Notes',...COPY.en}),fr:Object.freeze({id:'ID',fileName:'Nom du fichier',assetId:'ID du fichier',sourceId:'ID de la source',checkedOn:'Mesurée le',notes:'Notes',...COPY.fr})});
export function label(locale,key) {return LABELS[locale==='fr'?'fr':'en'][key]??key;}
export function labelled(locale,key,value) {return `${label(locale,key)}${locale==='fr'?'\u00a0:':':'} ${value}`;}
export function messages(locale) {return COPY[locale==='fr'?'fr':'en'];}
