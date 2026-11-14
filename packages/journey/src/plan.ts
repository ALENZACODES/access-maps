import type {
  FareRule,
  IntercityService,
  JourneyDataSource,
  ParatransitDirectoryEntry,
  ParkingBay,
  TransitTrip,
  TransferPoint,
} from "./catalog.js";
import { copy, displayValue, statusSentence } from "./explain.js";
import { formatMetres, haversineMetres, hoursBetween, isWinterDate, type Coord } from "./geo.js";
import { assertHonest } from "./invariants.js";
import { applyOffline } from "./offline.js";
import {
  provenanceFromField,
  readNumber,
  readString,
  UNKNOWN,
  type ImportedRecord,
} from "./records.js";
import { GraphRouter, type RouterAdapter, type RouterResult } from "./router.js";
import { barrier, claimFromTier, resolveStepFree, surveyComplete, unknownAssessment } from "./stepfree.js";
import { assessElevatorsAtStop } from "./elevators.js";
import { detectSystemEvents, systemEventWarning } from "./elevators.js";
import type {
  ChainLegId,
  ChainReport,
  ChainSlot,
  DestinationDepth,
  Endpoint,
  EquipmentProfile,
  FareLine,
  Journey,
  JourneyPlan,
  Leg,
  LegMode,
  Locale,
  Provenance,
  RoutingPreference,
  ScheduledTiming,
  StepFreeAssessment,
  Warning,
} from "./types.js";
import { DEFAULT_PROFILE } from "./types.js";
import {
  barriersForStop,
  buildWorld,
  elevatorsForStop,
  futureBarriersForStop,
  venueById,
  type RoutingWorld,
  type StopPoint,
} from "./world.js";

const SEARCH_RADIUS_METRES = 2_000;
const WASHROOM_RADIUS_METRES = 700;
const PARKING_RADIUS_METRES = 800;
const CHARGER_RADIUS_METRES = 250;
const ROLL_METRES_PER_SECOND = 1;

export interface PlanInput {
  data: JourneyDataSource;
  origin: Endpoint;
  destination: Endpoint;
  /** ISO-8601 departure. Result times are scheduled. */
  departAt: string;
  /** Clock for status age and season. Defaults to departAt. */
  now?: string;
  profile?: Partial<EquipmentProfile>;
  locale?: Locale;
  /** Defaults to true. Recorded barriers are listed under blocked, not offered as step-free. */
  stepFreeRequired?: boolean;
  /** Defaults to automatic November–April from `now`. */
  winterMode?: boolean | "auto";
  preference?: RoutingPreference;
  /** When true, status that depended on an elevator observation is not presented as current. */
  offline?: boolean;
  router?: RouterAdapter;
}

export function planJourney(input: PlanInput): JourneyPlan {
  const locale = input.locale ?? "en";
  const text = copy(locale);
  const profile: EquipmentProfile = { ...DEFAULT_PROFILE, ...input.profile };
  const stepFreeRequired = input.stepFreeRequired ?? true;
  const now = input.now ?? input.departAt;
  const winter =
    input.winterMode === true || (input.winterMode !== false && isWinterDate(now));
  const preference = input.preference ?? "fewest-transfers";
  const world = buildWorld(input.data, { winter, profile, now });
  const router = input.router ?? new GraphRouter(world.segments);
  const ids = createIds();
  const originVenue = venueById(world, input.origin.venueId);
  const destinationVenue = venueById(world, input.destination.venueId);

  const built: Journey[] = [];
  built.push(
    buildMovementJourney({
      ids,
      locale,
      profile,
      world,
      router,
      input,
      preference,
      now,
      winter,
      originVenue,
      destinationVenue,
      kind: "direct",
    }),
  );

  for (const chain of findTransitChains(world, input)) {
    built.push(
      buildMovementJourney({
        ids,
        locale,
        profile,
        world,
        router,
        input,
        preference,
        now,
        winter,
        originVenue,
        destinationVenue,
        kind: "transit",
        chain,
      }),
    );
  }

  for (const para of paratransitJourneys(world, originVenue, destinationVenue)) {
    built.push(
      buildParatransitJourney({
        ids,
        locale,
        profile,
        world,
        input,
        preference,
        now,
        originVenue,
        destinationVenue,
        para,
      }),
    );
  }

  for (const service of matchingIntercity(input)) {
    built.push(
      buildIntercityJourney({
        ids,
        locale,
        profile,
        world,
        input,
        preference,
        now,
        originVenue,
        destinationVenue,
        service,
      }),
    );
  }

  const ranked = rank(built, preference);
  const journeys: Journey[] = [];
  const blocked: Journey[] = [];
  for (const journey of ranked) {
    if (stepFreeRequired && hasBarrier(journey)) blocked.push(journey);
    else journeys.push(journey);
  }

  const events = detectSystemEvents(input.data.elevators ?? [], now);
  const systemPhones = [...new Set(events.flatMap((event) => event.phones))];
  const systemEvent =
    events.length > 0
      ? { text: text.systemEvent, phones: systemPhones }
      : null;
  if (systemEvent) {
    const eventWarning = systemEventWarning(locale, systemPhones);
    const affected = new Set(events.map((event) => event.networkId));
    const keep: Journey[] = [];
    for (const journey of journeys) {
      if (usesAffectedRail(journey, affected)) {
        journey.warnings = [...journey.warnings, eventWarning];
        blocked.push(journey);
      } else {
        keep.push(journey);
      }
    }
    journeys.splice(0, journeys.length, ...keep);
  }

  const warnings = collectPlanWarnings(journeys, blocked);
  const supplyNotes = (input.data.ridehail ?? []).map((note) => ({
    code: "wav-supply",
    beforeCommit: true,
    text: `${text.supply} ${note.summary}`.trim(),
    phones: note.taxis.map((taxi) => taxi.phone).filter((phone): phone is string => Boolean(phone)),
  }));

  const noGo = journeys.some(isUsableOption)
    ? null
    : {
        text: text.noGo,
        phones: [
          ...new Set(
            [...blocked, ...journeys].flatMap((journey) => journey.warnings.flatMap((warning) => warning.phones)),
          ),
        ],
      };

  let plan: JourneyPlan = {
    id: `${input.origin.id}->${input.destination.id}@${input.departAt}`,
    locale,
    departAt: input.departAt,
    now,
    preference,
    stepFreeRequired,
    winterMode: winter,
    journeys,
    blocked,
    warnings: systemEvent ? [systemEventWarning(locale, systemPhones), ...warnings] : warnings,
    systemEvent,
    noGo,
    supplyNotes,
    offline: null,
    emergency: { phone: "911", text: text.emergency },
  };
  assertHonest(plan, catalogPhrases(input));
  if (input.offline) {
    plan = applyOffline(plan, now);
    assertHonest(plan, catalogPhrases(input));
  }
  return plan;
}

interface BuildContext {
  ids: { next: () => string };
  locale: Locale;
  profile: EquipmentProfile;
  world: RoutingWorld;
  router?: RouterAdapter;
  input: PlanInput;
  preference: RoutingPreference;
  now: string;
  winter?: boolean;
  originVenue: ImportedRecord | undefined;
  destinationVenue: ImportedRecord | undefined;
}

