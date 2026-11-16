/** Test fixture builder. Never imported by production routes or packaged data. */
import { emptyRecord } from './provenance-core.mjs';
import { blankSurface } from './disclosure-core.mjs';
import { legalNotices } from './receipt-core.mjs';
import { METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, SOURCES } from './attribution-utils.mjs';

export function dataset(id = 'osmone', changes = {}) {
  return {
    ...emptyRecord(id),
    title: 'Public data', provider: 'osm', use: 'map', status: 'included',
    sourceName: 'OpenStreetMap', sourceUrl: SOURCES.osm.sourceUrl,
    licence: 'ODbL-1.0', licenceUrl: SOURCES.osm.licenceUrl,
    acquiredOn: '2026-10-01', datasetAsOf: 'UNKNOWN',
    termsReviewedOn: '2026-10-10', notice: SOURCES.osm.notices.en.join(' ') ,
    notes: '', containsOdbl: true, derivedFromOdbl: false,
    redistributionAllowed: true, ...changes,
  };
}
export function surface(id = 'mapone', changes = {}) {
  return {
    ...blankSurface(id), titleEn: 'Public map', titleFr: 'Carte publique',
    kind: 'map', state: 'included', path: '/map', delivery: 'offline',
    lastReviewedOn: '2026-10-10', sourceIds: ['osmone'],
    creditEn: SOURCES.osm.notices.en[0], creditFr: SOURCES.osm.notices.fr[0],
    noticeEn: `ODbL-1.0 ${SOURCES.osm.notices.en.join(' ') }`,
    noticeFr: `ODbL-1.0 ${SOURCES.osm.notices.fr.join(' ') }`,
    sourceDate: 'UNKNOWN', supportsKeyboard: 'yes',
    supportsScreenReader: 'yes', minimumTargetPx: 44,
    notesEn: '', notesFr: '', ...changes,
  };
}
export function release(records = [dataset()], surfaces = [surface()]) {
  return { inventory: { version: 1, records }, register: { version: 1, surfaces } };
}
export function withMetrolinx(licence = 'Metrolinx-AUA') {
  const record = dataset('goone', {
    provider: 'metrolinx', use: 'transit', sourceName: 'Metrolinx',
    sourceUrl: SOURCES.metrolinx.sourceUrl, licence,
    licenceUrl: SOURCES.metrolinx.licenceUrl, containsOdbl: false,
    notice: licence === 'Metrolinx-AUA' ? METROLINX_AUA_LEGEND : METROLINX_OGL_NOTICE,
  });
  const texts = legalNotices(record, 'en');
  const card = surface('gojourney', {
    kind: 'journey', path: '/journey', sourceIds: [record.id],
    creditEn: record.sourceName, creditFr: record.sourceName,
    noticeEn: `${licence} ${texts.join(' ')}`,
    noticeFr: `${licence} ${texts.join(' ')}`,
  });
  return release([record], [card]);
}
export function withLtc() {
  const record = dataset('ltcone', {
    provider: 'ltc', use: 'transit', sourceName: 'London Transit Commission',
    sourceUrl: SOURCES.ltc.sourceUrl, licence: 'LTC-Open-Data-Terms',
    licenceUrl: SOURCES.ltc.licenceUrl, notice: SOURCES.ltc.notices.en[0],
    containsOdbl: false,
  });
  const card = surface('ltcjourney', {
    kind: 'journey', path: '/journey', sourceIds: [record.id],
    creditEn: record.sourceName, creditFr: record.sourceName,
    noticeEn: `${record.licence} ${record.notice}`,
    noticeFr: `${record.licence} ${record.notice}`,
  });
  return release([record], [card]);
}
