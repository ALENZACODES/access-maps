import { describeCellWork, describePublication } from "./pack-report.ts";
import { publicationLabels, publicationIssues } from "./language.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SourceEvidence } from "./provenance.ts";
import type { Citation, Inventory, Location } from "./review.ts";
import type { MemberInspection } from "./members.ts";
import { type CasePage, type ReviewPage, STATES } from "./view.ts";
import {
  type Language, type Words, changeNames, familyNames, fieldNames, inputNames,
  issueNames, local, priorityNames, stateNames,
} from "./language.ts";

type Localize = (english: string, french: string) => string;
const t = (lang: Language): Localize => (en, fr) => lang === "en" ? en : fr;
const html = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const title: Words = ["Place-link release review", "Examen des liens entre fiches de lieux"];
const reviewName = (key: string, lang: Language) => {
  const label = (changeNames as Record<string, Words>)[key];
  return label ? local(lang, label) : key;
};
function numberLabel(value: number, lang: Language): string {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : "fr-CA").format(value);
}
function facts(rows: ReadonlyArray<readonly [string, string]>): string {
  return `<dl>${rows.map(([key, value]) =>
    `<div><dt>${html(key)}</dt><dd>${html(value)}</dd></div>`).join("")}</dl>`;
}
function releaseFacts(item: Inventory, lang: Language): Array<[string, string]> {
  const l = t(lang);
  const number = (n: number) => numberLabel(n, lang);
  const rows: Array<[string, string]> = [
    [l("Matching method", "Méthode de correspondance"), item.method],
    [l("Published groups", "Groupes publiés"), number(item.groups)],
    [l("Records in groups", "Fiches regroupées"), number(item.groupedMembers)],
    [l("Possible pairs", "Doublons possibles"), number(item.possiblePairs)],
    [l("Cells represented", "Cellules représentées"), number(item.cells)],
    [l("Skipped matcher inputs", "Entrées ignorées par le programme de correspondance"), number(item.skippedInputs)],
    [l("Declared input SHA-256", "Empreinte SHA-256 des entrées déclarées"), item.inputDigest],
    [l("Local input check", "Contrôle des entrées locales"), local(lang, inputNames[item.inputs?.status ?? "unchecked"])],
  ];
  if (item.inputs) {
    rows.push(
      [l("Input files inspected", "Fichiers d’entrée inspectés"), number(item.inputs.files)],
      [l("Input bytes inspected", "Octets d’entrée inspectés"), number(item.inputs.bytes)],
    );
    if (item.inputs.observedDigest)
      rows.push([l("Observed input SHA-256", "Empreinte SHA-256 des entrées observées"), item.inputs.observedDigest]);
  }
  return rows;
}
function sourceFacts(item: SourceEvidence | null, lang: Language): Array<[string, string]> {
  const l = t(lang);
  if (!item) return [[l("Declaration", "Déclaration"), l("Unavailable", "Indisponible")]];
  const unknown = l("Unknown", "Inconnu");
  const fields: Array<[string, string]> = [
    [l("Source ID", "Identifiant de source"), item.sourceId],
    [l("Source name", "Nom de la source"), item.sourceName ?? unknown],
    [l("Licence", "Licence"), item.licence ?? unknown],
    [l("Licence address", "Adresse de la licence"), item.licenceUrl ?? unknown],
    [l("Source address", "Adresse de la source"), item.sourceUrl ?? unknown],
    [l("Credit", "Mention de source"), item.attribution ?? unknown],
    [l("Retrieved on", "Date de récupération"), item.retrievedOn ?? unknown],
    [l("Verification tier", "Niveau de vérification"), item.verificationTier === null ? unknown : String(item.verificationTier)],
    [l("Registry status", "État du registre"), item.status === "included"
      ? l("Registry checks passed", "Contrôles du registre réussis") : item.status === "held"
        ? l("On hold", "En suspens") : unknown],
  ];
  if (item.issues.length) fields.push([l("Registry findings", "Constats du registre"),
    item.issues.map(issue => local(lang, issueNames[issue])).join(" · ")]);
  return fields;
}
function sourceItem(citation: Citation, lang: Language, comparison: boolean): string {
  const l = t(lang);
  const previous = comparison ? `<section><h4>${l("Previous", "Version précédente")}</h4>${facts(sourceFacts(citation.previous, lang))}</section>` : "";
  return `<li><details><summary>${html(citation.sourceId)}</summary><div class="columns">${previous}
<section><h4>${l("Candidate", "Version candidate")}</h4>${facts(sourceFacts(citation.candidate, lang))}</section></div></details></li>`;
}
function location(value: Location | null, lang: Language): string {
  const l = t(lang);
  if (!value) return l("No declaration", "Aucune déclaration");
  const group = value.groupId ?? l("Outside a declared group", "Hors d’un groupe déclaré");
  return [value.sourceId, value.cell, group].join(" · ");
}
function members(row: CasePage, lang: Language): string {
  const l = t(lang);
  if (row.restricted) return `<p>${l(
    "Source terms or missing citations restrict disclosure of the record identifiers.",
    "Les conditions de la source ou des références manquantes limitent la diffusion des identifiants de fiches.")}</p>`;
  if (row.memberCount === 0) return "";
  const start = row.memberOffset + 1;
  const end = row.memberOffset + row.members.length;
  const list = row.members.map(m => `<li><bdi>${html(m.tranche)} · ${html(m.id)}</bdi>
${facts([[l("Previous", "Version précédente"), location(m.previous, lang)],
    [l("Candidate", "Version candidate"), location(m.candidate, lang)]])}</li>`).join("");
  return `<h4>${l("Record declarations", "Déclarations de fiches")}</h4>
<p>${l(`Showing ${start}–${end} of ${row.memberCount} records.`, `Fiches ${start} à ${end} sur ${row.memberCount}.`)}</p>
<ul class="members">${list}</ul>`;
}
function evidenceRows(row: CasePage, lang: Language): Array<[string,string]> {
  const summary = row.matchingEvidence;
  if (!summary) return [];
  const l = t(lang);
  const rows: Array<[string,string]> = [];
  for (const side of ["previous","candidate"] as const) {
    const label = side === "previous" ? l("Previous evidence","Indices précédents") : l("Candidate evidence","Indices candidats");
    const item = summary[side];
    if (item.possibleDigest) rows.push([label + " · " + l("possible pair","doublon possible"),item.possibleDigest]);
    for (const group of item.groups) {
      rows.push([label + " · " + group.id,group.digest ?? l("Unknown","Inconnu")]);
    }
  }
  if (row.family === "group") {
    if (!summary.edges) {
      rows.push([l("Compared evidence edges","Comparaison des liens justificatifs"),
        l("Unavailable for this declaration","Indisponible pour cette déclaration")]);
    } else {
      rows.push(
        [l("Supporting links retained","Liens justificatifs conservés"),String(summary.edges.unchanged)],
        [l("Supporting links added","Liens justificatifs ajoutés"),String(summary.edges.added)],
        [l("Supporting links absent from candidate","Liens justificatifs absents de la version candidate"),String(summary.edges.absent)],
        [l("Supporting links with changed evidence","Liens justificatifs dont les indices ont changé"),String(summary.edges.changed)],
      );
    }
  }
  return rows;
}