function buildMovementJourney(
  ctx: BuildContext & {
    kind: "direct" | "transit";
    chain?: TransitOption[];
  },
): Journey {
  const text = copy(ctx.locale);
  const legs: Leg[] = [];
  legs.push(homeLeg(ctx));
  const chain = ctx.chain ?? [];
  if (ctx.kind === "direct" || chain.length === 0) {
    const rolled = routeBetween(ctx, ctx.input.origin, ctx.input.destination);
    legs.push(
      movementLeg(ctx, {
        mode: "approach",
        chainLeg: "approach",
        fromName: ctx.input.origin.name,
        toName: ctx.input.destination.name,
        from: ctx.input.origin,
        to: ctx.input.destination,
        result: rolled,
        title: heading(ctx.locale, "approach", ctx.input.origin.name, ctx.input.destination.name),
      }),
    );
  } else {
    const first = chain[0]!;
    const last = chain[chain.length - 1]!;
    const toStop = routeBetween(ctx, ctx.input.origin, first.board.coord);
    legs.push(
      movementLeg(ctx, {
        mode: "roll",
        chainLeg: "origin",
        fromName: ctx.input.origin.name,
        toName: first.board.name,
        from: ctx.input.origin,
        to: first.board.coord,
        result: toStop,
        title: heading(ctx.locale, "roll", ctx.input.origin.name, first.board.name),
      }),
    );
    chain.forEach((option, index) => {
      const previous = chain[index - 1];
      if (previous && previous.trip.agencyId !== option.trip.agencyId) {
        legs.push(handoffLeg(ctx, undefined));
      }
      if (!previous || previous.alight.id !== option.board.id) {
        legs.push(stationLeg(ctx, option.board));
      }
      legs.push(transitLeg(ctx, option));
      legs.push(stationLeg(ctx, option.alight));
    });
    const approach = routeBetween(ctx, last.alight.coord, ctx.input.destination);
    legs.push(
      movementLeg(ctx, {
        mode: "approach",
        chainLeg: "approach",
        fromName: last.alight.name,
        toName: ctx.input.destination.name,
        from: last.alight.coord,
        to: ctx.input.destination,
        result: approach,
        title: heading(ctx.locale, "approach", last.alight.name, ctx.input.destination.name),
      }),
    );
  }
  const depth = destinationDepth(ctx, ctx.input.destination, ctx.destinationVenue);
  legs.push(entranceLeg(ctx, depth));
  legs.push(interiorLeg(ctx));
  legs.push(washroomLeg(ctx, depth));
  legs.push(activityLeg(ctx));
  const fareSummary = fareLines(ctx, legs);
  const warnings = [
    ...legs.flatMap((leg) => leg.warnings),
    ...depthWarnings(ctx, depth),
    ...timingWarnings(ctx, legs),
    ...chargingWarnings(ctx, legs),
    ...fareWarnings(ctx, fareSummary),
  ];
  const returnJourney = buildReturn(ctx, legs, ctx.chain?.[0]);
  return finishJourney(ctx, legs, warnings, fareSummary, depth, returnJourney, ctx.kind === "direct" ? text.whyDirect : text.whyTransit);
}

function buildParatransitJourney(
  ctx: BuildContext & {
    para:
      | { kind: "single"; system: ParatransitDirectoryEntry }
      | { kind: "handoff"; from: ParatransitDirectoryEntry; to: ParatransitDirectoryEntry; transfer: TransferPoint | undefined };
  },
): Journey {
  const text = copy(ctx.locale);
  const legs: Leg[] = [homeLeg(ctx)];
  if (ctx.para.kind === "single") {
    legs.push(paratransitLeg(ctx, ctx.para.system, "booking"));
  } else {
    legs.push(paratransitLeg(ctx, ctx.para.from, "booking"));
    legs.push(handoffLeg(ctx, ctx.para.transfer));
    legs.push(paratransitLeg(ctx, ctx.para.to, "ride"));
  }
  const depth = destinationDepth(ctx, ctx.input.destination, ctx.destinationVenue);
  legs.push(entranceLeg(ctx, depth));
  legs.push(interiorLeg(ctx));
  legs.push(washroomLeg(ctx, depth));
  legs.push(activityLeg(ctx));
  const warnings = [
    ...legs.flatMap((leg) => leg.warnings),
    ...depthWarnings(ctx, depth),
    ...timingWarnings(ctx, legs),
  ];
  const returnJourney = buildReturn(ctx, legs, undefined);
  return finishJourney(ctx, legs, warnings, [], depth, returnJourney, text.whyPara);
}

function buildIntercityJourney(
  ctx: BuildContext & { service: IntercityService },
): Journey {
  const text = copy(ctx.locale);
  const service = ctx.service;
  const assistance = service.assistance;
  let assessment = unknownAssessment("no-evidence", [service.id], service.provenance.tier);
  const warnings: Warning[] = [];
  let note: string = text.whyIntercity;
  if (assistance) {
    const deadline = new Date(Date.parse(service.departure) - assistance.minimumNoticeHours * 3_600_000);
    const deadlineIso = Number.isNaN(deadline.getTime()) ? "UNKNOWN" : deadline.toISOString();
    const tooLate = Date.parse(ctx.now) > Date.parse(deadlineIso);
    note = text.assistanceLate(displayValue(ctx.locale, deadlineIso), assistance.phone);
    if (tooLate) {
      assessment = barrier("assistance-window", service.provenance.tier, [service.id, `deadline:${deadlineIso}`]);
    } else {
      assessment = unknownAssessment("assistance-required", [service.id, `deadline:${deadlineIso}`], service.provenance.tier);
    }
    warnings.push({
      code: "assistance-deadline",
      beforeCommit: true,
      text: note,
      phones: [assistance.phone],
    });
  }
  const leg = baseLeg(ctx, {
    mode: "intercity",
    chainLeg: "ride",
    title: heading(ctx.locale, "intercity", service.fromName, service.toName),
    fromName: service.fromName,
    toName: service.toName,
    from: service.from,
    to: service.to,
    stepFree: assessment,
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: scheduled(ctx.locale, service.departure, service.arrival),
    provenance: service.provenance,
    note,
    agencyId: service.agencyId,
    transitMode: "intercity",
    links: assistance
      ? [{ label: service.name, href: null, phone: assistance.phone }]
      : [],
    warnings,
  });
  const depth = destinationDepth(ctx, ctx.input.destination, ctx.destinationVenue);
  const legs = [homeLeg(ctx), leg, entranceLeg(ctx, depth), interiorLeg(ctx), washroomLeg(ctx, depth), activityLeg(ctx)];
  const returnJourney = buildReturn(ctx, legs, undefined);
  return finishJourney(
    ctx,
    legs,
    [...warnings, ...depthWarnings(ctx, depth), ...timingWarnings(ctx, legs)],
    [],
    depth,
    returnJourney,
    text.whyIntercity,
  );
}

function finishJourney(
  ctx: BuildContext,
  legs: Leg[],
  warnings: Warning[],
  fareSummary: FareLine[],
  depth: DestinationDepth,
  returnJourney: Journey["returnJourney"],
  why: string,
): Journey {
  const text = copy(ctx.locale);
  const chain = chainReport(ctx.locale, legs, returnJourney.legs, fareSummary);
  const presentedAsStepFree = fullyStepFree(legs);
  const roundTripStepFree = presentedAsStepFree && returnJourney.presentedAsStepFree;
  const weakestLeg = weakestLegOf(legs) ?? legs[0];
  const weakestText = text.weakest(weakestLeg?.title ?? text.unknown, weakestLeg?.note ?? text.noEvidence);
  const unknownTitles = legs
    .filter((leg) => leg.stepFree.status === "unknown")
    .map((leg) => leg.title);
  const explanation = [
    weakestText,
    why,
    unknownTitles.length > 0 ? `${text.unknown}: ${unknownTitles.join("; ")}` : "",
    legs.some((leg) => leg.stepFree.status === "step-free" && !leg.stepFree.appVerified) ? text.notAppVerified : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id: ctx.ids.next(),
    summary: legs.map((leg) => modeLabel(ctx.locale, leg.mode)).join(" → "),
    legs,
    explanation,
    weakestLink: { legId: weakestLeg?.id ?? "none", text: weakestText },
    chain,
    presentedAsStepFree,
    roundTripStepFree,
    depth,
    returnJourney,
    warnings: dedupeWarnings(warnings),
    fareSummary,
    preference: ctx.preference,
  };
}

function homeLeg(ctx: BuildContext): Leg {
  const text = copy(ctx.locale);
  const venue = ctx.originVenue;
  const assessment = venue ? placeAssessment(venue, false) : unknownAssessment("no-evidence");
  const provenance = provenanceFromField(venue?.fields.wheelchair ?? venue?.fields.name, text.homeUnknown);
  return baseLeg(ctx, {
    mode: "home-exit",
    chainLeg: "origin",
    title: heading(ctx.locale, "home-exit", ctx.input.origin.name, ctx.input.origin.name),
    fromName: ctx.input.origin.name,
    toName: ctx.input.origin.name,
    from: ctx.input.origin,
    to: ctx.input.origin,
    stepFree: assessment,
    distanceKind: "unknown",
    distanceMetres: null,
    surface: readString(venue, "surface"),
    gradient: readString(venue, "incline"),
    timing: null,
    provenance,
    note: assessment.status === "unknown" && assessment.reasons.includes("no-evidence") ? text.homeUnknown : placeNote(ctx.locale, venue),
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: [],
  });
}

