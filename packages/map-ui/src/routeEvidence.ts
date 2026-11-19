import type { Journey, JourneyPlan, Leg, Provenance, StepFreeStatus } from "@access-maps/journey";

/** Local-only explanations for the journey options already produced by the routing engine. */
export type EvidenceLocale = "en" | "fr";
export type EvidenceState = "YES" | "NO" | "UNKNOWN";
export type EvidenceSeverity = "blocking" | "caution" | "information";
export type EvidenceCategory = "access" | "time" | "source" | "surface" | "distance" | "return" | "continuity";
export type EvidenceRouteKind = "outbound" | "return";
export type EvidenceOutcome = "supported" | "conditional" | "blocked" | "UNKNOWN";

export interface EvidenceIssue {
  readonly id: string;
  readonly code: string;
  readonly category: EvidenceCategory;
  readonly severity: EvidenceSeverity;
  readonly legId: string;
  readonly direction: EvidenceRouteKind;
  readonly sourceId: string;
  readonly observedOn: string;
  readonly text: Readonly<{ en: string; fr: string }>;
}

export interface EvidenceSegment {
  readonly key: string;
  readonly legId: string;
  readonly direction: EvidenceRouteKind;
  readonly title: string;
  readonly fromName: string;
  readonly toName: string;
  readonly status: EvidenceState;
  readonly surface: string;
  readonly gradient: string;
  readonly distanceMetres: number | null;
  readonly sourceId: string;
  readonly licence: string;
  readonly observedOn: string;
  readonly tier: number | null;
  readonly attribution: string | null;
  readonly issues: readonly EvidenceIssue[];
}

export interface EvidenceOption {
  readonly id: string;
  readonly title: string;
  readonly status: EvidenceOutcome;
  readonly blockedByPlanner: boolean;
  readonly roundTripStatus: EvidenceOutcome;
  readonly segments: readonly EvidenceSegment[];
  readonly outbound: readonly EvidenceSegment[];
  readonly returnSegments: readonly EvidenceSegment[];
  readonly issues: readonly EvidenceIssue[];
  readonly totals: Readonly<{ blocking: number; caution: number; information: number; unknown: number; no: number }>;
  readonly sources: readonly EvidenceSource[];
  readonly distanceMetres: number | null;
  readonly unresolvedMetres: boolean;
  readonly explanation: string;
}

export interface EvidenceSource {
  readonly id: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly attribution: string | null;
  readonly tier: number | null;
}

export interface EvidenceDashboard {
  readonly planId: string;
  readonly locale: EvidenceLocale;
  readonly generatedFrom: string;
  readonly options: readonly EvidenceOption[];
  readonly issues: readonly EvidenceIssue[];
  readonly summary: Readonly<{ options: number; supported: number; conditional: number; blocked: number; unknown: number; sources: number }>;
}

export interface EvidenceFilters {
  readonly direction: "all" | EvidenceRouteKind;
  readonly severity: "all" | EvidenceSeverity;
  readonly category: "all" | EvidenceCategory;
  readonly query: string;
}

export type EvidenceSort = "original" | "uncertainty" | "distance" | "source";

const OPEN_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "OGL-Canada-2.0", "OGL-ON-1.0", "ODbL-1.0"]);
const SENSITIVE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|api[-_]?key)\s*[:=]/iu;
const UNSAFE = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu;

export const EMPTY_FILTERS: EvidenceFilters = Object.freeze({ direction: "all", severity: "all", category: "all", query: "" });