function caseItem(row: CasePage, lang: Language): string {
  const l = t(lang);
  const label = reviewName(row.kind, lang);
  const details: Array<[string,string]> = [
    [l("Review ID", "Identifiant d’examen"), row.id],
    [l("Evidence fingerprint", "Empreinte des éléments examinés"), row.fingerprint],
    [l("Review priority", "Priorité d’examen"), local(lang, priorityNames[row.priority])],
    [l("Sources", "Sources"), row.citations.map(c => c.sourceId).join(", ")],
  ];
  if (row.family !== "source") {
    details.push([l("Groups before / after", "Groupes avant / après"), `${row.previousGroups} / ${row.candidateGroups}`]);
  }
  if (row.fields.length)
    details.push([l("Changed source fields", "Champs de source modifiés"), row.fields.map(
      field => fieldNames[field] ? local(lang, fieldNames[field]!) : field).join(", ")]);
  details.push(...evidenceRows(row,lang));
  const selectId = "decision-" + row.id;
  const editable = row.restricted ? "" : `<div class="decision"><label for="${selectId}">${l("Review decision", "Décision d’examen")}</label>
<select data-decision id="${selectId}">${row.state === "stale" || row.state === "conflict"
    ? `<option value="" disabled selected>${l("Choose a decision","Choisir une décision")}</option>` : ""}${(["open","follow-up","reviewed"] as const).map(state =>
    `<option value="${state}"${state === row.state ? " selected" : ""}>${local(lang,stateNames[state])}</option>`).join("")}</select></div>`;
  const search = [row.id, row.family, local(lang,familyNames[row.family]), label, ...row.cells,
    ...row.citations.map(c => c.sourceId), ...row.members.map(m => m.id)].join(" ");
  return `<li><details data-case="${row.id}" data-fingerprint="${row.fingerprint}" data-state="${row.state}" data-search="${html(search)}">
<summary><strong>${local(lang,familyNames[row.family])}</strong> · ${html(label)} · <span data-state-label>${local(lang,stateNames[row.state])}</span></summary>
<div class="inside">${facts(details)}${members(row,lang)}${editable}</div></details></li>`;
}
const inspections = {
  matched: ["Record located", "Fiche trouvée"], absent: ["Record absent from inspected partitions", "Fiche absente des partitions inspectées"],
  duplicate: ["Repeated record ID", "Identifiant de fiche en double"], mismatch: ["Provenance or partition mismatch", "Écart de provenance ou de partition"],
  unavailable: ["Inspection unavailable", "Inspection indisponible"], restricted: ["Disclosure restricted", "Diffusion restreinte"],
} as const;
function inspectItem(row: MemberInspection, lang: Language): string {
  const l = t(lang);
  const unknown = l("Unknown", "Inconnu");
  const entries: Array<[string,string]> = [
    [l("Record", "Fiche"), row.member?.id ?? unknown], [l("Source", "Source"), row.sourceId],
    [l("Licence", "Licence"), row.licence ?? unknown], [l("Retrieved on","Date de récupération"), row.retrievedOn ?? unknown],
    [l("Verification tier", "Niveau de vérification"), String(row.verificationTier ?? unknown)],
    [l("Partition check", "Contrôle des partitions"), local(lang, inspections[row.status])],
    [l("Partitions read", "Partitions lues"), String(row.partsRead)],
    [l("Matching rows", "Lignes correspondantes"), String(row.matchingRows ?? unknown)],
  ];
  if (row.fields) entries.push(
    [l("Fields inspected", "Champs inspectés"), String(row.fields.total)],
    [l("Fields marked unknown", "Champs de valeur inconnue"), String(row.fields.unknown)],
    [l("Missing fields or values", "Champs ou valeurs manquants"), String(row.fields.missing)],
    [l("Fields with unusable provenance", "Champs de provenance inutilisable"), String(row.fields.invalidProvenance)],
  );
  return `<li>${facts(entries)}</li>`;
}
function inspectSection(page: ReviewPage, lang: Language): string {
  if (!page.inspection) return "";
  const l = t(lang);
  const side = (label: string, rows: MemberInspection[]) => `<section><h3>${label}</h3>${rows.length
    ? `<ul>${rows.map(row => inspectItem(row, lang)).join("")}</ul>`
    : `<p>${l("No disclosed record in this window.", "Aucune fiche divulguée dans cette fenêtre.")}</p>`}</section>`;
  return `<section><h2>${l("Local record inspection", "Inspection des fiches locales")}</h2><div class="columns">
${side(l("Previous","Version précédente"),page.inspection.previous)}${side(l("Candidate","Version candidate"),page.inspection.candidate)}</div></section>`;
}
function metadataCounts(page: ReviewPage, lang: Language): string {
  const l = t(lang);
  if (!page.groupCounts || !page.pairCounts) return "";
  const totals = (counts: Record<string,number>) => facts(Object.entries(counts)
    .filter(([,count]) => count > 0).map(([name,value]) => [reviewName(name,lang),numberLabel(value,lang)]));
  return `<details class="block"><summary>${l("Counts by type of change", "Nombre de changements par type")}</summary>
<div class="columns"><section><h3>${l("Group comparisons", "Comparaisons de groupes")}</h3>${totals(page.groupCounts)}</section>
<section><h3>${l("Possible pair comparisons", "Comparaisons de doublons possibles")}</h3>${totals(page.pairCounts)}</section></div></details>`;
}
function packSection(page: ReviewPage, lang: Language): string {
  if (!page.publication) return "";
  const l = t(lang);
  const audit = page.publication.audit;
  const list = audit.cells.map(cell => {
    const notes = cell.issues.map(issue => local(lang,publicationIssues[issue]));
    const sourceIds = cell.sourceIds.join(", ") || l("No disclosable sources", "Aucune source divulguable");
    const rows: Array<[string,string]> = [
      [l("Published groups","Groupes publiés"),String(cell.groups)],
      [l("Possible pairs","Doublons possibles"),String(cell.pairs)],["Sources",sourceIds],
    ];
    if (notes.length) rows.push([l("Findings","Constats"),notes.join(" · ")]);
    return `<li><details><summary>${html(cell.cell)} · ${local(lang,publicationLabels[cell.status])}</summary>
<div class="inside">${facts(rows)}</div></details></li>`;
  });
  return `<section id="pack" tabindex="-1"><h2>${l("Generated link files","Fichiers de liens générés")}</h2>
${describePublication(audit,lang).map(value => `<p>${html(value)}</p>`).join("")}<ul>${list.join("")}</ul></section>`;
}

