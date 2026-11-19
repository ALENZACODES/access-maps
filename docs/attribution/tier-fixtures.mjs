/** Small, mutable test constructors, not production data. */
import { METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
export function record(overrides = {}) {
  return {
    id:'osm-record', name:'Map dataset', family:'osm',
    sourceUrl:'https://www.openstreetmap.org/copyright',
    licenceUrl:'https://opendatacommons.org/licenses/odbl/1-0/',
    licenceName:'Open Database License (ODbL) 1.0',
    sourceDate:'UNKNOWN', acquiredOn:'2026-11-01', termsReviewedOn:'2026-11-02',
    tier:'primary', permission:'YES', attribution:'© OpenStreetMap contributors',
    state:'included', evidenceUrl:'https://www.openstreetmap.org/copyright', notes:'',
    ...overrides,
  };
}
export function surface(overrides = {}) {
  return {
    id:'map-en', locale:'en', mode:'map', recordIds:['osm-record'], offline:'YES',
    targetPx:44, mapCredit:'YES', labelled:'YES', keyboard:'YES', publicationDate:'2026-11-03',
    ...overrides,
  };
}
export function ledger(overrides = {}) {
  return {schema:'attribution-tier-ledger/1', release:'release-one', records:[record()],surfaces:[surface()],...overrides};
}
export function auaRecord(overrides = {}) {
  return record({id:'aua-record',name:'Transit dataset',family:'metrolinx-aua',licenceName:'Metrolinx Access and Use Agreement',sourceUrl:'https://www.gotransit.com/en/partner-with-us/software-developers',licenceUrl:'https://www.gotransit.com/en/partner-with-us/software-developers',evidenceUrl:'https://www.gotransit.com/en/partner-with-us/software-developers',attribution:[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join('\n'),...overrides});
}
export function oglRecord(overrides = {}) {
  return record({id:'ogl-record',name:'Transit licence',family:'metrolinx-ogl',licenceName:'Open Government Licence - Ontario - Metrolinx',sourceUrl:'https://www.gotransit.com/en/partner-with-us/software-developers',licenceUrl:'https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf',evidenceUrl:'https://www.gotransit.com/en/partner-with-us/software-developers',attribution:METROLINX_OGL_NOTICE,...overrides});
}
export function ltcRecord(overrides = {}) {
  return record({id:'ltc-record',name:'Transit dataset',family:'ltc',sourceUrl:'https://www.londontransit.ca/open-data/',licenceUrl:'https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/',evidenceUrl:'https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/',licenceName:'LTC Open Data Terms of Use',attribution:'Data provided by London Transit Commission (LTC)',...overrides});
}