export const EVIDENCE_COPY = Object.freeze({
  en: Object.freeze({
    heading: "Route evidence and uncertainty",
    introduction: "Inspect each option, its recorded barriers, missing facts and source dates. UNKNOWN does not mean accessible.",
    review: "Inspect route evidence",
    hide: "Hide evidence details",
    options: "Options",
    unresolved: "Items needing a closer look",
    sources: "Sources",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    tier: "Evidence tier",
    unknown: "UNKNOWN",
    noIssues: "No additional issues were identified in the supplied records. This is not a statement about conditions on site.",
    noOptions: "No route options were provided.",
    missing: "Not supplied",
    all: "All",
    outbound: "Outbound",
    back: "Return",
    direction: "Direction",
    severity: "Issue level",
    category: "Issue type",
    query: "Search route issues",
    clear: "Clear filters",
    noMatch: "No issues match these filters.",
    blocking: "Barrier",
    caution: "Needs attention",
    information: "Information",
    access: "Access",
    time: "Time",
    surface: "Surface",
    distance: "Distance",
    continuity: "Continuity",
    return: "Return route",
    supported: "Supported by supplied observations",
    conditional: "Conditional; some facts are UNKNOWN",
    blocked: "Reported barrier in the supplied route",
    sort: "Order options",
    original: "Original order",
    uncertainty: "Fewest unresolved segments",
    distanceSort: "Shortest stated distance",
    sourceSort: "Fewest distinct sources",
    compare: "Compare route options",
    explain: "Why this option differs",
    none: "No difference in the recorded criteria.",
    segment: "Segment",
    segmentStatus: "Recorded status",
    measuredDistance: "Stated distance",
    unknownDistance: "UNKNOWN distance",
    provenance: "Evidence source",
    dateUnavailable: "UNKNOWN date",
    notAdvice: "These are records about routes, not personal or medical recommendations. Check conditions before travelling.",
    save: "Save local review JSON",
    copy: "Copy review JSON",
    saved: "Local JSON is ready to copy or save on this device.",
    status: "Status",
  }),
  fr: Object.freeze({
    heading: "Observations et incertitudes du parcours",
    introduction: "Consultez les obstacles, les renseignements absents et les dates des sources. UNKNOWN ne signifie pas accessible.",
    review: "Consulter les observations du parcours",
    hide: "Masquer les détails",
    options: "Options",
    unresolved: "Éléments à examiner",
    sources: "Sources",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    tier: "Niveau des observations",
    unknown: "UNKNOWN",
    noIssues: "Aucun autre problème n’apparaît dans les données fournies. Cela ne décrit pas les conditions sur place.",
    noOptions: "Aucun parcours n’a été fourni.",
    missing: "Non fourni",
    all: "Tous",
    outbound: "Aller",
    back: "Retour",
    direction: "Direction",
    severity: "Niveau d’attention",
    category: "Type de problème",
    query: "Rechercher dans les observations",
    clear: "Effacer les filtres",
    noMatch: "Aucun élément ne correspond aux filtres.",
    blocking: "Obstacle",
    caution: "À examiner",
    information: "Information",
    access: "Accès",
    time: "Temps",
    surface: "Surface",
    distance: "Distance",
    continuity: "Continuité",
    return: "Parcours de retour",
    supported: "Soutenu par les observations fournies",
    conditional: "Conditionnel\u202f; certains renseignements restent UNKNOWN",
    blocked: "Obstacle signalé sur le parcours fourni",
    sort: "Trier les options",
    original: "Ordre initial",
    uncertainty: "Moins de segments incertains",
    distanceSort: "Distance indiquée la plus courte",
    sourceSort: "Moins de sources distinctes",
    compare: "Comparer les parcours",
    explain: "Différences entre ces options",
    none: "Aucune différence dans les critères consignés.",
    segment: "Segment",
    segmentStatus: "État consigné",
    measuredDistance: "Distance indiquée",
    unknownDistance: "Distance UNKNOWN",
    provenance: "Source de l’observation",
    dateUnavailable: "Date UNKNOWN",
    notAdvice: "Ces données portent sur les parcours, et non sur des recommandations personnelles ou médicales. Contrôlez les conditions avant le départ.",
    save: "Enregistrer le rapport JSON local",
    copy: "Copier le rapport JSON",
    saved: "Le rapport JSON local est prêt à copier ou à enregistrer sur cet appareil.",
    status: "État",
  }),
});

function copy(en: string, fr: string): Readonly<{ en: string; fr: string }> {
  return Object.freeze({ en, fr });
}