function workloadSection(page: ReviewPage, lang: Language): string {
  if (page.mode !== "comparison") return "";
  const l = t(lang);
  const work = page.cellWork;
  const rows = work.rows.map(cell => {
    const values: Array<[string,string]> = [
      [l("Cases in previous cell only","Dossiers dans la cellule précédente seulement"),String(cell.previousOnly)],
      [l("Cases in candidate cell only","Dossiers dans la cellule candidate seulement"),String(cell.candidateOnly)],
      [l("Cases in both versions","Dossiers dans les deux versions"),String(cell.both)],
      [l("Cases spanning several cells","Dossiers couvrant plusieurs cellules"),String(cell.crossCell)],
      [l("Group cases","Dossiers de groupes"),String(cell.groups)],
      [l("Possible pair cases","Dossiers de doublons possibles"),String(cell.pairs)],
      [l("Splits / merges / regroupings","Scissions / fusions / regroupements"),[cell.splits,cell.merges,cell.regrouped].join(" / ")],
    ];
    return `<li><details><summary>${html(cell.cell)} · ${l("Cases","Dossiers")} : ${cell.cases}</summary>
<div class="inside">${facts(values)}</div></details></li>`;
  });
  return `<section id="workload" tabindex="-1"><h2>${l("Affected cache cells","Cellules de cache concernées")}</h2>
${describeCellWork(work,lang).map(text => `<p>${html(text)}</p>`).join("")}
<p>${l(`Cell page ${work.page} of ${work.pages}. The inventory covers the full comparison.`,
`Page des cellules ${work.page} sur ${work.pages}. L’inventaire couvre toute la comparaison.`)}</p>
<ul>${rows.join("")}</ul></section>`;
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("base64");
}

