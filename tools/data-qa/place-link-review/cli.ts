import { basename, dirname, join, resolve } from "node:path";
import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readSnapshot, SnapshotError, type LinkMember } from "./snapshot.ts";
import { readProvenance, resolveSources } from "./provenance.ts";
import { readDecisions, DecisionError } from "./decisions.ts";
import { buildBook, type Release } from "./review.ts";
import { selectPage, SelectionError, STATES, type ReviewPage, type Selection } from "./view.ts";
import { checkInputs, inputStamp, physicalRoot, readStablePart } from "./inputs.ts";
import { renderHtml, renderText } from "./report.ts";
import { local, type Language, type Words } from "./language.ts";

type Format = "json" | "text" | "html";
type Side = "previous" | "candidate";
interface Options {
  candidate?: string;
  previous?: string;
  out?: string;
  pack?: string;
  decisions: string[];
  lang: Language;
  format: Format;
  check: boolean;
  members: boolean;
  help: boolean;
  select: Selection;
}

const errors = {
  usage: ["Invalid or repeated option. See --help.", "Option non valide ou répétée. Consultez --help."],
  root: ["Release folder is unavailable.", "Dossier de version indisponible."],
  links: ["Link index inspection failed.", "Échec de l’inspection de l’index de liens."],
  registry: ["Cannot read the source registry.", "Impossible de lire le registre des sources."],
  decisions: ["Cannot use the decision file.", "Fichier de décisions inutilisable."],
  selection: ["Invalid case, page or member selection.", "Sélection de dossier, de page ou de fiches non valide."],
  output: ["Cannot create the report. Choose a new file in a writable folder.",
    "Impossible de créer le rapport. Indiquez un nouveau fichier dans un dossier accessible en écriture."],
  size: ["Report exceeds the file limit. Narrow the selection.", "Le rapport dépasse la limite. Précisez la sélection."],
  review: ["The review could not finish.", "Impossible de terminer l’examen."],
} satisfies Record<string, Words>;

class Problem extends Error {
  code: keyof typeof errors;
  context: string;
  constructor(code: keyof typeof errors, context = "") {
    super(code);
    this.code = code;
    this.context = context;
  }
}
function number(raw: string): number {
  if (!/^(0|[1-9][0-9]*)$/u.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Problem("usage");
  return Number(raw);
}

function parse(args: readonly string[]): Options {
  const opts: Options = { lang: "en", format: "text", check: false, members: false, help: false, select: {}, decisions: [] };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (seen.has(flag) && flag !== "--decisions") throw new Problem("usage");
    seen.add(flag);
    if (flag === "--check-inputs") { opts.check = true; continue; }
    if (flag === "--inspect-members") { opts.members = true; continue; }
    if (flag === "--help") { opts.help = true; continue; }
    const value = args[++i];
    if (!value?.trim() || value.startsWith("--")) throw new Problem("usage");
    switch (flag) {
      case "--candidate": opts.candidate = value; break;
      case "--previous": opts.previous = value; break;
      case "--pack": opts.pack = value; break;
      case "--out": opts.out = value; break;
      case "--decisions": opts.decisions.push(value); break;
      case "--source": opts.select.source = value; break;
      case "--cell": opts.select.cell = value; break;
      case "--case":
        if (!/^[0-9a-f]{64}$/u.test(value)) throw new Problem("usage");
        opts.select.id = value;
        break;
      case "--format":
        if (value !== "text" && value !== "html" && value !== "json") throw new Problem("usage");
        opts.format = value;
        break;
      case "--lang":
        if (value !== "en" && value !== "fr") throw new Problem("usage");
        opts.lang = value;
        break;
      case "--family":
        if (value !== "group" && value !== "pair" && value !== "source") throw new Problem("usage");
        opts.select.family = value;
        break;
      case "--priority":
        if (value !== "rights" && value !== "identity" && value !== "declaration") throw new Problem("usage");
        opts.select.priority = value;
        break;
      case "--state": {
        const state = STATES.find(item => item === value);
        if (!state) throw new Problem("usage");
        opts.select.state = state;
        break;
      }
      case "--cell-page": opts.select.cellPage = number(value); break;
      case "--cells-per-page": opts.select.cellsPerPage = number(value); break;
      case "--page": opts.select.page = number(value); break;
      case "--per-page": opts.select.perPage = number(value); break;
      case "--member-offset": opts.select.memberOffset = number(value); break;
      case "--member-limit": opts.select.memberLimit = number(value); break;
      default: throw new Problem("usage");
    }
  }
  if (opts.help) return opts;
  if (!opts.candidate || opts.decisions.length > 32 || (opts.members && !opts.select.id)) throw new Problem("usage");
  return opts;
}

