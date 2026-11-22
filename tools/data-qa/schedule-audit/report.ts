import type { AuditReport, Status } from './audit.ts';
import { tripIssueText } from './trips.ts';

export type Language = 'en' | 'fr';
type Translation = readonly [string, string];

const descriptions: Readonly<Record<string, Translation>> = {
  ...tripIssueText,
  'selection.empty': ['No eligible source and region match this selection.', 'Aucune source et région admissibles ne correspondent à cette sélection.'],
  'manifest.shape': ['Expected a version 1 manifest with source and part lists.', 'Un manifeste de version 1 avec les listes des sources et des fichiers est requis.'],
  'manifest.limit': ['The manifest exceeds the supported entry limit.', 'Le manifeste dépasse le nombre maximal d’entrées pris en charge.'],
  'source.shape': ['The source declaration has invalid fields.', 'La déclaration de source contient des champs invalides.'],
  'source.duplicate': ['Multiple source declarations use the same identifier.', 'Plusieurs déclarations de source utilisent le même identifiant.'],
  'source.held': ['A withheld source was listed for distribution.', 'Une source suspendue figure dans les données à distribuer.'],
  'source.provenance': ['The source’s licence, retrieval date or verification tier is invalid.', 'La licence, la date de récupération ou le niveau de vérification de la source est invalide.'],
  'source.empty': ['The active source has no parts in the manifest.', 'La source active ne déclare aucun fichier dans le manifeste.'],
  'part.declaration': ['The part declaration is missing a required field or contains an invalid value.', 'La fiche du fichier est incomplète ou contient une valeur invalide.'],
  'part.path': ['The file location does not match its declared source, region or placement.', 'L’emplacement du fichier ne correspond pas à la source, à la région ou au mode de distribution déclaré.'],
  'part.provenance': ['The part’s provenance differs from its source declaration.', 'La provenance du fichier diffère de celle déclarée pour sa source.'],
  'part.duplicate': ['Two declarations refer to the same file location.', 'Deux déclarations désignent le même emplacement de fichier.'],
  'part.source': ['The part has no eligible source declaration.', 'Aucune déclaration de source admissible ne correspond au fichier.'],
  'part.coverage': ['The feed period has an unknown or invalid date.', 'La période du flux contient une date inconnue ou invalide.'],
  'group.calendar': ['A source and region must have exactly one calendar.', 'Chaque paire source-région doit avoir exactement un calendrier.'],
  'group.trips': ['This source and region have no trip part.', 'Aucun fichier de trajets ne correspond à cette source et à cette région.'],
  'group.sequence': ['Trip part numbers must start at zero and be consecutive.', 'Les numéros des fichiers de trajets doivent commencer à zéro et se suivre.'],
  'group.coverage': ['The parts declare different feed periods.', 'Les fichiers déclarent des périodes de couverture différentes.'],
  'file.missing': ['The declared local file was unavailable.', 'Le fichier local déclaré est introuvable.'],
  'file.unreadable': ['The local file could not be read.', 'La lecture du fichier local a échoué.'],
  'file.outside': ['The file cannot be resolved safely within its declared directory.', 'Le fichier ne peut pas être situé de façon sûre dans le répertoire déclaré.'],
  'file.type': ['The specified location must be a regular file.', 'L’emplacement indiqué doit désigner un fichier ordinaire.'],
  'file.size': ['The file length differs from its declared length or changed during reading.', 'La taille du fichier diffère de la valeur déclarée ou a changé pendant la lecture.'],
  'file.hash': ['The compressed bytes differ from the declared SHA-256 digest.', 'L’empreinte SHA-256 des données compressées diffère de celle déclarée.'],
  'file.gzip': ['The gzip data could not be decompressed.', 'La décompression des données gzip a échoué.'],
  'file.limit': ['The file exceeds a supported reading or decoding limit.', 'Le fichier dépasse une limite de lecture ou de décodage.'],
  'file.utf8': ['The file contains invalid UTF-8 text.', 'Le fichier contient du texte UTF-8 invalide.'],
  'file.json': ['The file does not contain valid JSON.', 'Le fichier contient des données JSON invalides.'],
  'file.ndjson': ['A trip line does not contain a valid JSON value.', 'Une ligne de trajet contient une valeur JSON invalide.'],
  CAL_SHAPE: ['A calendar table or record has an unexpected structure.', 'Une table ou une entrée du calendrier présente une structure inattendue.'],
  CAL_SOURCE: ['The calendar source does not match its declaration.', 'La source du calendrier diffère de celle déclarée.'],
  CAL_ID: ['A calendar identifier is missing or invalid.', 'Un identifiant du calendrier est absent ou invalide.'],
  CAL_NAME: ['A required name or route label is missing or invalid.', 'Un nom ou un libellé de ligne requis est absent ou invalide.'],
  CAL_DUPLICATE_ID: ['A calendar identifier occurs more than once.', 'Un identifiant du calendrier figure plusieurs fois.'],
  CAL_ROUTE_TYPE: ['The route type is invalid.', 'Le type de ligne est invalide.'],
  CAL_COORDINATE: ['The stop has an invalid coordinate.', 'Une coordonnée de l’arrêt est invalide.'],
  CAL_BOARDING: ['The stop boarding field contains an unrecognized value.', 'Le champ d’embarquement à l’arrêt contient une valeur non reconnue.'],
  CAL_DATE: ['A service date is invalid.', 'Une date de service est invalide.'],
  CAL_RANGE: ['The end date precedes the start date.', 'La date de fin précède la date de début.'],
  CAL_WEEKDAYS: ['The weekly rule needs seven day flags in Sunday-first order.', 'La règle hebdomadaire requiert sept indicateurs de jour en commençant par le dimanche.'],
  CAL_DUPLICATE_RULE: ['More than one weekly rule uses the same service identifier.', 'Plusieurs règles hebdomadaires portent le même identifiant de service.'],
  CAL_EXCEPTION_TYPE: ['The calendar exception must declare service added or removed.', 'L’exception au calendrier doit indiquer un ajout ou un retrait de service.'],
  CAL_DUPLICATE_EXCEPTION: ['An identical service exception occurs twice.', 'Une exception de service identique figure deux fois.'],
  CAL_CONFLICT_EXCEPTION: ['Exceptions for this service date disagree.', 'Les exceptions pour cette date de service se contredisent.'],
  CAL_UNKNOWN_COVERAGE: ['A boundary of the declared feed period is unknown.', 'Une limite de la période déclarée du flux est inconnue.'],
};