function stationLeg(ctx: BuildContext, stop: StopPoint): Leg {
  const text = copy(ctx.locale);
  const snow = barriersForStop(ctx.world.source, stop.id, ctx.now);
  const elevators = elevatorsForStop(ctx.world.source, stop.id);
  let assessment: StepFreeAssessment;
  let note = "";
  let warnings: Warning[] = [];
  let spoF = false;
  let phones: string[] = [];
  let provenance = provenanceFromField(stop.record.fields.wheelchair_boarding, text.elevatorUnknown);
  if (snow.length > 0) {
    assessment = barrier("snow-blocked", snow[0]?.provenance.tier ?? null, snow.map((item) => item.id));
    const snowAge = hoursBetween(snow[0]?.observedAt ?? "", ctx.now);
    note = text.barrierRecorded(
      text.snowBlocked,
      snow[0]?.observedAt ?? text.unknown,
      snowAge === null ? text.unknown : String(Math.round(snowAge)),
    );
    provenance = snow[0]?.provenance ?? provenance;
  } else if (stop.boarding === "no") {
    assessment = barrier("boarding-not-accessible", stop.record.fields.wheelchair_boarding?.tier ?? 1, [
      `${stop.id}:boarding-2`,
    ]);
    note = text.boardingNo;
  } else if (elevators.length > 0) {
    const access = assessElevatorsAtStop(elevators, ctx.now, ctx.locale);
    assessment = access.assessment;
    note = access.note;
    warnings = access.warnings;
    spoF = access.singlePointOfFailure;
    phones = access.phones;
    provenance = access.provenance;
  } else {
    const noted = (ctx.world.source.stopAccess ?? []).find((item) => item.stopId === stop.id);
    if (noted?.status === "step-free" && noted.evidence) {
      const claim = claimFromTier(noted.provenance.tier, surveyComplete(noted.provenance.survey));
      assessment = {
        status: "step-free",
        appVerified: claim.appVerified,
        tier: noted.provenance.tier,
        reasons: [claim.reason],
        evidence: [noted.evidence],
      };
      note = noted.evidence;
      provenance = noted.provenance;
    } else if (noted?.status === "not-step-free") {
      assessment = barrier("blocked", noted.provenance.tier, [noted.evidence]);
      note = noted.evidence || text.noEvidence;
      provenance = noted.provenance;
    } else {
      const evidence = stop.boarding === "yes" ? [`${stop.id}:boarding-1`] : [];
      assessment = unknownAssessment(
        stop.boarding === "yes" ? "boarding-flag-is-not-a-path" : "elevator-unknown",
        evidence,
        stop.record.fields.wheelchair_boarding?.tier ?? null,
      );
      note = stop.boarding === "yes" ? text.boardingNotPath : text.elevatorUnknown;
    }
  }
  const futureReport = futureBarriersForStop(ctx.world.source, stop.id, ctx.now)[0];
  if (futureReport && assessment.status !== "not-step-free") {
    assessment = unknownAssessment(
      "barrier-future",
      [...assessment.evidence, `barrier-future:${futureReport.observedAt}`],
      futureReport.provenance.tier,
    );
    note = `${text.barrierFuture} ${note}`.trim();
    provenance = futureReport.provenance;
  }
  return baseLeg(ctx, {
    mode: "station-access",
    chainLeg: "ride",
    title: heading(ctx.locale, "station-access", stop.name, stop.name),
    fromName: stop.name,
    toName: stop.name,
    from: stop.coord,
    to: stop.coord,
    stepFree: assessment,
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: null,
    provenance,
    note,
    agencyId: null,
    transitMode: null,
    links: phones.map((phone) => ({ label: phone, href: null, phone })),
    warnings,
    singlePointOfFailure: spoF,
  });
}

function transitLeg(ctx: BuildContext, option: TransitOption): Leg {
  const trip = option.trip;
  const boardTime = option.trip.stopTimes[option.boardIndex];
  const alightTime = option.trip.stopTimes[option.alightIndex];
  let assessment: StepFreeAssessment;
  if (trip.wheelchairAccessible === "1") {
    assessment = {
      status: "step-free",
      appVerified: false,
      tier: trip.provenance.tier,
      reasons: ["operator-claim"],
      evidence: [`${trip.id}:wheelchair_accessible-1`],
    };
  } else if (trip.wheelchairAccessible === "2") {
    assessment = barrier("boarding-not-accessible", trip.provenance.tier, [`${trip.id}:wheelchair_accessible-2`]);
  } else {
    assessment = unknownAssessment("no-evidence", [`${trip.id}:wheelchair_accessible-unknown`], trip.provenance.tier);
  }
  const text = copy(ctx.locale);
  return baseLeg(ctx, {
    mode: "transit",
    chainLeg: "ride",
    title: heading(ctx.locale, "transit", option.board.name, option.alight.name),
    fromName: option.board.name,
    toName: option.alight.name,
    from: option.board.coord,
    to: option.alight.coord,
    stepFree: assessment,
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: scheduled(ctx.locale, boardTime?.departure ?? null, alightTime?.arrival ?? null),
    provenance: trip.provenance,
    note: `${trip.routeName}. ${text.notAppVerified}`,
    agencyId: trip.agencyId,
    transitMode: trip.mode,
    links: [],
    warnings: [],
  });
}

function movementLeg(
  ctx: BuildContext,
  spec: {
    mode: LegMode;
    chainLeg: ChainLegId;
    fromName: string;
    toName: string;
    from: Coord;
    to: Coord;
    result: RouterResult;
    title: string;
  },
): Leg {
  const text = copy(ctx.locale);
  const assessment =
    spec.result.kind === "straight-line"
      ? unknownAssessment("straight-line-only", spec.result.assessment.evidence)
      : spec.result.assessment;
  const distanceText =
    spec.result.distanceMetres === null
      ? text.unknown
      : formatMetres(spec.result.distanceMetres);
  const distanceSentence =
    spec.result.kind === "straight-line" ? text.straightLine(distanceText) : `${distanceText}.`;
  const barrierSentence = barrierClause(ctx.locale, assessment);
  return baseLeg(ctx, {
    mode: spec.mode,
    chainLeg: spec.chainLeg,
    title: spec.title,
    fromName: spec.fromName,
    toName: spec.toName,
    from: spec.from,
    to: spec.to,
    stepFree: assessment,
    distanceKind: spec.result.kind === "route" ? "route" : "straight-line",
    distanceMetres: spec.result.distanceMetres,
    surface: spec.result.surface,
    gradient: spec.result.gradient,
    timing: null,
    // The deciding path record (or barrier report), carried through the router. The router's id is
    // not a data source, and a straight-line gap has no record behind it.
    provenance:
      spec.result.kind === "route" && spec.result.provenance
        ? spec.result.provenance
        : emptyProvenance(ctx.now, distanceSentence),
    geometryAttribution: spec.result.kind === "route" ? spec.result.geometryAttribution : null,
    note: `${distanceSentence} ${text.surface(displayValue(ctx.locale, spec.result.surface))} ${text.gradient(displayValue(ctx.locale, spec.result.gradient))}${barrierSentence}`,
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: [],
  });
}

function entranceLeg(ctx: BuildContext, depth: DestinationDepth): Leg {
  return baseLeg(ctx, {
    mode: "entrance",
    chainLeg: "entrance",
    title: heading(ctx.locale, "entrance", ctx.input.destination.name, ctx.input.destination.name),
    fromName: ctx.input.destination.name,
    toName: ctx.input.destination.name,
    from: ctx.input.destination,
    to: ctx.input.destination,
    stepFree: entranceAssessment(ctx.destinationVenue),
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: readString(ctx.destinationVenue, "incline"),
    timing: null,
    provenance: depth.entrance.provenance,
    note: depth.entrance.text,
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: [],
  });
}

