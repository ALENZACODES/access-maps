/** File-only, human-reviewed OSM and agency exports. No transport capability. */
export const OSM_HELP_URL = 'https://wiki.openstreetmap.org/wiki/JOSM/Guide';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors, ODbL';
export const ALLOWED_LICENCES = ['ODbL', 'OGL-Ontario', 'OGL-Canada', 'CC-BY', 'CC0'] as const;
export type Licence = (typeof ALLOWED_LICENCES)[number];
export type OsmType = 'node' | 'way' | 'relation';
export type FieldId =
  | 'wheelchair' | 'toilets_wheelchair' | 'door_width' | 'ramp' | 'kerb'
  | 'wheelchair_description_en' | 'wheelchair_description_fr';
export interface AccessibilityField {
  value: string | number | 'UNKNOWN';
  source_id: string;
  licence: Licence;
  retrieved_at: string;
  tier: 0 | 1 | 2 | 3;
  source_key?: string;
  raw?: unknown;
  derived?: unknown;
}
export interface OsmEdit {
  osmType: OsmType;
  osmId?: number;
  lat?: number;
  lon?: number;
  /** Entire current OSM tag snapshot, required for modify to prevent deletions. */
  existingTags?: Record<string, string>;
  tags: Partial<Record<FieldId, AccessibilityField>>;
  /** Explicit checkbox choices; only these fields are exported. */
  confirmedFields: FieldId[];
  /** Recorded by the calling UI after a person checks the source and selection. */
  personReviewed: boolean;
  comment: string;
}
export interface BarrierEvent {
  placeOrStopId: string;
  field: FieldId;
  fact: AccessibilityField;
  lastChecked: string;
  /** A short observation, not a request to act. */
  observation: string;
  personReviewed: boolean;
}
export interface Agency { name: string }
export interface AgencyReport { csv: string; text: string }

