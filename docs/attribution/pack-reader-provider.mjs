// @ts-check
import {
  METROLINX_AUA_LEGEND,
  METROLINX_OGL_NOTICE,
  SOURCES,
} from './attribution-utils.mjs';

// The v1 pack builder publishes both LTC availability statements together.
// Keep the split for HTML so a screen reader can select the voice for each.
export const LTC_AVAILABILITY_EN = 'Transit data is available from London Transit Commission under its Terms of Use.';
export const LTC_AVAILABILITY_FR =
  'Les données de transport en commun sont disponibles auprès de la Commission de transport de London : '
  + 'elles sont offertes aux termes de ses conditions d’utilisation.';

/** Compare against the metadata supplied by the v1 pack producer.
 * @param {string} id @returns {string | undefined} */
export function expectedPackNotice(id) {
  switch (id) {
    case 'osm':
    case 'osm-ontario':
      return SOURCES.osm.notices.en[0];
    case 'metrolinx-go':
    case 'metrolinx-up':
      return METROLINX_AUA_LEGEND + ' ' + METROLINX_OGL_NOTICE;
    case 'gtfs-ltc':
      return [LTC_AVAILABILITY_EN, LTC_AVAILABILITY_FR, SOURCES.ltc.licenceUrl].join(' ');
    default:
      return undefined;
  }
}

/**
 * A comparison to this repository's v1 source declaration. Use null if
 * there is no reference declaration or a field needed for comparison is
 * absent; a mismatch is an inventory finding, never a legal conclusion.
 * @param {string} id @param {unknown} licence @param {unknown} licenceUrl
 * @returns {boolean | null}
 */
export function packLicenceMatches(id, licence, licenceUrl) {
  if (typeof licence !== 'string' || !licence.trim() || licence === 'UNKNOWN'
      || typeof licenceUrl !== 'string' || !licenceUrl.trim() || licenceUrl === 'UNKNOWN') return null;
  switch (id) {
    case 'osm':
    case 'osm-ontario':
      return (licence === 'ODbL-1.0' || licence === SOURCES.osm.licence)
        && (licenceUrl === 'https://opendatacommons.org/licenses/odbl/1-0/' || licenceUrl === SOURCES.osm.licenceUrl);
    case 'metrolinx-go':
    case 'metrolinx-up':
      return licence === 'Metrolinx Access and Use Agreement (accepted 2026-11-15)'
        && licenceUrl === SOURCES.metrolinx.sourceUrl;
    case 'gtfs-ltc':
      return licence === SOURCES.ltc.licence && licenceUrl === SOURCES.ltc.licenceUrl;
    default:
      return null;
  }
}