function interiorLeg(ctx: BuildContext): Leg {
  const text = copy(ctx.locale);
  return baseLeg(ctx, {
    mode: "interior",
    chainLeg: "interior",
    title: heading(ctx.locale, "interior", ctx.input.destination.name, ctx.input.destination.name),
    fromName: ctx.input.destination.name,
    toName: ctx.input.destination.name,
    from: ctx.input.destination,
    to: ctx.input.destination,
    stepFree: unknownAssessment("no-evidence"),
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: null,
    provenance: emptyProvenance(ctx.now, text.interiorUnknown),
    note: text.interiorUnknown,
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: [],
  });
}

function washroomLeg(ctx: BuildContext, depth: DestinationDepth): Leg {
  return baseLeg(ctx, {
    mode: "washroom",
    chainLeg: "washroom",
    title: heading(ctx.locale, "washroom", ctx.input.destination.name, ctx.input.destination.name),
    fromName: ctx.input.destination.name,
    toName: ctx.input.destination.name,
    from: ctx.input.destination,
    to: ctx.input.destination,
    stepFree: depth.washroom.usable
      ? washroomClaim(depth)
      : unknownAssessment("no-evidence"),
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: null,
    provenance: depth.washroom.provenance ?? emptyProvenance(ctx.now, depth.washroom.text),
    note: depth.washroom.text,
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: [],
  });
}

function activityLeg(ctx: BuildContext): Leg {
  const text = copy(ctx.locale);
  return baseLeg(ctx, {
    mode: "activity",
    chainLeg: "activity",
    title: heading(ctx.locale, "activity", ctx.input.destination.name, ctx.input.destination.name),
    fromName: ctx.input.destination.name,
    toName: ctx.input.destination.name,
    from: ctx.input.destination,
    to: ctx.input.destination,
    stepFree: unknownAssessment("no-evidence"),
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: null,
    provenance: emptyProvenance(ctx.now, text.activityUnknown),
    note: text.activityUnknown,
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: [],
  });
}

function paratransitLeg(ctx: BuildContext, system: ParatransitDirectoryEntry, chainLeg: ChainLegId): Leg {
  const text = copy(ctx.locale);
  const warnings: Warning[] = [];
  let note = `${text.paratransitLink} ${bookingSentence(ctx, system)}`;
  let assessment = unknownAssessment("no-evidence", [system.id], system.provenance.tier);
  if (system.weatherStatus?.state === "cancelled") {
    assessment = barrier("weather-cancelled", system.weatherStatus.provenance.tier, [system.id]);
    note = `${system.weatherStatus.summary} ${note}`;
    warnings.push({
      code: "weather-cancellation",
      beforeCommit: true,
      text: system.weatherStatus.summary,
      phones: system.phone ? [system.phone] : [],
    });
  }
  if (system.connectionLeadMinutes !== null) {
    note =
      ctx.locale === "fr"
        ? `${note} Correspondance : prévoir ${system.connectionLeadMinutes} minutes. Une correspondance manquée est un risque.`
        : `${note} Connection lead ${system.connectionLeadMinutes} minutes. A missed connection is a risk.`;
  }
  if (system.unscheduledStops === "not-permitted") {
    note =
      ctx.locale === "fr"
        ? `${note} Les arrêts non prévus ne sont pas permis par cet exploitant.`
        : `${note} Unscheduled stops are not permitted by this operator.`;
  }
  // The catalog has no booking-cutoff field. The departure time is not a deadline, so none is shown.
  note = `${note} ${text.bookingFacts(
    system.bookingWindowDays === null ? text.unknown : text.dayCount(system.bookingWindowDays),
    system.phone ? text.cutoffCall(system.phone) : text.cutoffNoPhone,
    system.pickupWindowMinutes === null ? text.unknown : text.minuteCount(system.pickupWindowMinutes),
    system.driverWaitMinutes === null ? text.unknown : text.minuteCount(system.driverWaitMinutes),
    system.noShowPolicy ?? text.unknown,
  )}`;
  if (!ctx.profile.registrations.includes(system.id)) {
    warnings.push({
      code: "registration-gap",
      beforeCommit: true,
      text: text.registrationGap(system.name),
      phones: system.phone ? [system.phone] : [],
    });
  }
  const duration = system.sharedRideMinutes;
  if (
    ctx.profile.maxMinutesBetweenWashrooms !== null &&
    duration !== null &&
    duration > ctx.profile.maxMinutesBetweenWashrooms
  ) {
    warnings.push({
      code: "washroom-interval",
      beforeCommit: true,
      text: text.timingOver,
      phones: [],
    });
  }
  if (
    ctx.profile.maxTravelMinutes !== null &&
    duration !== null &&
    duration > ctx.profile.maxTravelMinutes
  ) {
    warnings.push({
      code: "travel-time",
      beforeCommit: true,
      text: text.travelOver,
      phones: [],
    });
  }
  return baseLeg(ctx, {
    mode: "paratransit-info",
    chainLeg,
    title: heading(ctx.locale, "paratransit-info", system.name, ctx.input.destination.name),
    fromName: ctx.input.origin.name,
    toName: ctx.input.destination.name,
    from: ctx.input.origin,
    to: ctx.input.destination,
    stepFree: assessment,
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: null,
    provenance: system.provenance,
    note,
    agencyId: system.id,
    transitMode: "paratransit",
    links: [
      {
        label: system.name,
        href: system.portalUrl,
        phone: system.phone,
      },
    ],
    warnings,
  });
}

function handoffLeg(ctx: BuildContext, transfer: TransferPoint | undefined): Leg {
  const text = copy(ctx.locale);
  const unknownPoint = !transfer || transfer.shelter !== "yes" || transfer.washroom !== "yes" || transfer.stepFree !== "yes";
  const assessment =
    transfer?.stepFree === "no"
      ? barrier("blocked", transfer.provenance.tier, [transfer.id])
      : transfer?.stepFree === "yes"
        ? {
            status: "step-free" as const,
            appVerified: claimFromTier(transfer.provenance.tier, surveyComplete(transfer.provenance.survey)).appVerified,
            tier: transfer.provenance.tier,
            reasons: [claimFromTier(transfer.provenance.tier, surveyComplete(transfer.provenance.survey)).reason],
            evidence: [transfer.id],
          }
        : unknownAssessment("no-evidence", transfer ? [transfer.id] : []);
  return baseLeg(ctx, {
    mode: "handoff",
    chainLeg: "ride",
    title: heading(ctx.locale, "handoff", transfer?.name ?? text.unknown, transfer?.name ?? text.unknown),
    fromName: transfer?.name ?? "UNKNOWN",
    toName: transfer?.name ?? "UNKNOWN",
    from: ctx.input.origin,
    to: ctx.input.destination,
    stepFree: assessment,
    distanceKind: "unknown",
    distanceMetres: null,
    surface: "UNKNOWN",
    gradient: "UNKNOWN",
    timing: null,
    provenance: transfer?.provenance ?? emptyProvenance(ctx.now, text.handoffUnverified),
    note: unknownPoint ? text.handoffUnverified : `${transfer?.name}: shelter, washroom, step-free recorded.`,
    agencyId: null,
    transitMode: null,
    links: [],
    warnings: unknownPoint
      ? [{ code: "transfer-unverified", beforeCommit: true, text: text.handoffUnverified, phones: [] }]
      : [],
  });
}

function bookingSentence(ctx: BuildContext, system: ParatransitDirectoryEntry): string {
  const text = copy(ctx.locale);
  const phone = system.phone ?? text.unknown;
  if (system.bookingWindowDays === null) {
    return `${text.bookingUnknown} ${phone}.`;
  }
  const depart = Date.parse(ctx.input.departAt);
  const now = Date.parse(ctx.now);
  if (Number.isNaN(depart) || Number.isNaN(now)) return text.callNow(phone);
  const opens = depart - system.bookingWindowDays * 86_400_000;
  if (now < opens) return text.windowFuture(new Date(opens).toISOString(), phone);
  if (now > depart) return text.windowClosed(phone);
  const guarantee = system.guarantee === "no-guarantee" ? text.callNow(phone) : text.callNow(phone);
  return guarantee;
}

