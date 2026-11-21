import { parseTrace, UNKNOWN, OSM_CREDIT } from './trace-core.mjs';
import { buildTraceMatrix } from './trace-matrix.mjs';
import { auditTrace } from './trace-audit.mjs';

/** A local, deterministic export of what a publication view actually records. */
export const PACKET_SCHEMA = 'map-notice-surface-packet/1';
export const PACKET_LIMIT = 120;
const isUnknown = value => value === UNKNOWN || value === '' || value === undefined || value === null;
const compareId = (a, b) => a.id.localeCompare(b.id);
const copyFields = (record, fields) => Object.fromEntries(fields.map(field => [field, record[field]]));
const SOURCE_FIELDS = Object.freeze(['id','name','sourceUrl','licence','licenceUrl','retrievedOn','tier','credit','permission']);
const SURFACE_FIELDS = Object.freeze(['id','label','route','locale','mapShown','keyboard','screenReader','focusVisible','minimumTargetPx']);
const LAYER_FIELDS = Object.freeze(['id','label','mode','status','sourceIds','geometrySourceIds']);
const NOTICE_FIELDS = Object.freeze(['id','layerId','surfaceId','sourceId','locale','text','placement','visible','focusable','readable','observedOn']);

export class PacketError extends Error {
  constructor(code, message) { super(message); this.name = 'PacketError'; this.code = code; }
}
export function collectPackets(input, options = {}) {
  const trace = parseTrace(input);
  const selected = options.surfaceId ?? null;
  const includeHeld = options.includeHeld === true;
  if (selected !== null && (typeof selected !== 'string' || !trace.surfaces.some(s => s.id === selected))) {
    throw new PacketError('SURFACE_NOT_FOUND', 'The selected surface does not exist');
  }
  const rows = buildTraceMatrix(trace, {includedOnly: !includeHeld});
  const sourceById = new Map(trace.sources.map(s => [s.id, s]));
  const layerById = new Map(trace.layers.map(l => [l.id, l]));
  const surfaceById = new Map(trace.surfaces.map(s => [s.id, s]));
  const noticeById = new Map(trace.notices.map(n => [n.id, n]));
  const reported = auditTrace(trace);
  const packets = [];
  for (const surface of [...trace.surfaces].sort(compareId)) {
    if (selected !== null && surface.id !== selected) continue;
    const related = rows.filter(row => row.surfaceId === surface.id).sort((a,b) =>
      a.layerId.localeCompare(b.layerId) || a.sourceId.localeCompare(b.sourceId));
    if (!related.length && selected === null) continue;
    const items = related.map(row => {
      const source = sourceById.get(row.sourceId);
      const layer = layerById.get(row.layerId);
      const notice = row.noticeId === UNKNOWN ? null : noticeById.get(row.noticeId);
      const needsAdjacent = layer.geometrySourceIds.includes(source.id) && surface.mapShown === 'yes' &&
        (source.credit === OSM_CREDIT || /\bODbL\b/iu.test(source.licence));
      const gaps = [];
      if (isUnknown(source.sourceUrl)) gaps.push('SOURCE_URL_UNKNOWN');
      if (isUnknown(source.licence) || isUnknown(source.licenceUrl)) gaps.push('LICENCE_UNKNOWN');
      if (isUnknown(source.retrievedOn)) gaps.push('RETRIEVAL_UNKNOWN');
      if (isUnknown(source.tier)) gaps.push('TIER_UNKNOWN');
      if (source.permission !== 'yes') gaps.push('PERMISSION_UNKNOWN');
      if (!notice) gaps.push('NOTICE_MISSING');
      else {
        if (isUnknown(notice.text) || isUnknown(source.credit) || !notice.text.includes(source.credit)) gaps.push('CREDIT_MISSING');
        if (notice.visible !== 'yes') gaps.push('NOTICE_NOT_VISIBLE');
        if (notice.focusable !== 'yes') gaps.push('KEYBOARD_UNKNOWN');
        if (notice.readable !== 'yes') gaps.push('SCREEN_READER_UNKNOWN');
        if (isUnknown(notice.observedOn)) gaps.push('OBSERVATION_DATE_UNKNOWN');
        if (needsAdjacent && notice.placement !== 'adjacent') gaps.push('OSM_ADJACENCY');
      }
      return {layer:copyFields(layer,LAYER_FIELDS), source:copyFields(source,SOURCE_FIELDS),
        notice:notice ? copyFields(notice,NOTICE_FIELDS) : UNKNOWN,
        adjacencyRequired: needsAdjacent, gaps};
    });
    const found = reported.findings.filter(item => related.some(row =>
      item.path.includes(row.layerId) || item.path.includes(row.sourceId) || item.path.includes(row.noticeId)) ||
      item.path.includes(`surfaces.${surface.id}`));
    const gaps = [...new Set([...items.flatMap(item => item.gaps),
      ...(['keyboard','screenReader','focusVisible'].filter(k=>surface[k] !== 'yes').map(k=>`SURFACE_${k.toUpperCase()}`)),
      ...(surface.minimumTargetPx === UNKNOWN || surface.minimumTargetPx < 44 ? ['TARGET_UNKNOWN_OR_SMALL'] : []),
      ...(surface.route === UNKNOWN ? ['ROUTE_UNKNOWN'] : [])])].sort();
    packets.push({surface:copyFields(surfaceById.get(surface.id),SURFACE_FIELDS),
      creditPlacements:items, gapCodes:gaps, findingCount:found.length,
      status: gaps.length ? 'needs-attention' : 'recorded-review-only'});
    if (packets.length > PACKET_LIMIT) throw new PacketError('PACKET_LIMIT','Too many surface packets');
  }
  return {schema:PACKET_SCHEMA, title:trace.title, includesHeld:includeHeld,
    candidateSurfaceCount:packets.length, packets,
    explanation:'This is a record of supplied source evidence, not a claim about a place, licence permission or accessibility conformance.'};
}

