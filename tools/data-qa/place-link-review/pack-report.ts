import { local, publicationIssues, publicationLabels, type Language } from "./language.ts";
import type { PublicationAudit } from "./publication.ts";
import type { CellWorkPage } from "./cell-work.ts";

export function describePublication(audit: PublicationAudit, lang: Language): string[] {
  return [
    local(lang, publicationLabels[audit.status]),
    ...audit.issues.map(issue => local(lang, publicationIssues[issue])),
  ];
}
export function describeCellWork(work: CellWorkPage, lang: Language): string[] {
  const n = (value: number) => new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA").format(value);
  const unlocated = work.unlocated.restricted + work.unlocated.source + work.unlocated.unknown;
  if (lang === "fr") return [
    `${n(work.locatedCases)} dossiers concernent ${n(work.totalCells)} cellules de cache.`,
    `${n(work.crossCellCases)} dossiers concernent plusieurs cellules. Le décompte par cellule représente ${n(work.assignments)} affectations.`,
    `${n(unlocated)} dossiers sans cellule divulguée, dont ${n(work.unlocated.restricted)} à diffusion restreinte.`,
  ];
  return [
    `${n(work.locatedCases)} cases affect ${n(work.totalCells)} cache cells.`,
    `${n(work.crossCellCases)} cases span several cells. Counting once per affected cell gives ${n(work.assignments)} assignments.`,
    `${n(unlocated)} cases have no disclosed cell, including ${n(work.unlocated.restricted)} restricted cases.`,
  ];
}