function destinationDepth(ctx: BuildContext, endpoint: Endpoint, venue: ImportedRecord | undefined): DestinationDepth {
  const text = copy(ctx.locale);
  const stepCount = readString(venue, "step_count");
  const ramp = readString(venue, "ramp");
  const doorWidth = readString(venue, "door_width");
  const entranceProvenance = provenanceFromField(venue?.fields.step_count ?? venue?.fields.wheelchair, text.unknown);
  const washroom = nearestRecord(ctx.world.source.washrooms, endpoint, WASHROOM_RADIUS_METRES);
  const washroomText = describeWashroom(ctx, washroom);
  const parking = nearestParking(ctx, endpoint);
  return {
    entrance: {
      text: `${text.entranceDepth(endpoint.name, displayValue(ctx.locale, stepCount), displayValue(ctx.locale, ramp), displayValue(ctx.locale, doorWidth))} ${entranceAssessment(venue).reasons.includes("entrance-not-measured") ? text.entranceNotMeasured : ""}`.trim(),
      stepCount,
      ramp,
      doorWidth,
      provenance: entranceProvenance,
    },
    washroom: washroomText,
    parking: parking ?? {
      text: text.parkingNone,
      provenance: null,
    },
  };
}

function describeWashroom(
  ctx: BuildContext,
  found: { record: ImportedRecord; metres: number } | null,
): DestinationDepth["washroom"] {
  const text = copy(ctx.locale);
  if (!found) {
    return {
      text: text.washroomNone,
      usable: false,
      transferSide: "UNKNOWN",
      adultChangeTable: "UNKNOWN",
      access: "UNKNOWN",
      provenance: null,
    };
  }
  const detail = (ctx.world.source.washroomDetails ?? []).find((item) => item.washroomId === found.record.id);
  const wheelchair = readString(found.record, "wheelchair");
  const adult = readString(found.record, "adult_changing_table");
  const access = readString(found.record, "access");
  const side = detail?.transferSide ?? null;
  const sideLabel = side ?? "UNKNOWN";
  const phone = readString(found.record, "website");
  let usable = wheelchair.toLowerCase() === "yes" && side !== null;
  let sentence: string = text.washroomUnverified;
  if (wheelchair.toLowerCase() !== "yes") {
    usable = false;
    sentence = text.washroomUnverified;
  } else if (side === null) {
    usable = false;
    sentence = text.washroomUnverified;
  } else if (
    ctx.profile.transferSide &&
    ctx.profile.transferSide !== "either" &&
    side !== "both" &&
    side !== ctx.profile.transferSide
  ) {
    usable = false;
    sentence = text.washroomTransfer;
  } else {
    usable = true;
    sentence = text.washroomFacts(displayValue(ctx.locale, readString(found.record, "name")), displayValue(ctx.locale, sideLabel), displayValue(ctx.locale, adult), displayValue(ctx.locale, access));
  }
  const phoneField = readString(found.record, "phone");
  const callPhone = phoneField === UNKNOWN ? phone : phoneField;
  if (!usable) {
    sentence = `${sentence} ${text.washroomFacts(displayValue(ctx.locale, readString(found.record, "name")), displayValue(ctx.locale, sideLabel), displayValue(ctx.locale, adult), displayValue(ctx.locale, access))} ${callPhone === UNKNOWN ? "" : callPhone}`.trim();
  }
  return {
    text: sentence,
    usable,
    transferSide: sideLabel,
    adultChangeTable: adult,
    access,
    provenance: detail?.provenance ?? provenanceFromField(found.record.fields.wheelchair, sentence),
  };
}

function nearestParking(ctx: BuildContext, endpoint: Endpoint): DestinationDepth["parking"] | null {
  const text = copy(ctx.locale);
  let best: { bay: ParkingBay; metres: number } | null = null;
  for (const bay of ctx.world.source.parking ?? []) {
    const metres = haversineMetres(endpoint, bay);
    if (metres > PARKING_RADIUS_METRES) continue;
    if (!best || metres < best.metres) best = { bay, metres };
  }
  if (!best) return null;
  const bay = best.bay;
  const van = bay.vanAccessible === null ? text.unknown : bay.vanAccessible ? text.yes : text.no;
  const distance = bay.distanceToEntranceMetres === null ? formatMetres(best.metres) : formatMetres(bay.distanceToEntranceMetres);
  return {
    text: text.parkingFacts(
      bay.name,
      van,
      bay.widthMm === null ? text.unknown : String(bay.widthMm),
      bay.aisleMm === null ? text.unknown : String(bay.aisleMm),
      text.paymentWord(bay.payment),
      distance,
      bay.reservationCutoff ?? text.unknown,
    ),
    provenance: bay.provenance,
  };
}

function depthWarnings(ctx: BuildContext, depth: DestinationDepth): Warning[] {
  const warnings: Warning[] = [];
  if (!depth.washroom.usable) {
    warnings.push({
      code: "washroom",
      beforeCommit: true,
      text: depth.washroom.text,
      phones: [],
    });
  }
  const parking = (ctx.world.source.parking ?? []).find((bay) => depth.parking.text.startsWith(bay.name));
  if (parking) {
    const text = copy(ctx.locale);
    if (parking.vanAccessible === false) {
      warnings.push({ code: "parking-van", beforeCommit: true, text: text.notVan, phones: [] });
    }
    if (parking.payment === "app-only" && !ctx.profile.hasSmartphone) {
      warnings.push({ code: "parking-app-only", beforeCommit: true, text: text.appOnly, phones: [] });
    }
    if (parking.reservationCutoff && Date.parse(ctx.now) > Date.parse(parking.reservationCutoff)) {
      warnings.push({
        code: "parking-cutoff",
        beforeCommit: true,
        text: text.reservationCutoff(parking.reservationCutoff),
        phones: parking.reservationPhone ? [parking.reservationPhone] : [],
      });
    }
  }
  return warnings;
}

function timingWarnings(ctx: BuildContext, legs: Leg[]): Warning[] {
  const text = copy(ctx.locale);
  const warnings: Warning[] = [];
  const limit = ctx.profile.maxMinutesBetweenWashrooms;
  const travelLimit = ctx.profile.maxTravelMinutes;
  let total = 0;
  let totalKnown = true;
  for (const leg of legs) {
    const minutes = legMinutes(leg);
    if (minutes === null) {
      if (limit !== null && (leg.mode === "transit" || leg.mode === "approach" || leg.mode === "roll" || leg.mode === "paratransit-info" || leg.mode === "intercity")) {
        warnings.push({ code: "duration-unknown", beforeCommit: true, text: text.durationUnknown, phones: [] });
      }
      totalKnown = false;
      continue;
    }
    total += minutes;
    if (limit !== null && minutes > limit) {
      warnings.push({ code: "washroom-interval", beforeCommit: true, text: text.timingOver, phones: [] });
    }
  }
  if (travelLimit !== null && totalKnown && total > travelLimit) {
    warnings.push({ code: "travel-time", beforeCommit: true, text: text.travelOver, phones: [] });
  }
  return warnings;
}

function chargingWarnings(ctx: BuildContext, legs: Leg[]): Warning[] {
  if (ctx.profile.chair !== "power" && ctx.profile.chair !== "scooter") return [];
  const text = copy(ctx.locale);
  const warnings: Warning[] = [];
  const points = [ctx.input.origin, ctx.input.destination, ...legs.map((leg) => leg.to)];
  const nearby = (ctx.world.source.chargers ?? []).some((charger) =>
    points.some((point) => haversineMetres(point, charger) <= CHARGER_RADIUS_METRES),
  );
  if (!nearby) {
    warnings.push({ code: "no-charger", beforeCommit: true, text: text.noCharger, phones: [] });
  }
  if (ctx.winter) {
    warnings.push({ code: "cold-range", beforeCommit: false, text: text.cold, phones: [] });
  }
  const routeMetres = legs.reduce((sum, leg) => sum + (leg.distanceKind === "route" ? leg.distanceMetres ?? 0 : 0), 0);
  if (ctx.profile.maxDistanceMetres !== null && routeMetres > ctx.profile.maxDistanceMetres) {
    warnings.push({ code: "distance-over", beforeCommit: true, text: text.travelOver, phones: [] });
  }
  const gradientsUnknown = legs.some(
    (leg) =>
      (leg.mode === "approach" || leg.mode === "roll") &&
      leg.gradient === "UNKNOWN" &&
      ctx.profile.maxGradePercent !== null,
  );
  if (gradientsUnknown) {
    warnings.push({ code: "grade-unknown", beforeCommit: true, text: text.gradeUnknown, phones: [] });
  }
  return warnings;
}

