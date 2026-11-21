import { createHash } from "node:crypto";
import type { EvidenceCase } from "./evidence.js";
import type { ReviewerDesk, SessionAudit } from "./session.js";

export type Language = "en" | "fr";
type Pair = readonly [string, string];

const copy = {
  audit: ["Review session audit", "Journal de la séance de révision"],
  desk: ["Independent review", "Révision indépendante"],
  skip: ["Skip to cases", "Aller aux dossiers"],
  cases: ["Cases", "Dossiers"],
  empty: ["You have no assignments in this session.", "Aucun dossier ne vous est attribué dans cette séance."],
  session: ["Session", "Séance"],
  reviewer: ["Reviewer", "Responsable de la révision"],
  assigned: ["Assigned reviewers", "Personnes affectées"],
  quorum: ["Required independent votes", "Votes indépendants requis"],
  auditIntro: [
    "Review the evidence and its provenance before recording a decision. Decisions apply to this session only.",
    "Examinez les données et leur provenance avant de consigner une décision. Les décisions portent sur cette séance uniquement.",
  ],
  deskIntro: [
    "Review each source field independently. Send your saved response to the session coordinator.",
    "Examinez chaque champ source de façon indépendante. Transmettez votre réponse enregistrée à la personne qui coordonne la séance.",
  ],
  caseRef: ["Case reference", "Référence du dossier"],
  revision: ["Evidence fingerprint", "Empreinte des données"],
  source: ["Source", "Source"],
  licence: ["Licence", "Licence"],
  date: ["Retrieved on", "Date de récupération"],
  tier: ["Tier on source field", "Niveau indiqué dans le champ source"],
  value: ["Source value", "Valeur source"],
  notice: ["Attribution", "Mention de source"],
  evidenceHold: ["Source review required. A vote cannot clear this hold.", "Une révision de la source est nécessaire. Un vote ne peut pas lever cette mise en attente."],
  reasons: ["Reasons for hold", "Motifs de la mise en attente"],
  outcome: ["Review outcome", "Résultat de la révision"],
  choices: ["Current ballots", "Votes en vigueur"],
  history: ["Decision history", "Historique des décisions"],
  none: ["No decisions recorded.", "Aucune décision consignée."],
  own: ["Your current vote", "Votre vote en vigueur"],
  noVote: ["No vote recorded", "Aucun vote consigné"],
  rule: ["Independent ruling", "Arbitrage indépendant"],
  chooseRuling: ["Adjudicator", "Responsable de l’arbitrage"],
  choose: ["Record a response", "Consigner une réponse"],
  save: ["Save response file", "Enregistrer le fichier de réponse"],
  saved: ["Response file prepared. Return it to the coordinator.", "Fichier de réponse préparé. Transmettez-le à la personne qui coordonne la séance."],
  closed: ["Closed by adjudication", "Dossier clos après arbitrage"],
  ready: ["Ready for the next review stage", "Prêt pour l’étape de révision suivante"],
  awaiting: ["Awaiting votes", "En attente de votes"],
  disputed: ["In dispute", "En désaccord"],
  hold: ["Hold for review", "Mettre en attente pour révision"],
  withdraw: ["Withdraw my vote", "Retirer mon vote"],
  withdrew: ["Withdrew vote", "Vote retiré"],
  vote: ["Vote", "Vote"],
  adjudicate: ["Ruling", "Arbitrage"],
} as const satisfies Record<string, Pair>;

const fieldNames: Record<string, Pair> = {
  wheelchair: ["Wheelchair access", "Accès en fauteuil roulant"],
  ramp: ["Ramp", "Rampe"],
  ramp_wheelchair: ["Wheelchair ramp", "Rampe pour fauteuil roulant"],
  automatic_door: ["Automatic door", "Porte automatique"],
  tactile_paving: ["Tactile paving", "Surface tactile"],
  handrail: ["Handrail", "Main courante"],
  lit: ["Lighting", "Éclairage"],
  hearing_loop: ["Hearing loop", "Boucle auditive"],
  braille: ["Braille", "Braille"],
  speech_output: ["Speech output", "Sortie vocale"],
  adult_changing_table: ["Adult changing table", "Table à langer pour adultes"],
  changing_table: ["Changing table", "Table à langer"],
  wheelchair_boarding: ["Wheelchair boarding", "Embarquement en fauteuil roulant"],
  stair_count: ["Number of stairs", "Nombre de marches"],
  step_count: ["Number of steps", "Nombre de marches"],
};

