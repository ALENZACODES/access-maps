/**
 * Day 30 licence re-check list. Reads a source registry shaped like
 * access-maps `sources/registry.json` and opens one dated check for each
 * source whose licence position needs fresh evidence. It does not decide
 * whether a licence permits a use. Owner and due date stay empty until a
 * person sets them.
 */
export interface RegistrySource {
  id?: unknown;
  name?: unknown;
  licence_name?: unknown;
  licence_url?: unknown;
  licence_id?: unknown;
  retrieved_at?: unknown;
  notes?: unknown;
  tier_note?: unknown;
}

export type LicenceReason =
  | "licence-not-recorded"
  | "licence-unknown"
  | "terms-not-settled"
  | "share-alike"
  | "retrieval-stale"
  | "retrieval-date-missing";

export interface LicenceCheck {
  sourceId: string;
  sourceName: string;
  licenceId: string;
  retrievedAt: string | null;
  reasons: LicenceReason[];
  detail: string[];
  openedOn: string;
  /** Set by a person. Null means nobody owns the check yet. */
  owner: null;
  /** Set by a person. */
  due: null;
}

const UNSETTLED = /revocable|not been reconciled|unreconciled|not recorded as a plain open grant|legal review|terms (?:are |were )?unclear|not confirmed/i;
const SHARE_ALIKE = /\bODbL\b|share-alike|share alike|CC-BY-SA/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function licenceChecks(registry: unknown, auditDate: string, maxAgeDays = 90): LicenceCheck[] {
  const sources: unknown[] = Array.isArray(registry)
    ? registry
    : registry && typeof registry === "object" && Array.isArray((registry as { sources?: unknown }).sources)
      ? (registry as { sources: unknown[] }).sources
      : [];
  const checks: LicenceCheck[] = [];
  for (const raw of sources) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as RegistrySource;
    const reasons: LicenceReason[] = [];
    const detail: string[] = [];
    const licenceId = text(source.licence_id);
    const licenceName = text(source.licence_name);
    const notes = `${text(source.notes)} ${text(source.tier_note)}`;
    if (!licenceId && !licenceName) {
      reasons.push("licence-not-recorded");
      detail.push("No licence id or name is recorded.");
    } else if (/^unknown$/i.test(licenceId) || /^unknown$/i.test(licenceName)) {
      reasons.push("licence-unknown");
      detail.push("The licence is recorded as UNKNOWN.");
    }
    if (!text(source.licence_url) && !reasons.includes("licence-not-recorded")) {
      reasons.push("licence-not-recorded");
      detail.push("No licence URL is recorded.");
    }
    if (UNSETTLED.test(notes)) {
      reasons.push("terms-not-settled");
      detail.push("The registry notes say the terms are not settled.");
    }
    if (SHARE_ALIKE.test(`${licenceId} ${licenceName}`)) {
      reasons.push("share-alike");
      detail.push("Share-alike terms need legal review before the data is mixed with other data.");
    }
    const retrievedAt = text(source.retrieved_at) || null;
    if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) {
      reasons.push("retrieval-date-missing");
      detail.push("No usable retrieval date is recorded.");
    } else if (daysBetween(retrievedAt, auditDate) > maxAgeDays) {
      reasons.push("retrieval-stale");
      detail.push(`Retrieved ${retrievedAt}, more than ${maxAgeDays} days before ${auditDate}.`);
    }
    if (reasons.length === 0) continue;
    checks.push({
      sourceId: text(source.id) || "UNKNOWN",
      sourceName: text(source.name) || "UNKNOWN",
      licenceId: licenceId || "UNKNOWN",
      retrievedAt,
      reasons,
      detail,
      openedOn: auditDate,
      owner: null,
      due: null,
    });
  }
  return checks.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