function fareLines(ctx: BuildContext, legs: Leg[]): FareLine[] {
  const rules = ctx.world.source.fares ?? [];
  const lines: FareLine[] = [];
  for (const leg of legs) {
    if (!leg.agencyId) continue;
    const rule = rules.find((item) => item.agencyId === leg.agencyId);
    if (!rule) continue;
    lines.push({
      legId: leg.id,
      agencyName: rule.agencyName,
      text: fareText(ctx.locale, rule),
      card: rule.card,
      supportPerson: rule.supportPerson,
    });
  }
  return lines;
}

function fareWarnings(ctx: BuildContext, lines: FareLine[]): Warning[] {
  if (!ctx.profile.needsSupportPerson || lines.length === 0) return [];
  const text = copy(ctx.locale);
  const warnings: Warning[] = [];
  const kinds = new Set(lines.map((line) => line.supportPerson));
  if (kinds.size > 1) {
    warnings.push({ code: "support-person-differs", beforeCommit: true, text: text.supportDiffers, phones: [] });
  }
  for (const line of lines) {
    if (line.supportPerson === "free-with-card" && line.card && !ctx.profile.cardsHeld.includes(line.card)) {
      warnings.push({ code: "card-missing", beforeCommit: true, text: text.cardMissing(line.card), phones: [] });
    }
  }
  return warnings;
}

function fareText(locale: Locale, rule: FareRule): string {
  const card = rule.card ?? copy(locale).unknown;
  const proof = rule.proof ?? copy(locale).unknown;
  if (locale === "fr") {
    return `${rule.agencyName}. Accompagnateur : ${rule.supportPerson}. Carte : ${card}. Preuve : ${proof}.`;
  }
  return `${rule.agencyName}. Support person: ${rule.supportPerson}. Card: ${card}. Proof: ${proof}.`;
}

function buildReturn(ctx: BuildContext, outbound: Leg[], option: TransitOption | undefined): Journey["returnJourney"] {
  const text = copy(ctx.locale);
  const returnOption = option ? findReturnOption(option, ctx.world.source.trips ?? []) : undefined;
  const legs = outbound.map((leg) => {
    if (leg.mode === "transit" && returnOption) {
      const board = returnOption.trip.stopTimes[returnOption.boardIndex];
      const alight = returnOption.trip.stopTimes[returnOption.alightIndex];
      return baseLeg(ctx, {
        ...leg,
        id: undefined,
        fromName: leg.toName,
        toName: leg.fromName,
        from: leg.to,
        to: leg.from,
        title: heading(ctx.locale, "transit", leg.toName, leg.fromName),
        timing: scheduled(ctx.locale, board?.departure ?? null, alight?.arrival ?? null),
        note: leg.note,
        provenance: returnOption.trip.provenance,
      });
    }
    if (leg.mode === "transit" || leg.mode === "intercity" || leg.mode === "paratransit-info") {
      return baseLeg(ctx, {
        ...leg,
        id: undefined,
        fromName: leg.toName,
        toName: leg.fromName,
        from: leg.to,
        to: leg.from,
        title: heading(ctx.locale, leg.mode, leg.toName, leg.fromName),
        timing: null,
        stepFree: unknownAssessment("no-return-trip", leg.stepFree.evidence, leg.stepFree.tier),
        note: `${text.returnNoTrip} ${leg.note}`,
      });
    }
    return baseLeg(ctx, {
      ...leg,
      id: undefined,
      fromName: leg.toName,
      toName: leg.fromName,
      from: leg.to,
      to: leg.from,
      title: heading(ctx.locale, leg.mode, leg.toName, leg.fromName),
    });
  });
  const depth = destinationDepth(ctx, ctx.input.origin, ctx.originVenue);
  const returnTransit = legs.find((leg) => leg.mode === "transit" && leg.timing);
  return {
    legs,
    explanation: returnTransit ? returnTransit.note : text.returnNoTrip,
    depth,
    presentedAsStepFree: fullyStepFree(legs),
  };
}

interface TransitOption {
  trip: TransitTrip;
  boardIndex: number;
  alightIndex: number;
  board: StopPoint;
  alight: StopPoint;
}

function findTransitChains(world: RoutingWorld, input: PlanInput): TransitOption[][] {
  const trips = world.source.trips ?? [];
  const nearOrigin: TransitOption[] = [];
  for (const trip of trips) {
    for (let i = 0; i < trip.stopTimes.length - 1; i += 1) {
      const boardId = trip.stopTimes[i]?.stopId;
      const board = boardId ? world.stops.get(boardId) : undefined;
      if (!board || haversineMetres(input.origin, board.coord) > SEARCH_RADIUS_METRES) continue;
      for (let j = i + 1; j < trip.stopTimes.length; j += 1) {
        const alightId = trip.stopTimes[j]?.stopId;
        const alight = alightId ? world.stops.get(alightId) : undefined;
        if (!alight) continue;
        nearOrigin.push({ trip, boardIndex: i, alightIndex: j, board, alight });
      }
    }
  }

  const chains: TransitOption[][] = [];
  const seen = new Set<string>();
  const push = (chain: TransitOption[]) => {
    const key = chain.map((option) => `${option.trip.id}:${option.boardIndex}:${option.alightIndex}`).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    chains.push(chain);
  };

  const extensions = (previous: TransitOption): TransitOption[] => {
    const found: TransitOption[] = [];
    for (const trip of trips) {
      if (trip.id === previous.trip.id || trip.agencyId === previous.trip.agencyId) continue;
      for (let i = 0; i < trip.stopTimes.length - 1; i += 1) {
        const boardId = trip.stopTimes[i]?.stopId;
        const board = boardId ? world.stops.get(boardId) : undefined;
        if (!board || haversineMetres(previous.alight.coord, board.coord) > 400) continue;
        for (let j = i + 1; j < trip.stopTimes.length; j += 1) {
          const alightId = trip.stopTimes[j]?.stopId;
          const alight = alightId ? world.stops.get(alightId) : undefined;
          if (!alight) continue;
          found.push({ trip, boardIndex: i, alightIndex: j, board, alight });
        }
      }
    }
    return found;
  };

  for (const first of nearOrigin) {
    if (haversineMetres(input.destination, first.alight.coord) <= SEARCH_RADIUS_METRES) push([first]);
    for (const second of extensions(first)) {
      if (haversineMetres(input.destination, second.alight.coord) <= SEARCH_RADIUS_METRES) push([first, second]);
      for (const third of extensions(second)) {
        if (haversineMetres(input.destination, third.alight.coord) <= SEARCH_RADIUS_METRES) push([first, second, third]);
      }
    }
  }
  return chains;
}

function findReturnOption(option: TransitOption, trips: TransitTrip[]): TransitOption | undefined {
  for (const trip of trips) {
    if (trip.routeId !== option.trip.routeId) continue;
    const boardIndex = trip.stopTimes.findIndex((stop) => stop.stopId === option.alight.id);
    const alightIndex = trip.stopTimes.findIndex((stop) => stop.stopId === option.board.id);
    if (boardIndex >= 0 && alightIndex > boardIndex) {
      return {
        trip,
        boardIndex,
        alightIndex,
        board: option.alight,
        alight: option.board,
      };
    }
  }
  return undefined;
}

function matchingIntercity(input: PlanInput): IntercityService[] {
  return (input.data.intercity ?? []).filter((service) => {
    return (
      haversineMetres(input.origin, service.from) <= SEARCH_RADIUS_METRES &&
      haversineMetres(input.destination, service.to) <= SEARCH_RADIUS_METRES
    );
  });
}

function paratransitJourneys(
  world: RoutingWorld,
  originVenue: ImportedRecord | undefined,
  destinationVenue: ImportedRecord | undefined,
): Array<
  | { kind: "single"; system: ParatransitDirectoryEntry }
  | { kind: "handoff"; from: ParatransitDirectoryEntry; to: ParatransitDirectoryEntry; transfer: TransferPoint | undefined }