const statuses: Record<Status, Translation> = {
  clean: ['Checks passed', 'Vérifications réussies'],
  review: ['Review needed', 'Examen requis'],
  incomplete: ['Evidence incomplete', 'Données de vérification incomplètes'],
  invalid: ['Errors found', 'Erreurs détectées'],
};

function translated(pair: Translation, lang: Language): string {
  return pair[lang === 'fr' ? 1 : 0];
}

export function describeFinding(code: string, lang: Language): string {
  const entry = Object.hasOwn(descriptions, code) ? descriptions[code] : undefined;
  return translated(entry ?? ['Unrecognized finding.', 'Constat non reconnu.'], lang);
}

export function formatReport(report: AuditReport, lang: Language): string {
  const t = (en: string, fr: string) => lang === 'fr' ? fr : en;
  const label = (en: string, fr: string, value: string | number) =>
    t(en + ': ', fr + '\u00a0: ') + value;
  const lines = [
    t('Offline timetable audit', 'Vérification hors ligne des horaires'),
    label('Result', 'Résultat', translated(statuses[report.status], lang)),
    label('Files declared in the manifest', 'Fichiers déclarés dans le manifeste', report.manifest.declaredParts),
    label('Files selected', 'Fichiers sélectionnés', report.totals.selectedParts),
    label('Files decoded', 'Fichiers décodés', report.totals.decodedParts),
    label('Files missing', 'Fichiers manquants', report.totals.missingParts),
    label('Files that failed to decode or verify', 'Fichiers ayant échoué au décodage ou à la vérification', report.totals.invalidParts),
    label('Regional trip rows declared', 'Lignes de trajet régionales déclarées', report.totals.declaredTripRows),
    label('Regional rows decoded', 'Lignes régionales décodées', report.totals.decodedRows),
    label('Decoded trip objects with unknown wheelchair information', 'Objets de trajet décodés avec accès en fauteuil roulant inconnu', report.totals.unknownWheelchairTrips),
    label('Errors', 'Erreurs', report.findings.errors),
    label('Warnings', 'Avertissements', report.findings.warnings),
  ];
  if (report.groups.length) {
    lines.push('', t('Results by source and region', 'Résultats par source et région'));
    for (const group of report.groups) {
      const tier = group.provenance.verificationTier;
      lines.push(
        label('Source', 'Source', group.sourceId),
        label('Region', 'Région', group.regionId),
        label('Licence', 'Licence', group.provenance.licence),
        label('Retrieved on', 'Date de récupération', group.provenance.retrievedOn),
        label('Verification tier', 'Niveau de vérification', tier === 'UNKNOWN' ? t('Unknown', 'Inconnu') : tier),
        label('File and content checks', 'Vérification des fichiers et de leur contenu', translated(statuses[group.status], lang)),
      );
    }
  }
  if (report.findings.counts.length) {
    lines.push('', t('Findings by type', 'Constats par type'));
    for (const count of report.findings.counts) {
      const level = count.severity === 'error' ? t('Error', 'Erreur') : t('Warning', 'Avertissement');
      lines.push(level + ' (' + count.count + ') — ' + describeFinding(count.code, lang));
    }
  }
  if (report.findings.examples.length) {
    lines.push('', t('Example locations', 'Exemples d’emplacements'));
    for (const issue of report.findings.examples) lines.push(issue.at + ' — ' + describeFinding(issue.code, lang));
  }
  if (report.findings.omitted) lines.push(label('Additional locations', 'Autres emplacements', report.findings.omitted));
  return lines.join('\n') + '\n';
}