const values: Record<string, Pair> = {
  UNKNOWN: ["Unknown", "Inconnu"],
  yes: ["Yes", "Oui"], no: ["No", "Non"], limited: ["Limited", "Limité"],
  designated: ["Designated", "Désigné"], partial: ["Partial", "Partiel"],
  entrance_accessible: ["Accessible entrance", "Entrée accessible"],
  entrance_not_accessible: ["Entrance marked inaccessible", "Entrée indiquée comme inaccessible"],
  accessible_path: ["Accessible path", "Chemin accessible"],
  no_accessible_path: ["No accessible path", "Aucun chemin accessible"],
  some_vehicles_accessible: ["Some vehicles accessible", "Certains véhicules accessibles"],
  boarding_not_possible: ["Boarding unavailable", "Embarquement impossible"],
};

const reasons: Record<EvidenceCase["reasons"][number], Pair> = {
  "licence-mismatch": ["Licence mismatch", "Divergence de licence"],
  "tier-mismatch": ["Verification tier mismatch", "Divergence de niveau de vérification"],
  "date-mismatch": ["Retrieval date mismatch", "Divergence de date de récupération"],
  "credit-mismatch": ["Attribution mismatch", "Divergence de mention de source"],
  "source-held": ["Source under review", "Source en cours de révision"],
  "derived-copy": ["Derived field", "Champ dérivé"],
  "unsupported-value": ["Value requires source review", "Valeur nécessitant une révision de la source"],
};