> {
  const systems = world.source.paratransit ?? [];
  if (systems.length === 0) return [];
  const originRegion = originVenue?.region;
  const destRegion = destinationVenue?.region;
  if (originRegion && destRegion && originRegion !== destRegion) {
    const from = systems.find((system) => system.region === originRegion);
    const to = systems.find((system) => system.region === destRegion);
    if (from && to) {
      const transfer = (world.source.transfers ?? []).find(
        (point) => point.fromRegion === originRegion && point.toRegion === destRegion,
      );
      return [{ kind: "handoff", from, to, transfer }];
    }
  }
  const region = originRegion ?? destRegion;
  const matched = region ? systems.filter((system) => system.region === region) : systems;
  const chosen = matched.length > 0 ? matched : systems;
  return chosen.map((system) => ({ kind: "single" as const, system }));
}

function routeBetween(ctx: BuildContext, from: Coord, to: Coord): RouterResult {
  const router = ctx.router ?? new GraphRouter(ctx.world.segments);
  return router.route({ from, to, reportBarriers: true, locale: ctx.locale });
}

function placeAssessment(venue: ImportedRecord | undefined, winterDowngrade: boolean): StepFreeAssessment {
  if (!venue) return unknownAssessment("no-evidence");
  const steps = readNumber(venue, "step_count");
  const wheelchair = readString(venue, "wheelchair").toLowerCase();
  const ramp = readString(venue, "ramp").toLowerCase();
  return resolveStepFree({
    stairs: steps,
    wheelchair: wheelchair === "yes" ? "yes" : wheelchair === "no" ? "no" : "unknown",
    boarding: "unknown",
    ramp: ramp === "yes" ? "yes" : ramp === "no" ? "no" : "unknown",
    inclinePercent: null,
    widthMm: null,
    blocked: false,
    blockReason: null,
    winterDowngrade,
    tier: venue.fields.wheelchair?.tier ?? venue.fields.step_count?.tier ?? null,
    evidenceLabel: venue.id,
    surveyed: surveyComplete(venue.fields.wheelchair?.survey ?? venue.fields.step_count?.survey),
  });
}

function entranceAssessment(venue: ImportedRecord | undefined): StepFreeAssessment {
  if (!venue) return unknownAssessment("entrance-not-measured");
  const steps = readNumber(venue, "step_count");
  const door = readString(venue, "door_width");
  const wheelchair = readString(venue, "wheelchair").toLowerCase();
  const ramp = readString(venue, "ramp").toLowerCase();
  const tier = venue.fields.step_count?.tier ?? venue.fields.door_width?.tier ?? venue.fields.wheelchair?.tier ?? null;
  if (steps !== null && steps > 0) return barrier("stairs", tier, [venue.id, `steps:${steps}`]);
  if (wheelchair === "no") return barrier("wheelchair-no", tier, [venue.id, "wheelchair:no"]);
  const measured = steps !== null && door !== UNKNOWN;
  if (!measured) return unknownAssessment("entrance-not-measured", [venue.id], tier);
  return resolveStepFree({
    stairs: steps,
    wheelchair: wheelchair === "yes" ? "yes" : "unknown",
    boarding: "unknown",
    ramp: ramp === "yes" ? "yes" : ramp === "no" ? "no" : "unknown",
    inclinePercent: null,
    widthMm: null,
    blocked: false,
    blockReason: null,
    winterDowngrade: false,
    tier,
    evidenceLabel: venue.id,
    surveyed: surveyComplete(venue.fields.step_count?.survey ?? venue.fields.door_width?.survey),
  });
}

function placeNote(locale: Locale, venue: ImportedRecord | undefined): string {
  const text = copy(locale);
  if (!venue) return text.homeUnknown;
  return text.entranceDepth(readString(venue, "name"), readString(venue, "step_count"), readString(venue, "ramp"), readString(venue, "door_width"));
}

function chainReport(locale: Locale, legs: Leg[], returnLegs: Leg[], fares: FareLine[]): ChainReport {
  const text = copy(locale);
  const slots: ChainSlot[] = [
    slot(locale, "origin", legs.filter((leg) => leg.mode === "home-exit"), text.homeUnknown),
    slot(locale, "booking", legs.filter((leg) => leg.mode === "paratransit-info" || leg.mode === "intercity"), text.bookingUnknown),
    slot(locale, "ride", legs.filter((leg) => leg.mode === "transit" || leg.mode === "paratransit-info" || leg.mode === "intercity"), text.noEvidence),
    slot(locale, "approach", legs.filter((leg) => leg.mode === "approach"), text.noEvidence),
    slot(locale, "entrance", legs.filter((leg) => leg.mode === "entrance"), text.unknown),
    slot(locale, "interior", legs.filter((leg) => leg.mode === "interior"), text.interiorUnknown),
    slot(locale, "washroom", legs.filter((leg) => leg.mode === "washroom"), text.washroomNone),
    slot(locale, "activity", legs.filter((leg) => leg.mode === "activity"), text.activityUnknown),
    slot(locale, "return", returnLegs, text.returnNoTrip),
  ];
  const describedCount = slots.filter((item) => item.state === "described").length;
  const weakest = slots.find((item) => item.state === "failed") ?? slots.find((item) => item.state === "unknown") ?? slots[0]!;
  let fareState: ChainReport["fare"]["state"] = "unknown";
  let fareTextValue: string = text.fareUnknown;
  if (fares.length > 0) {
    const failed = fares.some((line) => line.supportPerson === "unknown");
    fareState = failed ? "unknown" : "described";
    fareTextValue = fares.map((line) => line.text).join(" ");
  }
  return {
    slots,
    describedCount,
    weakest: { id: weakest.id, text: weakest.text },
    fare: { state: fareState, text: fareTextValue },
    timing: {
      state: "described",
      text: text.durationUnknown,
    },
  };
}

function slot(locale: Locale, id: ChainLegId, legs: Leg[], fallback: string): ChainSlot {
  if (legs.length === 0) return { id, state: "unknown", text: fallback };
  const failed = legs.find((leg) => leg.stepFree.status === "not-step-free");
  if (failed) return { id, state: "failed", text: failed.note };
  const unknown = legs.find((leg) => leg.stepFree.status === "unknown");
  if (unknown) return { id, state: "unknown", text: unknown.note };
  return { id, state: "described", text: legs[0]?.note ?? fallback };
}

function legMinutes(leg: Leg): number | null {
  if (leg.timing?.departure && leg.timing.arrival) {
    return clockMinutes(leg.timing.departure, leg.timing.arrival);
  }
  if (leg.distanceKind === "route" && leg.distanceMetres !== null) {
    return leg.distanceMetres / ROLL_METRES_PER_SECOND / 60;
  }
  return null;
}

function clockMinutes(departure: string, arrival: string): number | null {
  const clock = /^(\d{2}):(\d{2})/;
  const from = clock.exec(departure);
  const to = clock.exec(arrival);
  if (from?.[1] && from[2] && to?.[1] && to[2]) {
    return Number(to[1]) * 60 + Number(to[2]) - (Number(from[1]) * 60 + Number(from[2]));
  }
  const delta = hoursBetween(departure, arrival);
  return delta === null ? null : delta * 60;
}

/** A straight-line gap is not a route the person can treat as usable. */
function isUsableOption(journey: Journey): boolean {
  return journey.legs.some((leg) => {
    if (leg.stepFree.status === "not-step-free") return false;
    if (leg.distanceKind === "route") return true;
    if (leg.mode === "transit" || leg.mode === "intercity" || leg.mode === "paratransit-info") return true;
    return false;
  });
}

function hasBarrier(journey: Journey): boolean {
  return journey.legs.some((leg) => leg.stepFree.status === "not-step-free");
}

function fullyStepFree(legs: Leg[]): boolean {
  return legs.length > 0 && legs.every((leg) => leg.stepFree.status === "step-free" && leg.stepFree.evidence.length > 0);
}

function weakestLegOf(legs: Leg[]): Leg | undefined {
  return legs.find((leg) => leg.stepFree.status === "not-step-free") ?? legs.find((leg) => leg.stepFree.status === "unknown");
}

function usesAffectedRail(journey: Journey, networks: Set<string>): boolean {
  return journey.legs.some(
    (leg) =>
      leg.mode === "transit" &&
      (leg.transitMode === "subway" || leg.transitMode === "rail") &&
      leg.agencyId !== null &&
      networks.has(leg.agencyId),
  );
}

