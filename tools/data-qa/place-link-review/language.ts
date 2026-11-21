import type { SourceIssue } from "./provenance.ts";
import type { GroupKind, PairKind } from "./delta.ts";
import type { CaseState } from "./view.ts";

export type Language = "en" | "fr";
export type Words = readonly [english: string, french: string];
export function local(lang: Language, label: Words): string {
  return label[lang === "fr" ? 1 : 0];
}

export const stateNames = {
  open: ["Open", "À examiner"], "follow-up": ["Follow up", "À suivre"], reviewed: ["Reviewed", "Examiné"],
  stale: ["Earlier decision needs review", "Décision antérieure à réexaminer"],
  conflict: ["Decisions disagree", "Décisions contradictoires"], restricted: ["Restricted", "Diffusion restreinte"],
} satisfies Record<CaseState, Words>;

export const familyNames = {
  group: ["Group of records", "Groupe de fiches"], pair: ["Possible duplicate", "Doublon possible"],
  source: ["Source declaration", "Déclaration de source"],
} as const;
export const priorityNames = {
  rights: ["Source terms", "Conditions de la source"], identity: ["Grouping change", "Changement de regroupement"],
  declaration: ["Declaration change", "Changement de déclaration"],
} as const;

export const changeNames = {
  retained: ["Retained declaration", "Déclaration conservée"],
  added: ["Added to the candidate index", "Ajout dans l’index candidat"],
  absent: ["Absent from the candidate index", "Absence dans l’index candidat"],
  split: ["One group split", "Scission d’un groupe"],
  merged: ["Groups merged", "Fusion de groupes"],
  regrouped: ["Multiple groups reorganized", "Réorganisation de plusieurs groupes"],
  expanded: ["Group gained members", "Ajout de membres au groupe"],
  contracted: ["Group lost members", "Retrait de membres du groupe"],
  membership: ["Group membership changed", "Composition du groupe modifiée"],
  rekeyed: ["Group identifier changed", "Identifiant du groupe modifié"],
  metadata: ["Source or cell changed", "Source ou cellule modifiée"],
  evidence: ["Matching evidence changed", "Indices de correspondance modifiés"],
  promoted: ["Possible pair now grouped", "Doublon possible désormais regroupé"],
  demoted: ["Grouped records now listed as a possible pair", "Fiches regroupées désormais signalées comme doublon possible"],
  relationship: ["Group relationship changed", "Relation de groupe modifiée"],
  removed: ["Declaration removed", "Déclaration retirée"],
  held: ["Source placed on hold", "Diffusion de la source suspendue"],
  restored: ["Source admitted again", "Source de nouveau admise"],
  changed: ["Source declaration changed", "Déclaration de source modifiée"],
} satisfies Record<GroupKind | PairKind | "removed" | "held" | "restored" | "changed", Words>;

export const issueNames = {
  "missing-declaration": ["Source declaration missing", "Déclaration de source absente"],
  "duplicate-declaration": ["Multiple source declarations", "Déclarations de source multiples"],
  "excluded-source": ["Excluded source", "Source exclue"],
  "terms-held": ["Source terms on hold", "Conditions de la source en suspens"],
  "incomplete-name": ["Source name missing", "Nom de la source manquant"],
  "incomplete-licence": ["Licence incomplete", "Licence incomplète"],
  "invalid-source-url": ["Source address unusable", "Adresse de la source inutilisable"],
  "invalid-licence-url": ["Licence address unusable", "Adresse de la licence inutilisable"],
  "invalid-retrieval-date": ["Retrieval date unusable", "Date de récupération inutilisable"],
  "invalid-tier": ["Verification tier unusable", "Niveau de vérification inutilisable"],
  "incomplete-attribution": ["Attribution incomplete", "Mention de source incomplète"],
  "invalid-policy-notes": ["Review notes unusable", "Notes d’examen inutilisables"],
  "incorrect-osm-credit": ["Expected © OpenStreetMap contributors", "Mention attendue : © OpenStreetMap contributors"],
  "special-source-terms": ["Source-specific terms need review", "Conditions particulières de la source à examiner"],
  "invalid-kind": ["Source type unusable", "Type de source inutilisable"],
} satisfies Record<SourceIssue, Words>;

export const fieldNames: Record<string, Words> = {
  sourceId: ["Source ID", "Identifiant de source"], sourceName: ["Source name", "Nom de la source"],
  licence: ["Licence", "Licence"], licenceUrl: ["Licence address", "Adresse de la licence"],
  sourceUrl: ["Source address", "Adresse de la source"], attribution: ["Credit", "Mention de source"],
  retrievedOn: ["Retrieved on", "Date de récupération"], verificationTier: ["Verification tier", "Niveau de vérification"],
  status: ["Registry status", "État du registre"], issues: ["Registry findings", "Constats du registre"],
};
export const inputNames = {
  matches: ["Matches declared input digest", "Concordance avec l’empreinte d’entrée déclarée"],
  differs: ["Differs from the declared inputs", "Écart avec les entrées déclarées"],
  unavailable: ["Input comparison unavailable", "Comparaison des entrées indisponible"],
  unchecked: ["Input bytes uninspected", "Octets d’entrée non inspectés"],
} as const;

export const publicationLabels = {
  checked: ["Link files checked", "Fichiers de liens contrôlés"],
  withheld: ["Publication withheld", "Publication suspendue"],
  undeclared: ["No link section declared", "Aucune section de liens déclarée"],
  issues: ["Publication needs review", "Publication à examiner"],
} as const;

export const publicationIssues = {
  "manifest-unavailable": ["Manifest unavailable", "Manifeste indisponible"],
  "manifest-format": ["Manifest has an invalid structure", "Structure du manifeste non valide"],
  "index-identity": ["Manifest identifies a different link index", "Le manifeste désigne un autre index de liens"],
  "input-stale": ["Link inputs are out of date", "Les entrées des liens sont périmées"],
  inventory: ["Declared and staged inventories differ", "Écart entre l’inventaire déclaré et les fichiers préparés"],
  "unsafe-path": ["File path rejected", "Chemin de fichier refusé"],
  "cell-unavailable": ["Cell file unavailable", "Fichier de cellule indisponible"],
  size: ["File size differs from declaration", "Taille différente de celle déclarée"],
  digest: ["File SHA-256 differs from declaration", "Empreinte SHA-256 différente de celle déclarée"],
  compression: ["Compressed contents unusable", "Contenu compressé inutilisable"],
  "cell-format": ["Cell header or contents invalid", "En-tête ou contenu de cellule non valide"],
  "cell-count": ["Declaration counts differ", "Écart dans les nombres déclarés"],
  "source-held": ["Source is held or lacks admissible provenance", "Source en suspens ou de provenance insuffisante"],
  "source-terms": ["Source terms or attribution differ from the candidate registry", "Conditions ou mention de source différentes de celles du registre candidat"],
  "foreign-group": ["Group absent from source index", "Groupe absent de l’index source"],
  "foreign-pair": ["Pair absent from source index", "Paire absente de l’index source"],
  "foreign-member": ["Member conflicts with source declaration", "Membre incompatible avec la déclaration source"],
  duplicate: ["Declaration repeated in the same cell", "Déclaration répétée dans la même cellule"],
  evidence: ["Published matching evidence differs", "Écart dans les indices de correspondance publiés"],
  "mirror-missing": ["Expected cross-cell copy missing", "Copie attendue dans une autre cellule absente"],
  "mirror-conflict": ["Cross-cell copies disagree", "Les copies entre cellules divergent"],
} satisfies Record<import("./publication.ts").PublicationIssue, Words>;