export function packetJson(input, options = {}) { return `${JSON.stringify(collectPackets(input,options),null,2)}\n`; }
const COPY = Object.freeze({
  en: Object.freeze({title:'Map source and notice evidence',surface:'Display surface',path:'Local route',language:'Language',status:'Review status',source:'Source',layer:'Layer',licence:'Licence',sourceUrl:'Source URL',licenceUrl:'Licence URL',retrieved:'Retrieved on',tier:'Evidence tier',permission:'Redistribution permission',credit:'Credit text',notice:'Displayed notice',placement:'Notice location',observed:'Observed on',gaps:'Recorded gaps',empty:'No included map layers were supplied for this view.',warning:'These are records entered into the App. They do not establish that a place is accessible, that redistribution is permitted, or that an interface meets WCAG.',none:'None recorded'}),
  fr: Object.freeze({title:'Preuves de sources et de mentions cartographiques',surface:'Vue affichée',path:'Chemin local',language:'Langue',status:'État de l’examen',source:'Source',layer:'Couche',licence:'Licence',sourceUrl:'Adresse de la source',licenceUrl:'Adresse de la licence',retrieved:'Récupération le',tier:'Niveau de preuve',permission:'Autorisation de redistribution',credit:'Crédit',notice:'Mention affichée',placement:'Emplacement de la mention',observed:'Observation le',gaps:'Lacunes consignées',empty:'Aucune couche cartographique incluse pour cette vue.',warning:'Ces renseignements proviennent des registres saisis dans l’App. Ils ne démontrent ni l’accessibilité d’un lieu, ni une autorisation de redistribution, ni la conformité d’une interface aux WCAG.',none:'Aucune lacune consignée'}),
});
export function packetText(input, locale='en', options={}) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  const t = COPY[lang];
  const bundle = collectPackets(input,options);
  const sep = lang === 'fr' ? '\u00a0:' : ':';
  const lines = [t.title, '', bundle.title, t.warning, ''];
  if (bundle.packets.length === 0) lines.push(t.empty);
  for (const packet of bundle.packets) {
    const s = packet.surface;
    lines.push(`${t.surface}${sep} ${s.label} (${s.id})`,`${t.path}${sep} ${s.route}`,`${t.language}${sep} ${s.locale}`,`${t.status}${sep} ${packet.status}`);
    if (!packet.creditPlacements.length) lines.push(t.empty);
    for (const item of packet.creditPlacements) {
      const source = item.source;
      const notice = item.notice;
      lines.push('',`${t.layer}${sep} ${item.layer.label} (${item.layer.id})`,`${t.source}${sep} ${source.name} (${source.id})`,
        `${t.licence}${sep} ${source.licence}`,`${t.sourceUrl}${sep} ${source.sourceUrl}`,`${t.licenceUrl}${sep} ${source.licenceUrl}`,
        `${t.retrieved}${sep} ${source.retrievedOn}`,`${t.tier}${sep} ${source.tier}`,`${t.permission}${sep} ${source.permission}`,
        `${t.credit}${sep} ${source.credit}`,`${t.notice}${sep} ${notice === UNKNOWN ? UNKNOWN : notice.text}`,
        `${t.placement}${sep} ${notice === UNKNOWN ? UNKNOWN : notice.placement}`,
        `${t.observed}${sep} ${notice === UNKNOWN ? UNKNOWN : notice.observedOn}`,
        `${t.gaps}${sep} ${item.gaps.length ? item.gaps.join(', ') : t.none}`);
    }
    lines.push('',`${t.gaps}${sep} ${packet.gapCodes.length ? packet.gapCodes.join(', ') : t.none}`,'');
  }
  return `${lines.join('\n')}\n`;
}