function rank(journeys: Journey[], preference: RoutingPreference): Journey[] {
  const score = (journey: Journey): number => {
    if (preference === "fewest-transfers") {
      return journey.legs.filter((leg) => leg.mode === "transit").length;
    }
    if (preference === "shortest-distance") {
      const straight = journey.legs.some((leg) => leg.distanceKind === "straight-line") ? 10_000_000 : 0;
      return straight + journey.legs.reduce((sum, leg) => sum + (leg.distanceMetres ?? 0), 0);
    }
    if (preference === "lowest-slope") {
      const grades = journey.legs.map((leg) => {
        const match = leg.gradient.match(/-?\d+(\.\d+)?/);
        return match ? Math.abs(Number(match[0])) : 1_000;
      });
      return Math.max(...grades, 0);
    }
    if (preference === "washroom-aware") {
      return journey.depth.washroom.usable ? 0 : 1;
    }
    if (preference === "charging-aware") {
      return journey.warnings.some((warning) => warning.code === "no-charger") ? 1 : 0;
    }
    return 0;
  };
  return [...journeys].sort((a, b) => score(a) - score(b));
}

function collectPlanWarnings(journeys: Journey[], blocked: Journey[]): Warning[] {
  const pooled = [...journeys, ...blocked].flatMap((journey) => journey.warnings);
  return dedupeWarnings(pooled).filter((warning) => warning.beforeCommit || warning.code === "cold-range");
}

function nearestRecord(
  records: ImportedRecord[],
  endpoint: Coord,
  radius: number,
): { record: ImportedRecord; metres: number } | null {
  let best: { record: ImportedRecord; metres: number } | null = null;
  for (const record of records) {
    const coord = readCoordSafe(record);
    if (!coord) continue;
    const metres = haversineMetres(endpoint, coord);
    if (metres > radius) continue;
    if (!best || metres < best.metres) best = { record, metres };
  }
  return best;
}

function readCoordSafe(record: ImportedRecord): Coord | null {
  const lat = readNumber(record, "lat");
  const lon = readNumber(record, "lon");
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

function scheduled(locale: Locale, departure: string | null, arrival: string | null): ScheduledTiming {
  return {
    kind: "scheduled",
    departure,
    arrival,
    label: copy(locale).scheduled,
  };
}

function heading(locale: Locale, mode: LegMode, from: string, to: string): string {
  const labels: Record<LegMode, [string, string]> = {
    "home-exit": ["Home exit", "Sortie du domicile"],
    roll: ["Roll", "Déplacement"],
    approach: ["Approach", "Approche"],
    "station-access": ["Station access", "Accès à la station"],
    transit: ["Transit", "Transport"],
    entrance: ["Entrance", "Entrée"],
    interior: ["Interior", "Intérieur"],
    washroom: ["Washroom", "Toilettes"],
    activity: ["Activity", "Activité"],
    parking: ["Parking", "Stationnement"],
    "paratransit-info": ["Paratransit information", "Information sur le transport adapté"],
    intercity: ["Intercity", "Interurbain"],
    handoff: ["Transfer point", "Point de correspondance"],
    charging: ["Charging", "Charge"],
  };
  const pair = labels[mode];
  const label = locale === "fr" ? pair[1] : pair[0];
  return from === to ? `${label}: ${from}` : `${label}: ${from} → ${to}`;
}

interface LegInit {
  id?: string;
  mode: LegMode;
  chainLeg: ChainLegId;
  title: string;
  fromName: string;
  toName: string;
  from: Coord;
  to: Coord;
  stepFree: StepFreeAssessment;
  distanceMetres: number | null;
  distanceKind: Leg["distanceKind"];
  surface: string;
  gradient: string;
  timing: ScheduledTiming | null;
  provenance: Provenance;
  geometryAttribution?: string | null;
  note: string;
  warnings?: Warning[];
  singlePointOfFailure?: boolean;
  links?: Leg["links"];
  agencyId: string | null;
  transitMode: Leg["transitMode"];
}

function baseLeg(ctx: BuildContext, init: LegInit): Leg {
  const assessment =
    init.stepFree.status === "step-free" && init.stepFree.evidence.length === 0
      ? unknownAssessment("no-evidence")
      : init.stepFree;
  const straightBlocked =
    init.distanceKind === "straight-line" && assessment.status === "step-free"
      ? unknownAssessment("straight-line-only", assessment.evidence, assessment.tier)
      : assessment;
  return {
    id: init.id ?? ctx.ids.next(),
    chainLeg: init.chainLeg,
    mode: init.mode,
    title: init.title,
    fromName: init.fromName,
    toName: init.toName,
    from: init.from,
    to: init.to,
    stepFree: straightBlocked,
    distanceMetres: init.distanceMetres,
    distanceKind: init.distanceKind,
    surface: init.surface || "UNKNOWN",
    gradient: init.gradient || "UNKNOWN",
    timing: init.timing,
    provenance: init.provenance,
    geometryAttribution: init.geometryAttribution ?? null,
    note: init.note,
    warnings: init.warnings ?? [],
    singlePointOfFailure: init.singlePointOfFailure ?? false,
    links: init.links ?? [],
    agencyId: init.agencyId,
    transitMode: init.transitMode,
  };
}

function emptyProvenance(_now: string, note: string): Provenance {
  return {
    sourceId: UNKNOWN,
    licence: UNKNOWN,
    retrievedAt: UNKNOWN,
    tier: null,
    note,
  };
}

function modeLabel(locale: Locale, mode: LegMode): string {
  const headingText = heading(locale, mode, "a", "b");
  return headingText.split(":")[0] ?? mode;
}

function barrierClause(locale: Locale, assessment: StepFreeAssessment): string {
  const text = copy(locale);
  const observed = assessment.evidence.find((item) => item.startsWith("barrier-observed:"));
  if (!observed) {
    return assessment.reasons.includes("barrier-future") ? ` ${text.barrierFuture}` : "";
  }
  const age = assessment.evidence.find((item) => item.startsWith("barrier-age-hours:"));
  return ` ${text.barrierRecorded(
    statusSentence(locale, assessment),
    observed.slice("barrier-observed:".length),
    age ? age.slice("barrier-age-hours:".length) : text.unknown,
  )}`;
}

function washroomClaim(depth: DestinationDepth): StepFreeAssessment {
  const claim = claimFromTier(depth.washroom.provenance?.tier ?? null, surveyComplete(depth.washroom.provenance?.survey));
  return {
    status: "step-free",
    appVerified: claim.appVerified,
    tier: depth.washroom.provenance?.tier ?? null,
    reasons: [claim.reason],
    evidence: [depth.washroom.provenance?.sourceId ?? "washroom"],
  };
}

function catalogPhrases(input: PlanInput): string[] {
  const phrases = [input.origin.name, input.destination.name];
  for (const record of [...input.data.stops, ...input.data.paths, ...input.data.venues, ...input.data.washrooms]) {
    const name = record.fields.name?.value;
    if (typeof name === "string") phrases.push(name);
  }
  for (const asset of input.data.elevators ?? []) phrases.push(asset.name, asset.operatorName);
  for (const system of input.data.paratransit ?? []) phrases.push(system.name);
  for (const bay of input.data.parking ?? []) phrases.push(bay.name);
  for (const service of input.data.trips ?? []) phrases.push(service.routeName, service.agencyName);
  for (const service of input.data.intercity ?? []) phrases.push(service.name, service.fromName, service.toName);
  for (const note of input.data.ridehail ?? []) {
    phrases.push(note.summary);
    for (const taxi of note.taxis) {
      phrases.push(taxi.name);
      if (taxi.leadTimeNote) phrases.push(taxi.leadTimeNote);
    }
  }
  for (const rule of input.data.fares ?? []) phrases.push(rule.agencyName);
  for (const report of input.data.barriers ?? []) phrases.push(report.id);
  return phrases;
}

function createIds(): { next: () => string } {
  let n = 0;
  return {
    next: () => {
      n += 1;
      return `leg-${n}`;
    },
  };
}

function dedupeWarnings(warnings: Warning[]): Warning[] {
  const seen = new Set<string>();
  const result: Warning[] = [];
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(warning);
  }
  return result;
}