export function renderHtml(page: ReviewPage, lang: Language): string {
  const l = t(lang);
  const heading = local(lang, title);
  const css = readFileSync(new URL("./reader.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("./reader.js", import.meta.url), "utf8");
  const security = `default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'sha256-${digest(css)}'; script-src 'sha256-${digest(js)}'`;
  const baseline = page.previous ? `<section><h3>${l("Previous index", "Index précédent")}</h3>${facts(releaseFacts(page.previous,lang))}</section>` : "";
  const section = (id:string,label:string) => `<a href="#${id}">${label}</a>`;
  const skipWarning = page.previous?.skippedInputs || page.candidate.skippedInputs
    ? `<p class="notice">${l("The matcher skipped inputs. An absent link describes only the published index.",
      "Le programme de correspondance a ignoré des entrées. L’absence d’un lien concerne uniquement l’index publié.")}</p>` : "";
  const filter = page.cases.length ? `<div class="tools">
<div><label for="case-search">${l("Search this page", "Rechercher dans cette page")}</label><input type="search" id="case-search"></div>
<div><label for="decision-filter">${l("Review status", "État de l’examen")}</label><select id="decision-filter">
<option value="">${l("All statuses", "Tous les états")}</option>${STATES.map(state =>
    `<option value="${state}">${local(lang,stateNames[state])}</option>`).join("")}</select></div>
<button id="clear-filters" type="button">${l("Clear filters", "Effacer les filtres")}</button></div>` : "";
  const queue = page.cases.length ? `<ul id="case-list">${page.cases.map(row => caseItem(row,lang)).join("")}</ul>` : "";
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${html(security)}">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title><style>${css}</style></head>
<body><a class="skip" id="skip" href="#results">${l("Skip to review results", "Aller aux résultats de l’examen")}</a>
<header><h1>${heading}</h1><p>${l("A match links source records. Accessibility at the place remains unknown.",
"Une correspondance relie des fiches sources. L’accessibilité du lieu demeure inconnue.")}</p></header>
<nav aria-label="${l("Report sections","Sections du rapport")}">
${section("results",l("Results","Résultats"))}${section("cases",l("Cases","Dossiers"))}${section("sources","Sources")}</nav>
<main><section id="results" tabindex="-1"><h2>${page.mode === "comparison" ? l("Release comparison","Comparaison des versions") : l("Candidate inventory","Inventaire candidat")}</h2>
${skipWarning}<div class="columns">${baseline}<section><h3>${l("Candidate index","Index candidat")}</h3>${facts(releaseFacts(page.candidate,lang))}</section></div>
${metadataCounts(page,lang)}</section>
<section id="cases" tabindex="-1"><h2>${l("Review cases","Dossiers à examiner")}</h2>
<p>${l(`Page ${page.page} of ${page.pages}. This selection covers ${page.matchedCases} of ${page.totalCases} cases.`,
`Page ${page.page} sur ${page.pages}. La sélection couvre ${page.matchedCases} dossiers sur ${page.totalCases}.`)}</p>
${page.orphanDecisions ? `<p>${l(`Decisions without a matching case: ${page.orphanDecisions}.`,`Décisions sans dossier correspondant : ${page.orphanDecisions}.`)}</p>` : ""}
${filter}<p id="ui-status" role="status" aria-live="polite" aria-atomic="true">${page.cases.length
    ? l(`Cases on this page: ${page.cases.length}.`, `Dossiers sur cette page : ${page.cases.length}.`)
    : page.mode === "inventory" ? l("Supply a previous release to compare declarations.", "Fournissez une version précédente pour comparer les déclarations.")
    : l("No matching changes for this selection.","Aucun changement ne correspond à la sélection.")}</p>
${queue}${page.cases.some(row => !row.restricted) ? `<p>${l(
"Export saves the decisions selected on this page. Keep one current decision file per review page.",
"L’exportation enregistre les décisions sélectionnées sur cette page. Conservez un seul fichier de décisions à jour par page d’examen.")}</p>
<button id="export-decisions" type="button">${l("Export decisions", "Exporter les décisions")}</button>` : ""}
</section>${inspectSection(page,lang)}${packSection(page,lang)}${workloadSection(page,lang)}<section id="sources" tabindex="-1"><h2>Sources</h2><ul>${page.citations.map(c =>
    sourceItem(c,lang,page.mode === "comparison")).join("")}</ul></section></main><script>${js}</script></body></html>\n`;
}

export function renderText(page: ReviewPage, lang: Language): string {
  const l = t(lang);
  const rows = [local(lang,title), ...releaseFacts(page.candidate,lang).map(([k,v]) => k + " — " + v)];
  rows.push(l(`Cases on page ${page.page}/${page.pages}: ${page.cases.length} of ${page.matchedCases} selected.`,
    `Dossiers à la page ${page.page}/${page.pages} : ${page.cases.length} sur ${page.matchedCases} sélectionnés.`));
  if (page.mode === "comparison") rows.push(...describeCellWork(page.cellWork,lang));
  if (page.publication) {
    rows.push(...describePublication(page.publication.audit,lang));
    for (const cell of page.publication.audit.cells.filter(cell => cell.status !== "checked")) {
      rows.push([cell.cell,local(lang,publicationLabels[cell.status]),...cell.issues.map(issue =>
        local(lang,publicationIssues[issue]))].join(" · "));
    }
  }
  for (const row of page.cases) {
    rows.push([row.id,local(lang,familyNames[row.family]),reviewName(row.kind,lang),local(lang,stateNames[row.state])].join(" · "));
    for (const [field,value] of evidenceRows(row,lang)) rows.push(field + " — " + value);
    for (const citation of row.citations) {
      const p = citation.candidate ?? citation.previous;
      const unknown = l("Unknown","Inconnu");
      rows.push([citation.sourceId,p?.licence ?? unknown,p?.retrievedOn ?? unknown,
        l("Tier","Niveau") + " " + String(p?.verificationTier ?? unknown)].join(" · "));
    }
  }
  for (const side of ["previous","candidate"] as const) {
    for (const row of page.inspection?.[side] ?? []) {
      const label = side === "previous" ? l("Previous","Version précédente") : l("Candidate","Version candidate");
      rows.push([label,row.member?.id ?? l("Unknown","Inconnu"),row.sourceId,local(lang,inspections[row.status])].join(" · "));
    }
  }
  return rows.join("\n") + "\n";
}
