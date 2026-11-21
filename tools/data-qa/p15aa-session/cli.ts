import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildReviewEvidence, locateReviewEvidence } from "./evidence.js";
import { AssignmentInputError } from "./assignment.js";
import { BallotError } from "./ballots.js";
import { mergeSessions } from "./merge.js";
import { readJson, readShard, saveOutput } from "./io.js";
import { renderAudit, renderDesk } from "./report.js";
import { auditSession, createSession, planSession, reviewerDesk, sealSession, SessionError, submitResponse } from "./session.js";

const usage = [
  "Offline review session / Séance de révision hors ligne",
  "data-qa:session <intake|locate|prepare|plan|seal|desk|audit|submit|merge>",
  "--registry FILE   (--selections FILE | --shard FILE --field KEY)",
  "plan / seal / desk / audit / submit / merge    --session FILE",
  "desk    --reviewer r-001",
  "desk / audit    [--format json|html] [--lang en|fr]",
  "submit    --response FILE",
  "merge    --base FILE --returned FILE",
  "[--out FILE]",
].join("\n") + "\n";

const options = {
  intake: [], locate: [], prepare: [], plan: ["session"], seal: ["session"],
  desk: ["session", "reviewer", "format", "lang"], audit: ["session", "format", "lang"],
  submit: ["session", "response"], merge: ["session", "base", "returned"],
} as const;
type Operation = keyof typeof options;

function argumentsFor(args: readonly string[]) {
  const op = args[0];
  if (!op || !Object.hasOwn(options, op)) throw new SessionError("invalid-operation");
  const command = op as Operation;
  const allowed = new Set(["registry", "selections", "shard", "field", "out", ...options[command]]);
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i]!;
    const name = flag.slice(2);
    const value = args[i + 1];
    if (!flag.startsWith("--") || !allowed.has(name) || values.has(name) || !value || value.startsWith("--")) {
      throw new SessionError("invalid-option");
    }
    values.set(name, value);
  }
  const required = (name: string) => {
    const value = values.get(name);
    if (!value) throw new SessionError("missing-" + name);
    return value;
  };
  const selection = values.has("selections");
  if (selection === values.has("shard") || values.has("shard") !== values.has("field")) {
    throw new SessionError("choose-one-evidence-input");
  }
  const lang = values.get("lang") ?? "en";
  const format = values.get("format") ?? "json";
  if (lang !== "en" && lang !== "fr") throw new SessionError("invalid-language");
  if (format !== "json" && format !== "html") throw new SessionError("invalid-format");
  return { command, required, values, lang, format } as const;
}

export function runCli(args: readonly string[]): string {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return usage;
  const { command, required, values, lang, format } = argumentsFor(args);
  const registry = readJson(required("registry"));
  const selections = values.has("selections") ? readJson(required("selections")) : readShard(required("shard"), required("field"));
  const locations = command === "locate" ? locateReviewEvidence(registry, selections) : null;
  const evidence = locations ? locations.map(row => row.evidence) : buildReviewEvidence(registry, selections);
  if (!evidence.length) throw new SessionError("empty-review");
  let output: unknown;
  if (command === "locate") output = locations;
  else if (command === "intake") output = evidence;
  else if (command === "prepare") output = createSession(evidence);
  else {
    const session = readJson(required("session"));
    switch (command) {
      case "plan": output = planSession(evidence, session); break;
      case "seal": output = sealSession(evidence, session); break;
      case "submit": output = submitResponse(evidence, session, readJson(required("response"))); break;
      case "merge": output = mergeSessions(evidence, readJson(required("base")), session, readJson(required("returned"))); break;
      case "desk": {
        const desk = reviewerDesk(evidence, session, required("reviewer"));
        output = format === "html" ? renderDesk(desk, lang) : desk;
        break;
      }
      case "audit": {
        const audit = auditSession(evidence, session);
        output = format === "html" ? renderAudit(audit, lang) : audit;
        break;
      }
    }
  }
  const contents = typeof output === "string" ? output : JSON.stringify(output, null, 2) + "\n";
  if (Buffer.byteLength(contents) > 32 * 1024 * 1024) throw new SessionError("output-file-limit");
  if (!values.has("out")) return contents;
  saveOutput(required("out"), contents);
  return "";
}

function diagnostic(error: unknown) {
  if (error instanceof SessionError || error instanceof AssignmentInputError || error instanceof BallotError) return error.code;
  if (error instanceof Error && /^evidence\/[a-z-]+$/u.test(error.message)) return error.message;
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "EEXIST") return "output-exists";
  if (code === "ENOENT") return "file-missing";
  return "file-or-input-error";
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.stdout.write(runCli(process.argv.slice(2)));
  } catch (error: unknown) {
    process.stderr.write("P15 " + diagnostic(error) + "\n");
    process.exitCode = 1;
  }
}
