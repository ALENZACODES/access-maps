import type { LicenceCheck } from "./licences.js";
import type { AuditReport, Severity } from "./types.js";

function cell(value: unknown, max = 60): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const short = raw.length > max ? `${raw.slice(0, max - 3)}...` : raw;
  return short.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

const ORDER: Severity[] = ["blocker", "serious", "review"];

/**
 * Markdown for the reviewer. It states what the tool did and what it did not
 * do. It does not give a verdict: the reviewer does, after the cross-check.
 */
export function renderAudit(report: AuditReport): string {
  const out: string[] = [];
  out.push("# Seed-data deep sample", "");
  out.push(`Audit date: ${report.auditDate}. Seed: \`${report.seed}\`. Sample: up to ${report.samplePerFile} records per ${report.sampleBy === "directory" ? "folder" : "file"}.`, "");
  out.push(
    "This report counts every record itself and checks provenance on every field. The sample is reproducible from the seed. The tool does not compare a record to its source or to a second source. Those columns stay empty until the reviewer fills them in.",
    "",
  );

  out.push("## Independent counts", "");
  out.push("| File | Records | Pieces | UNKNOWN gaps | Derived excluded | Unreadable lines |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const file of report.files) {
    out.push(`| ${cell(file.file)} | ${file.records} | ${file.pieces} | ${file.gaps} | ${file.derivedExcluded} | ${file.unreadableLines} |`);
  }
  const t = report.totals;
  out.push(`| **Total** | **${t.records}** | **${t.pieces}** | **${t.gaps}** | **${t.derivedExcluded}** | |`, "");

  out.push("## Reconciliation with the counts report", "");
  if (report.reconciliation.length === 0) {
    out.push("No counts report was given, so nothing was reconciled.", "");
  } else {
    const mismatches = report.reconciliation.filter((row) => !row.matches);
    out.push(`${report.reconciliation.length - mismatches.length} of ${report.reconciliation.length} values match.`, "");
    out.push("| Key | Counted | Reported | Match |", "| --- | ---: | ---: | --- |");
    for (const row of report.reconciliation) {
      out.push(`| ${cell(row.key)} | ${row.counted} | ${row.reported ?? "not reported"} | ${row.matches ? "yes" : "**no**"} |`);
    }
    out.push("");
  }

  out.push("## Defects", "");
  const rules = Object.entries(report.defectCounts);
  if (rules.length === 0) {
    out.push("No defect rule matched.", "");
  } else {
    out.push("| Rule | Severity | Count |", "| --- | --- | ---: |");
    const severityOf = (rule: string) => report.defects.find((defect) => defect.rule === rule)?.severity ?? "review";
    rules
      .sort((a, b) => ORDER.indexOf(severityOf(a[0])) - ORDER.indexOf(severityOf(b[0])) || a[0].localeCompare(b[0]))
      .forEach(([rule, count]) => out.push(`| ${rule} | ${severityOf(rule)} | ${count} |`));
    out.push("", "Listed examples (capped per rule and file; counts above are exact):", "");
    out.push("| Severity | Rule | File | Line | Record | Field | Detail |", "| --- | --- | --- | ---: | --- | --- | --- |");
    for (const defect of [...report.defects].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))) {
      out.push(
        `| ${defect.severity} | ${defect.rule} | ${cell(defect.file)} | ${defect.line ?? ""} | ${cell(defect.recordId ?? "")} | ${cell(defect.field ?? "")} | ${cell(defect.detail, 200)} |`,
      );
    }
    out.push("");
  }

  out.push("## Sample and cross-check", "");
  out.push(`${report.sample.length} records sampled. ${report.crossCheckPending.length} have no second-source entry yet.`, "");
  out.push("| File | Line | Record | Populated fields | UNKNOWN fields | Second source | Result |", "| --- | ---: | --- | ---: | ---: | --- | --- |");
  for (const item of report.sample) {
    const entries = report.crossCheck.filter((entry) => entry.recordId === item.recordId);
    const sources = entries.length ? [...new Set(entries.map((entry) => entry.secondSource))].join("; ") : "not checked";
    const results = entries.length ? entries.map((entry) => `${entry.field}: ${entry.result}`).join("; ") : "not checked";
    out.push(`| ${cell(item.file)} | ${item.line} | ${cell(item.recordId)} | ${item.populated.length} | ${item.unknownCount} | ${cell(sources)} | ${cell(results)} |`);
  }
  out.push("");
  return out.join("\n");
}

export function renderLicenceChecks(checks: LicenceCheck[], auditDate: string): string {
  const out = ["# Licence re-checks", "", `Opened ${auditDate}. Each row needs an owner and a due date from a person before it counts as owned.`, ""];
  if (checks.length === 0) {
    out.push("No source in the registry needs a re-check under these rules.");
    return out.join("\n");
  }
  out.push("| Source | Licence | Retrieved | Why | Owner | Due |", "| --- | --- | --- | --- | --- | --- |");
  for (const check of checks) {
    out.push(`| ${cell(check.sourceId)} | ${cell(check.licenceId)} | ${check.retrievedAt ?? "UNKNOWN"} | ${cell(check.detail.join(" "), 300)} | not set | not set |`);
  }
  return out.join("\n");
}