const usage: ReadonlyArray<Words> = [
  ["Place-link release review", "Examen des liens entre fiches de lieux"],
  ["--candidate ROOT   Release with data/links and sources/registry.json",
   "--candidate DOSSIER   Version contenant data/links et sources/registry.json"],
  ["--previous ROOT    Compare the earlier link index and registry with the candidate",
   "--previous DOSSIER    Comparer l’index et le registre précédents à la version candidate"],
  ["--pack DIR         Audit the candidate’s generated pack/v1 directory and its cross-cell link copies",
   "--pack DOSSIER        Examiner le dossier pack/v1 généré et les copies des liens entre cellules"],
  ["--check-inputs     Check local compressed record partitions against the matcher digest",
   "--check-inputs        Comparer les partitions locales à l’empreinte des entrées du programme de correspondance"],
  ["--case ID --inspect-members   Inspect the selected record window in the source partitions",
   "--case ID --inspect-members   Inspecter les fiches de la fenêtre sélectionnée dans les partitions sources"],
  ["--decisions FILE   Reconcile a saved decision file (repeat for separate handoffs)",
   "--decisions FICHIER   Rapprocher un fichier de décisions (option répétable)"],
  ["--source ID | --cell CELL | --family group|pair|source    Filter cases (filters combine)",
   "--source ID | --cell CELLULE | --family group|pair|source   Filtrer les dossiers (filtres cumulables)"],
  ["--priority rights|identity|declaration   Filter by review priority",
   "--priority rights|identity|declaration   Filtrer selon la priorité d’examen"],
  ["--state open|follow-up|reviewed|restricted|stale|conflict   Filter by decision state",
   "--state open|follow-up|reviewed|restricted|stale|conflict   Filtrer selon l’état des décisions"],
  ["--page N --per-page N   Page starts at 1. Default 25 cases, maximum 200",
   "--page N --per-page N   Première page : 1. Par défaut, 25 dossiers. Maximum : 200"],
  ["--cell-page N --cells-per-page N   Page through cache cells independently (1–100 cells per page)",
   "--cell-page N --cells-per-page N   Parcourir les cellules de cache séparément (1 à 100 cellules par page)"],
  ["--member-offset N --member-limit N   Zero-based offset in one case. Default 32 records, maximum 250",
   "--member-offset N --member-limit N   Première position : 0 dans un dossier. Par défaut, 32 fiches. Maximum : 250"],
  ["--format text|json|html   Summary, structured evidence, or offline HTML with local decisions",
   "--format text|json|html   Résumé, données structurées ou HTML hors ligne avec décisions locales"],
  ["--lang en|fr --out FILE   Report language and new output file (default is standard output)",
   "--lang en|fr --out FICHIER   Langue et nouveau fichier de sortie (sortie standard par défaut)"],
  ["Exit 0 for a completed review, 1 for requested input or record checks with findings, 2 for invalid input or output.",
   "Code 0 pour un examen terminé, 1 pour un constat lors d’un contrôle demandé, 2 pour une erreur d’entrée ou de sortie."],
];