const OSM_KEYS: Record<FieldId, string> = {
  wheelchair: 'wheelchair',
  toilets_wheelchair: 'toilets:wheelchair',
  door_width: 'door:width',
  ramp: 'ramp',
  kerb: 'kerb',
  wheelchair_description_en: 'wheelchair:description:en',
  wheelchair_description_fr: 'wheelchair:description:fr',
};
const FIELD_IDS = Object.keys(OSM_KEYS) as FieldId[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const XML_ID = /^[1-9]\d*$/;
const ACCESS_VALUES = new Set(['yes', 'no', 'limited', 'designated']);
const RAMP_VALUES = new Set(['yes', 'no', 'separate', 'portable']);
const KERB_VALUES = new Set(['raised', 'lowered', 'flush', 'rolled', 'yes', 'no']);

function validDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function datePart(value: string): string {
  const date = value.slice(0, 10);
  if (!validDate(date) || (value.length > 10 && Number.isNaN(Date.parse(value)))) {
    throw new Error('Invalid source date');
  }
  return date;
}
function assertFact(fact: AccessibilityField, reviewed: boolean): string {
  if (!reviewed || !fact || fact.tier === 0 || ![1, 2, 3].includes(fact.tier)) {
    throw new Error('Unverified draft: human review required');
  }
  if (!fact.source_id?.trim() || !ALLOWED_LICENCES.includes(fact.licence)) {
    throw new Error('Source and confirmed open licence required');
  }
  datePart(fact.retrieved_at);
  const value = String(fact.value ?? '').trim();
  if (!value || value.toUpperCase() === 'UNKNOWN') {
    throw new Error('UNKNOWN cannot be exported as an access assertion');
  }
  return value;
}
function osmValue(id: FieldId, value: string): string {
  if (id === 'wheelchair' || id === 'toilets_wheelchair') {
    if (!ACCESS_VALUES.has(value)) throw new Error(`Invalid ${id} value`);
  } else if (id === 'ramp') {
    if (!RAMP_VALUES.has(value)) throw new Error('Invalid ramp value');
  } else if (id === 'kerb') {
    if (!KERB_VALUES.has(value)) throw new Error('Invalid kerb value');
  } else if (id === 'door_width') {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value) || Number(value) <= 0 || Number(value) > 20) {
      throw new Error('door:width must be a positive width in metres');
    }
  } else if (value.length > 255 || /[\u0000-\u001f]/.test(value)) {
    throw new Error('Description must be short, plain text');
  }
  return value;
}
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function safeComment(value: string): string {
  return value.replace(/[\u0000-\u001f]/g, ' ').replace(/--/g, '—').slice(0, 300);
}
function attrs(tags: Record<string, string>): string[] {
  return Object.entries(tags).sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, value]) => `    <tag k="${escapeXml(key)}" v="${escapeXml(value)}"/>`);
}
/** Returns only the tags that the person explicitly selected and reviewed. */
export function previewOsmTags(edit: OsmEdit): Record<string, string> {
  if (!edit.personReviewed) throw new Error('Human review required');
  const result: Record<string, string> = {};
  for (const id of edit.confirmedFields) {
    if (!FIELD_IDS.includes(id) || !edit.tags[id]) throw new Error('Unrecognised or absent field');
    const fact = edit.tags[id];
    if (!fact) throw new Error('Missing field');
    result[OSM_KEYS[id]] = osmValue(id, assertFact(fact, edit.personReviewed));
  }
  if (!Object.keys(result).length) throw new Error('Select at least one confirmed field');
  return result;
}
/** OSMChange v0.6; modifying requires full original tags to avoid erasing unrelated OSM data. */
export function toOsmChange(edits: OsmEdit[], date = new Date().toISOString().slice(0, 10)): string {
  if (!validDate(date) || !edits.length) throw new Error('Valid date and edits required');
  const sections: Record<'create' | 'modify', string[]> = { create: [], modify: [] };
  const ids = new Set<string>();
  let nextId = -1;
  for (const edit of edits) {
    if (!['node', 'way', 'relation'].includes(edit.osmType)) throw new Error('Invalid OSM type');
    const proposed = previewOsmTags(edit);
    if (edit.osmId === undefined) {
      const lat = edit.lat;
      const lon = edit.lon;
      if (edit.osmType !== 'node' || typeof lat !== 'number' || typeof lon !== 'number' ||
          !Number.isFinite(lat) || !Number.isFinite(lon) ||
          Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new Error('New points require valid coordinates');
      }
      const id = nextId--;
      const tags = { ...proposed, created_by: `the App (${date})` };
      sections.create.push(`  <node id="${id}" lat="${lat}" lon="${lon}">\n${attrs(tags).join('\n')}\n  </node>`);
    } else {
      if (!Number.isSafeInteger(edit.osmId) || !XML_ID.test(String(edit.osmId))) {
        throw new Error('Modify requires a positive OSM id');
      }
      if (!edit.existingTags || !Object.keys(edit.existingTags).length) {
        throw new Error('Modify requires the complete existing OSM tags');
      }
      const key = `${edit.osmType}:${edit.osmId}`;
      if (ids.has(key)) throw new Error('Duplicate object modification');
      ids.add(key);
      const nodeLat = edit.lat;
      const nodeLon = edit.lon;
      if (edit.osmType === 'node' && (typeof nodeLat !== 'number' || typeof nodeLon !== 'number' ||
          !Number.isFinite(nodeLat) || !Number.isFinite(nodeLon) ||
          Math.abs(nodeLat) > 90 || Math.abs(nodeLon) > 180)) {
        throw new Error('Existing node requires its original coordinates');
      }
      if (edit.osmType !== 'node') throw new Error('Way/relation geometry cannot be safely reconstructed here');
      const tags = { ...edit.existingTags, ...proposed };
      sections.modify.push(`  <node id="${edit.osmId}" lat="${edit.lat}" lon="${edit.lon}">\n${attrs(tags).join('\n')}\n  </node>`);
    }
  }
  const note = safeComment(edits.map((e) => e.comment).filter(Boolean).join('; '));
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<osmChange version="0.6" generator="the App">',
    `  <!-- ${escapeXml(`the App ${date}; ${OSM_ATTRIBUTION}; ${note}`)} -->`,
    ...(['create', 'modify'] as const).flatMap((action) => sections[action].length
      ? [`  <${action}>`, ...sections[action], `  </${action}>`] : []),
    '</osmChange>', ''].join('\n');
}
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
}
function plain(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();
}
/** Local export only. Agency name is a recipient label, never an endorsement. */
export function toAgencyReport(events: BarrierEvent[], agency: Agency): AgencyReport {
  if (!agency.name?.trim() || !events.length) throw new Error('Recipient and events required');
  const lines = ['place_or_stop_id,field,last_checked,source,licence,tier,fact'];
  const summaries: string[] = [];
  for (const event of events) {
    if (!event.placeOrStopId?.trim() || !FIELD_IDS.includes(event.field) || !event.observation?.trim()) {
      throw new Error('Place, field and observation required');
    }
    const value = assertFact(event.fact, event.personReviewed);
    const checked = datePart(event.lastChecked);
    const fact = plain(event.observation);
    if (fact.length > 300 || /\b(please|must|should|demand|veuillez|devez)\b/i.test(fact)) {
      throw new Error('Report a short observation, not a demand');
    }
    const fields = [event.placeOrStopId, OSM_KEYS[event.field], checked, event.fact.source_id,
      event.fact.licence, String(event.fact.tier), `${fact} (${value})`];
    lines.push(fields.map((item) => csvCell(plain(item))).join(','));
    summaries.push(`${plain(event.placeOrStopId)} — ${OSM_KEYS[event.field]}: ${fact} (${value}); ` +
      `last checked ${checked}; source ${plain(event.fact.source_id)}; ${event.fact.licence}; tier ${event.fact.tier}.`);
  }
  return { csv: `${lines.join('\r\n')}\r\n`,
    text: `Barrier observations for ${plain(agency.name)}\n` +
      `Prepared for a person to send; no affiliation or partnership is implied.\n\n${summaries.join('\n')}\n` };
}