function esc(text: string): string {
  return text.replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function term(key: keyof typeof copy, lang: Language): string {
  return copy[key][lang === "en" ? 0 : 1];
}

function definition(label: string, value: string) {
  return '<dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd>';
}

function caseFacts(item: EvidenceCase, lang: Language) {
  const i = lang === "en" ? 0 : 1;
  const t = (key: keyof typeof copy) => term(key, lang);
  const notices = item.reasons.map(reason => reasons[reason][i]).join(" · ");
  return (item.state === "held" ? '<p><strong>' + t("evidenceHold") + '</strong></p>' : '') + '<dl>' + [
    definition(t("value"), values[item.value]?.[i] ?? item.value),
    definition(t("source"), item.source),
    definition(t("licence"), item.licence === "UNKNOWN" ? (lang === "fr" ? "Inconnue" : "Unknown") : item.licence),
    definition(t("date"), item.retrievedOn),
    definition(t("tier"), String(item.verificationTier)),
    '<dt>' + t("notice") + '</dt><dd lang="en">' + esc(item.attribution) + '</dd>',
    notices ? definition(t("reasons"), notices) : "",
    definition(t("caseRef"), item.id),
    definition(t("revision"), item.revision),
  ].join("") + '</dl>';
}

interface ResponseForm {
  sessionId: string;
  id: string;
  revision: string;
  previous: string;
  actors: readonly string[];
  kind: "vote" | "adjudicate" | "withdraw";
}

function responseForm(form: ResponseForm, lang: Language) {
  const t = (key: keyof typeof copy) => term(key, lang);
  const hidden = (name: string, value: string) =>
    '<input type="hidden" name="' + name + '" value="' + esc(value) + '">';
  const actorField = form.kind !== "adjudicate" ? hidden("actor", form.actors[0]!) :
    '<label>' + t("chooseRuling") + '<select name="actor" required><option value=""></option>' +
      form.actors.map(actor => '<option>' + esc(actor) + '</option>').join("") + '</select></label>';
  const options = form.kind === "withdraw" ? '<p>' + t("withdraw") + '</p>' :
    (["ready", "hold"] as const).map(choice =>
      '<label><input type="radio" name="choice" required value="' + choice + '">' + t(choice) + '</label>').join("");
  return '<form><fieldset><legend>' + t(form.kind === "adjudicate" ? "rule" : "choose") + '</legend>' +
    hidden("sessionId", form.sessionId) + hidden("caseId", form.id) + hidden("revision", form.revision) +
    hidden("previous", form.previous) + hidden("kind", form.kind) + actorField + options +
    '<button type="submit">' + t("save") + '</button></fieldset><p role="status" data-message="' +
    esc(t("saved")) + '"></p></form>';
}

function section(heading: string, detail: string) {
  return '<article><h2>' + esc(heading) + '</h2>' + detail + '</article>';
}

// All data, translated copy and actor identifiers stay in escaped HTML fields.
const script = `for (const form of document.forms) {
  form.addEventListener("submit", event => {
    event.preventDefault();
    const response = Object.fromEntries(new FormData(form));
    if (response.kind === "withdraw") response.choice = null;
    const blob = new Blob([JSON.stringify(response, null, 2) + "\\n"], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "response-" + response.caseId + "-" + response.actor + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const status = form.querySelector('[role="status"]');
    status.textContent = status.dataset.message;
  });
}`;

const css = `
*{box-sizing:border-box}
html{font:100%/1.55 system-ui,sans-serif;color:#172827;background:#fff}
body{margin:0 auto;max-width:65rem;padding:1rem;overflow-wrap:anywhere}
h1,h2,legend{line-height:1.25}h1{font-size:2rem}h2{font-size:1.4rem}
article{padding:1.25rem 0;border-top:2px solid #56716e}
dl{display:grid;grid-template-columns:minmax(9rem,14rem) 1fr;gap:.4rem 1rem}
dt{font-weight:650}dd{margin:0}
a,summary,label,button,select{min-height:44px;min-width:44px}a,label{display:inline-flex;align-items:center}
fieldset{padding:1rem;border:1px solid #56716e;margin:.8rem 0;min-width:0}
legend{font-weight:700}label{display:flex;gap:.6rem;width:fit-content}
button,select{font:inherit}button{color:#fff;background:#124e4b;border:0;padding:.5rem 1rem;margin-top:.5rem}
summary{padding:.6rem 0;cursor:pointer}a{color:#124e4b}
:focus-visible,label:has(input:focus-visible){outline:3px solid #9c3300;outline-offset:2px}
[role=status]:empty{margin:0}
@media(max-width:34rem){dl{display:block}dd{margin-bottom:.65rem}body{padding:.75rem}}
@media(forced-colors:active){button{border:1px solid ButtonText}}
@media print{form,.skip{display:none}body{max-width:none}}
`;

function documentHtml(lang: Language, title: string, intro: string, metadata: string, body: string) {
  const hash = createHash("sha256").update(script).digest("base64");
  const policy = "default-src 'none'; script-src 'sha256-" + hash + "'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
  return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
    policy + '"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) +
    '</title><style>' + css + '</style></head><body><a class="skip" href="#cases">' + term("skip", lang) +
    '</a><header><h1>' + esc(title) + '</h1><p>' + esc(intro) + '</p><dl>' + metadata +
    '</dl></header><main id="cases" tabindex="-1" aria-label="' + term("cases", lang) + '">' + body +
    '</main><script>' + script + '</script></body></html>\n';
}

function fieldHeading(item: EvidenceCase, index: number, lang: Language) {
  return (index + 1) + ". " + (fieldNames[item.field]?.[lang === "en" ? 0 : 1] ?? item.field);
}

export function renderDesk(desk: ReviewerDesk, lang: Language): string {
  const t = (key: keyof typeof copy) => term(key, lang);
  const body = desk.cases.map((row, index) => {
    const control = row.closed ? '<p>' + t("closed") + '</p>' : responseForm({
      sessionId: desk.sessionId, id: row.evidence.id, revision: row.revision, previous: row.previous,
      actors: [desk.reviewer], kind: row.ownChoice === null ? "vote" : "withdraw",
    }, lang);
    return section(fieldHeading(row.evidence, index, lang), caseFacts(row.evidence, lang) + '<dl>' +
      definition(t("own"), t(row.ownChoice ?? "noVote")) + '</dl>' + control);
  }).join("");
  return documentHtml(lang, t("desk"), t("deskIntro"), definition(t("reviewer"), desk.reviewer) +
    definition(t("session"), desk.sessionId), body || '<p>' + t("empty") + '</p>');
}

export function renderAudit(audit: SessionAudit, lang: Language): string {
  const t = (key: keyof typeof copy) => term(key, lang);
  const body = audit.cases.map((row, index) => {
    const { ballot } = row;
    const choices = [t("ready") + " (" + ballot.counts.ready + ")", t("hold") + " (" + ballot.counts.hold + ")"];
    const history = row.events.length ? '<ol>' + row.events.map(event =>
      '<li>' + esc(event.actor) + ' — ' + (event.kind === "withdraw" ? t("withdrew") :
        t(event.kind) + ' · ' + t(event.choice)) + '</li>').join("") + '</ol>' : '<p>' + t("none") + '</p>';
    const ruling = ballot.status === "disputed" && !ballot.votersNeeded && row.adjudicators.length ?
      responseForm({ sessionId: audit.sessionId, id: row.evidence.id, revision: row.revision,
        previous: row.historyHead, actors: row.adjudicators, kind: "adjudicate" }, lang) : "";
    return section(fieldHeading(row.evidence, index, lang), '<dl>' +
      definition(t("outcome"), t(row.outcome)) + definition(t("assigned"), row.assigned.join(", ")) +
      definition(t("choices"), choices.join(" · ")) + '</dl>' + caseFacts(row.evidence, lang) +
      '<details><summary>' + t("history") + '</summary>' + history + '</details>' + ruling);
  }).join("");
  return documentHtml(lang, t("audit"), t("auditIntro"), definition(t("session"), audit.sessionId) +
    definition(t("quorum"), String(audit.quorum)), body);
}