async function loadJson(root: string, relative: string, limit: number): Promise<unknown> {
  const stamp = await inputStamp(root, relative);
  if (stamp.size > BigInt(limit)) throw new RangeError("size");
  const bytes = await readStablePart(root, relative, stamp);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
async function loadRelease(path: string, side: Side, check: boolean): Promise<Release> {
  const root = await physicalRoot(path).catch(() => { throw new Problem("root",side); });
  const registry = await loadJson(root,"sources/registry.json",16_000_000).then(readProvenance)
    .catch(() => { throw new Problem("registry",side); });
  const data = join(root,"data");
  const links = await readSnapshot(data).catch((e: unknown) => {
    throw new Problem("links", side + (e instanceof SnapshotError ? " · " + e.code : ""));
  });
  const inputs = check ? await checkInputs(data, links.inputDigest, links.inputFiles) : undefined;
  return { links, registry, inputs };
}
async function loadDecisions(path: string) {
  try {
    const root = await physicalRoot(dirname(resolve(path)));
    return readDecisions(await loadJson(root,basename(path),8_000_000));
  } catch (error) {
    throw new Problem("decisions", error instanceof DecisionError ? error.code : "");
  }
}

// A complete report becomes visible under the selected name in a single operation.
// The exclusive hard link also protects an existing manifest or another writer's report.
async function publish(path: string, content: string): Promise<void> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(dirname(resolve(path)), ".place-link-report-"));
    const staged = join(dir,"complete");
    await writeFile(staged,content,{ mode:0o600 });
    await link(staged,path);
  } catch {
    throw new Problem("output");
  } finally {
    if (dir) await rm(dir,{ recursive:true, force:true });
  }
}

async function inspect(page: ReviewPage, opts: Options, previous: Release | null, candidate: Release): Promise<boolean> {
  const item = page.cases[0];
  if (!item || item.family === "source" || !previous || !opts.previous || !opts.candidate) throw new Problem("selection");
  const { inspectMembers } = await import("./members.ts");
  const read = (side: Side, root: string, release: Release) => {
    const members: LinkMember[] = [];
    for (const row of item.members) {
      const at = row[side];
      if (at) members.push({ tranche: row.tranche, id: row.id, sourceId: at.sourceId, cell: at.cell });
    }
    return members.length ? inspectMembers(join(resolve(root),"data"),members,release.registry) : Promise.resolve([]);
  };
  const before = await read("previous",opts.previous,previous);
  const after = await read("candidate",opts.candidate,candidate);
  page.inspection = { caseId: item.id, previous: before, candidate: after };
  return item.restricted || [...before,...after].some(row => row.status !== "matched");
}

export async function run(args: readonly string[], stdout: (value:string)=>void, stderr: (value:string)=>void): Promise<number> {
  const langIndex = args.indexOf("--lang");
  const lang: Language = langIndex >= 0 && args[langIndex + 1] === "fr" ? "fr" : "en";
  try {
    const opts = parse(args);
    if (opts.help) { stdout(usage.map(row => local(lang,row)).join("\n") + "\n"); return 0; }
    const candidate = await loadRelease(opts.candidate!,"candidate",opts.check);
    let previous: Release | null = null;
    if (opts.previous) {
      previous = resolve(opts.previous) === resolve(opts.candidate!) ? candidate : await loadRelease(opts.previous,"previous",opts.check);
    }
    const files = [];
    for (const path of opts.decisions) files.push(await loadDecisions(path));
    const book = buildBook(previous,candidate);
    const page = selectPage(book,opts.select,files);
    const inputsFlag = [candidate,previous].some(side =>
      side?.inputs && (side.inputs.status !== "matches" || side.links.skippedCount > 0));
    const memberFlag = opts.members && await inspect(page,opts,previous,candidate);
    let publicationFlag = false;
    if (opts.pack) {
      const { auditPublication } = await import("./publication.ts");
      const audit = await auditPublication(opts.pack,candidate.links,candidate.registry);
      const sources = resolveSources(candidate.registry,new Set(audit.cells.flatMap(cell => cell.sourceIds)));
      page.publication = { audit, sources };
      publicationFlag = audit.status !== "checked";
    }
    const content = opts.format === "html" ? renderHtml(page,lang) :
      opts.format === "text" ? renderText(page,lang) : JSON.stringify(page,null,2) + "\n";
    if (Buffer.byteLength(content) > 50_000_000) throw new Problem("size");
    if (opts.out) await publish(opts.out,content);
    else stdout(content);
    return inputsFlag || memberFlag || publicationFlag ? 1 : 0;
  } catch (e) {
    const problem = e instanceof Problem ? e : e instanceof SelectionError ? new Problem("selection") : new Problem("review");
    const context = lang === "en" ? problem.context : problem.context.replace(/^previous/u,"précédente").replace(/^candidate/u,"candidate");
    stderr(local(lang,errors[problem.code]) + (context ? " — " + context : "") + "\n");
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await run(process.argv.slice(2), s => process.stdout.write(s), s => process.stderr.write(s));
}
