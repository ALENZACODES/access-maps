import { parsePlan, requiredNotices, OSM_CREDIT, UNKNOWN } from './placement-core.mjs';

/** An evidence gap is not evidence of an inaccessible place. */
export function auditPlacement(input, locale = 'en') {
  const plan = parsePlan(input);
  const findings = [];
  const record = (surface, sourceId, field, severity, code) => findings.push({ surfaceId: surface.id, sourceId, field, severity, code });
  for (const surface of plan.surfaces) {
    if (surface.route === UNKNOWN) record(surface, UNKNOWN, 'route', 'information', 'ROUTE_UNKNOWN');
    if (surface.uses.length === 0) record(surface, UNKNOWN, 'uses', 'information', 'NO_SOURCES_RECORDED');
    for (const use of surface.uses) {
      const add = (field, severity, code) => record(surface, use.sourceId, field, severity, code);
      if (use.source === UNKNOWN) add('source', 'block', 'SOURCE_UNKNOWN');
      if (use.licence === UNKNOWN) add('licence', 'block', 'LICENCE_UNKNOWN');
      if (use.retrievedOn === UNKNOWN) add('retrievedOn', 'block', 'RETRIEVAL_UNKNOWN');
      if (use.tier === UNKNOWN) add('tier', 'block', 'TIER_UNKNOWN');
      if (use.location === UNKNOWN || use.location === 'missing') add('location', 'block', 'LOCATION_MISSING');
      if (surface.mode === 'map' && use.sourceId === 'osm' && use.location !== 'near-content') {
        add('location', 'block', 'OSM_NEAR_MAP');
      }
      for (const notice of requiredNotices(use.sourceId, locale)) {
        if (use.credit === UNKNOWN || !use.credit.includes(notice)) add('credit', 'block', 'NOTICE_MISSING');
      }
      if (use.sourceId === 'osm' && !use.credit.includes(OSM_CREDIT)) add('credit', 'block', 'OSM_CREDIT_MISSING');
      if (use.licenceVisible !== 'yes') add('licenceVisible', 'block', 'LICENCE_LINK_UNKNOWN');
      if (use.keyboard !== 'yes') add('keyboard', 'block', 'KEYBOARD_UNKNOWN');
      if (use.screenReader !== 'yes') add('screenReader', 'block', 'SCREEN_READER_UNKNOWN');
      if (use.minTargetPx === UNKNOWN) add('minTargetPx', 'block', 'TARGET_UNKNOWN');
      else if (use.minTargetPx < 44) add('minTargetPx', 'block', 'TARGET_SMALL');
      if (use.notes === UNKNOWN) add('notes', 'information', 'NOTES_UNKNOWN');
    }
  }
  findings.sort((a, b) => a.surfaceId.localeCompare(b.surfaceId) || a.sourceId.localeCompare(b.sourceId) || a.code.localeCompare(b.code));
  return { schema: 'notice-placement-findings/1', surfaceCount: plan.surfaces.length,
    sourceUseCount: plan.surfaces.reduce((n, surface) => n + surface.uses.length, 0),
    blocked: findings.some((item) => item.severity === 'block'), findings };
}
export function auditSummary(result) {
  return { blocking: result.findings.filter((f) => f.severity === 'block').length,
    information: result.findings.filter((f) => f.severity === 'information').length };
}