function stable(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function known(value: unknown): string {
  if (typeof value !== "string") return "UNKNOWN";
  const text = value.trim();
  if (!text || text.toUpperCase() === "UNKNOWN" || text.length > 300 ||
    SENSITIVE.test(text) || UNSAFE.test(text) || /\p{Cc}/u.test(text)) return "UNKNOWN";
  return text;
}

function knownDate(value: unknown): string {
  const text = known(value);
  if (text === "UNKNOWN") return text;
  const initial = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(initial)) return "UNKNOWN";
  const date = new Date(`${initial}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== initial ? "UNKNOWN" : initial;
}

function tier(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4 ? value : null;
}

function status(code: StepFreeStatus): EvidenceState {
  if (code === "step-free") return "YES";
  if (code === "not-step-free") return "NO";
  return "UNKNOWN";
}

function normalizedProvenance(value: Provenance): EvidenceSource {
  return Object.freeze({
    id: known(value.sourceId),
    licence: OPEN_LICENCES.has(known(value.licence)) ? known(value.licence) : "UNKNOWN",
    retrievedOn: knownDate(value.retrievedOn ?? value.retrievedAt),
    attribution: value.attribution ? known(value.attribution) : null,
    tier: tier(value.tier),
  });
}

function issue(
  direction: EvidenceRouteKind, legId: string, code: string, category: EvidenceCategory,
  severity: EvidenceSeverity, provenance: EvidenceSource, en: string, fr: string,
): EvidenceIssue {
  return Object.freeze({
    id: `${direction}:${legId}:${code}`,
    direction, legId, code, category, severity,
    sourceId: provenance.id,
    observedOn: provenance.retrievedOn,
    text: copy(en, fr),
  });
}

function inspectLeg(leg: Leg, direction: EvidenceRouteKind): EvidenceSegment {
  const source = normalizedProvenance(leg.provenance);
  const access = leg.stepFree.status === "step-free" && leg.stepFree.evidence.length === 0 ?
    "UNKNOWN" : status(leg.stepFree.status);
  const issues: EvidenceIssue[] = [];
  const add = (code: string, category: EvidenceCategory, severity: EvidenceSeverity, en: string, fr: string): void => {
    issues.push(issue(direction, leg.id, code, category, severity, source, en, fr));
  };
  if (leg.stepFree.status === "step-free" && leg.stepFree.evidence.length === 0) {
    add("EVIDENCE_MISSING", "access", "caution", "No cited observation supports the stated access value.",
      "Aucune observation citée ne soutient l’état de l’accès.");
  }
  if (access === "UNKNOWN") {
    add("ACCESS_UNKNOWN", "access", "caution", "Access status is UNKNOWN.", "L’état de l’accès reste UNKNOWN.");
  }
  if (access === "NO") {
    add("BARRIER_REPORTED", "access", "blocking", "A barrier is reported on this segment.", "Un obstacle est signalé sur ce segment.");
  }
  if (source.id === "UNKNOWN") {
    add("SOURCE_UNKNOWN", "source", "caution", "The source identifier is UNKNOWN.", "L’identifiant de la source reste UNKNOWN.");
  }
  if (source.licence === "UNKNOWN") {
    add("LICENCE_UNKNOWN", "source", "caution", "The source licence is UNKNOWN.", "La licence de la source reste UNKNOWN.");
  }
  if (source.retrievedOn === "UNKNOWN") {
    add("DATE_UNKNOWN", "time", "caution", "The source date is UNKNOWN.", "La date de la source reste UNKNOWN.");
  }
  if (source.tier === null) {
    add("TIER_UNKNOWN", "source", "caution", "The evidence tier is UNKNOWN.", "Le niveau des observations reste UNKNOWN.");
  }
  if (known(leg.surface) === "UNKNOWN") {
    add("SURFACE_UNKNOWN", "surface", "caution", "The surface information is UNKNOWN.", "Le revêtement reste UNKNOWN.");
  }
  if (known(leg.gradient) === "UNKNOWN") {
    add("GRADIENT_UNKNOWN", "surface", "caution", "The gradient information is UNKNOWN.", "La pente reste UNKNOWN.");
  }
  if (leg.distanceMetres === null || !Number.isFinite(leg.distanceMetres) || leg.distanceMetres < 0 || leg.distanceKind !== "route") {
    add("DISTANCE_UNCERTAIN", "distance", "information", "A complete routed distance was not supplied.", "La distance complète du parcours n’a pas été fournie.");
  }
  if (leg.singlePointOfFailure) {
    add("SINGLE_FAILURE", "continuity", "caution", "This segment is marked as a single point of failure.", "Ce segment est signalé comme point de défaillance unique.");
  }
  if (leg.timing === null && (leg.mode === "transit" || leg.mode === "intercity")) {
    add("SCHEDULE_UNKNOWN", "time", "caution", "A scheduled departure is UNKNOWN.", "L’heure de départ prévue reste UNKNOWN.");
  }
  if (leg.warnings.length) {
    for (let index = 0; index < leg.warnings.length; index++) {
      const warning = leg.warnings[index];
      if (!warning) continue;
      add(`WARNING_${index}`, "continuity", warning.beforeCommit ? "blocking" : "caution",
        `A warning is attached to this segment: ${known(warning.code)}.`,
        `Un avertissement accompagne ce segment\u00a0: ${known(warning.code)}.`);
    }
  }
  return Object.freeze({
    key: `${direction}:${leg.id}`, legId: leg.id, direction,
    title: known(leg.title), fromName: known(leg.fromName), toName: known(leg.toName),
    status: access, surface: known(leg.surface), gradient: known(leg.gradient),
    distanceMetres: leg.distanceKind === "route" && leg.distanceMetres !== null &&
      Number.isFinite(leg.distanceMetres) && leg.distanceMetres >= 0 ? leg.distanceMetres : null,
    sourceId: source.id, licence: source.licence, observedOn: source.retrievedOn,
    tier: source.tier, attribution: source.attribution,
    issues: Object.freeze(issues),
  });
}

export function routeStatus(segments: readonly EvidenceSegment[]): EvidenceOutcome {
  if (!segments.length) return "UNKNOWN";
  if (segments.some((part) => part.status === "NO")) return "blocked";
  if (segments.some((part) => part.issues.some((item) => item.severity === "blocking"))) return "blocked";
  if (segments.some((part) => part.status === "UNKNOWN" || part.issues.some((item) => item.severity === "caution"))) return "conditional";
  return "supported";
}

function sourceList(segments: readonly EvidenceSegment[]): readonly EvidenceSource[] {
  const found = new Map<string, EvidenceSource>();
  for (const segment of segments) {
    const source = Object.freeze({ id: segment.sourceId, licence: segment.licence,
      retrievedOn: segment.observedOn, tier: segment.tier, attribution: segment.attribution });
    const key = `${source.id}\u0000${source.licence}\u0000${source.retrievedOn}`;
    if (!found.has(key)) found.set(key, source);
  }
  return Object.freeze([...found.values()].sort((a, b) => stable(a.id, b.id) || stable(a.retrievedOn, b.retrievedOn)));
}

function inspectJourney(journey: Journey, blockedByPlanner: boolean): EvidenceOption {
  const outbound = Object.freeze(journey.legs.map((leg) => inspectLeg(leg, "outbound")));
  const back = Object.freeze(journey.returnJourney.legs.map((leg) => inspectLeg(leg, "return")));
  const segments = Object.freeze([...outbound, ...back]);
  const issues = Object.freeze(segments.flatMap((part) => part.issues).sort((a, b) => stable(a.id, b.id)));
  const roundTripStatus = routeStatus(segments);
  const outboundStatus = routeStatus(outbound);
  const finalStatus = blockedByPlanner || outboundStatus === "blocked" ? "blocked" :
    outboundStatus === "UNKNOWN" ? "UNKNOWN" :
    roundTripStatus !== "supported" ? "conditional" : "supported";
  const numbers = segments.map((segment) => segment.distanceMetres);
  const unresolvedMetres = numbers.some((number) => number === null);
  const metres = unresolvedMetres ? null : numbers.reduce<number>((sum, number) => sum + (number ?? 0), 0);
  return Object.freeze({
    id: journey.id, title: known(journey.summary), status: finalStatus,
    blockedByPlanner, roundTripStatus,
    segments, outbound, returnSegments: back, issues,
    totals: Object.freeze({
      blocking: issues.filter((item) => item.severity === "blocking").length,
      caution: issues.filter((item) => item.severity === "caution").length,
      information: issues.filter((item) => item.severity === "information").length,
      unknown: segments.filter((item) => item.status === "UNKNOWN").length,
      no: segments.filter((item) => item.status === "NO").length,
    }),
    sources: sourceList(segments), distanceMetres: metres, unresolvedMetres,
    explanation: known(journey.explanation),
  });
}

/** Builds the evidence dashboard without mutating the existing journey plan. */
export function buildRouteEvidence(plan: JourneyPlan): EvidenceDashboard {
  const options = Object.freeze([
    ...plan.journeys.map((journey) => inspectJourney(journey, false)),
    ...plan.blocked.map((journey) => inspectJourney(journey, true)),
  ]);
  const sources = new Set(options.flatMap((option) => option.sources.map((source) => source.id)));
  const issues = Object.freeze(options.flatMap((option) => option.issues));
  return Object.freeze({
    planId: plan.id, locale: plan.locale, generatedFrom: knownDate(plan.now),
    options, issues,
    summary: Object.freeze({
      options: options.length,
      supported: options.filter((option) => option.status === "supported").length,
      conditional: options.filter((option) => option.status === "conditional").length,
      blocked: options.filter((option) => option.status === "blocked").length,
      unknown: options.filter((option) => option.status === "UNKNOWN").length,
      sources: sources.size,
    }),
  });
}

export function filterEvidence(option: EvidenceOption, filters: EvidenceFilters): readonly EvidenceIssue[] {
  const term = filters.query.trim().toLocaleLowerCase();
  return Object.freeze(option.issues.filter((item) => {
    if (filters.direction !== "all" && item.direction !== filters.direction) return false;
    if (filters.severity !== "all" && item.severity !== filters.severity) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (!term) return true;
    const haystack = [item.code, item.legId, item.sourceId, item.text.en, item.text.fr].join(" ").toLocaleLowerCase();
    return haystack.includes(term);
  }));
}

export function sortedOptions(options: readonly EvidenceOption[], sort: EvidenceSort): readonly EvidenceOption[] {
  if (sort === "original") return Object.freeze([...options]);
  const result = [...options];
  if (sort === "uncertainty") {
    result.sort((a, b) => a.totals.unknown - b.totals.unknown || a.totals.caution - b.totals.caution || stable(a.id, b.id));
  } else if (sort === "distance") {
    result.sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity) || stable(a.id, b.id));
  } else {
    result.sort((a, b) => a.sources.length - b.sources.length || stable(a.id, b.id));
  }
  return Object.freeze(result);
}

export interface EvidenceDifference {
  readonly code: string;
  readonly valueA: string;
  readonly valueB: string;
  readonly label: Readonly<{ en: string; fr: string }>;
}

export function compareEvidenceOptions(a: EvidenceOption, b: EvidenceOption): readonly EvidenceDifference[] {
  const differences: EvidenceDifference[] = [];
  const measure = (code: string, valueA: string | number, valueB: string | number, en: string, fr: string): void => {
    if (valueA !== valueB) differences.push(Object.freeze({ code, valueA: String(valueA), valueB: String(valueB), label: copy(en, fr) }));
  };
  measure("status", a.status, b.status, "Recorded status", "État consigné");
  measure("unknown", a.totals.unknown, b.totals.unknown, "UNKNOWN segments", "Segments UNKNOWN");
  measure("barriers", a.totals.no, b.totals.no, "Reported barriers", "Obstacles signalés");
  measure("sources", a.sources.length, b.sources.length, "Distinct source records", "Sources distinctes");
  measure("cautions", a.totals.caution, b.totals.caution, "Open questions", "Points à examiner");
  measure("distance", a.distanceMetres ?? "UNKNOWN", b.distanceMetres ?? "UNKNOWN", "Stated distance (m)", "Distance indiquée (m)");
  measure("return", routeStatus(a.returnSegments), routeStatus(b.returnSegments), "Return route", "Parcours de retour");
  return Object.freeze(differences);
}

export function evidenceExport(dashboard: EvidenceDashboard): string {
  /** Only a derived local report is exported; raw plan input is not serialized. */
  return `${JSON.stringify({
    schemaVersion: 1,
    planId: dashboard.planId,
    asOf: dashboard.generatedFrom,
    summary: dashboard.summary,
    options: dashboard.options.map((option) => ({
      id: option.id, status: option.status, roundTripStatus: option.roundTripStatus,
      distanceMetres: option.distanceMetres, totals: option.totals,
      segments: option.segments.map((segment) => ({
        key: segment.key, legId: segment.legId, direction: segment.direction,
        status: segment.status, sourceId: segment.sourceId, licence: segment.licence,
        observedOn: segment.observedOn, tier: segment.tier,
      })),
      issues: option.issues.map((item) => ({
        code: item.code, legId: item.legId, direction: item.direction,
        sourceId: item.sourceId, observedOn: item.observedOn,
      })),
    })),
  }, null, 2)}\n`;
}
