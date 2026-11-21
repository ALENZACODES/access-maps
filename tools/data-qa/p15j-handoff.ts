/** Offline handoff packet audit: receipt provenance, publication rights, and access evidence. */
import {
  access, array, current, day, exact, finish, frenchText, held, identifier, integer,
  object, openLicence, pathLocal, printable, push, safeText, silo, stamp, stampKey,
  stampSilo, unique, type Access, type Finding, type Report, type Silo, type Stamp,
} from './p15j-core.js';

export interface Receipt {
  id: string;
  packetId: string;
  recordId: string;
  state: Access;
  capturedOn: string;
  sourceIds: string[];
  silo: Silo;
  noteEn: string;
  noteFr: string;
}
export interface Source extends Stamp { id: string; silo: Silo }
export interface HandoffRecord {
  id: string;
  status: Access;
  silo: Silo;
  sourceIds: string[];
  receiptIds: string[];
  labelEn: string;
  labelFr: string;
}
export interface Packet {
  id: string;
  generatedOn: string;
  status: 'DRAFT' | 'READY';
  recordIds: string[];
  previousId: string | null;
}
export interface HandoffTotals {
  readonly packets: number;
  readonly records: number;
  readonly sources: number;
  readonly receipts: number;
  readonly unknown: number;
  readonly unusedReceipts: number;
}
export type HandoffReport = Report<HandoffTotals>;
const WORDS = {
  ROOT: ['Handoff inventory has an invalid structure.', 'L’inventaire de transfert a une structure non valide.'],
  POLICY: ['Review date or maximum age is invalid.', 'La date de contrôle ou la durée maximale est non valide.'],
  PACKET: ['Packet fields are incomplete or unexpected.', 'Les champs du paquet sont incomplets ou inattendus.'],
  RECORD: ['Record fields are incomplete or unexpected.', 'Les champs de la fiche sont incomplets ou inattendus.'],
  RECEIPT: ['Receipt fields are incomplete or unexpected.', 'Les champs du reçu sont incomplets ou inattendus.'],
  SOURCE: ['A complete open-licence source is required.', 'Une source complète sous licence ouverte est requise.'],
  HELD: ['Held feed information must be excluded.', 'Les données du flux retenu doivent être exclues.'],
  DUPLICATE: ['An identifier or reference is duplicated.', 'Un identifiant ou une référence est en double.'],
  MISSING: ['Referenced item is absent.', 'L’élément référencé est absent.'],
  UNLINKED: ['An item is outside its declared packet.', 'Un élément est en dehors de son paquet déclaré.'],
  ORPHAN: ['Receipt does not support a published record.', 'Le reçu ne justifie aucune fiche publiée.'],
  SILO: ['Licence silo does not match all sources.', 'L’exportation de licence ne correspond pas à toutes les sources.'],
  ODBL: ['ODbL evidence must remain in the separate export.', 'Les données ODbL doivent rester dans l’exportation distincte.'],
  DATE: ['Source or receipt date is outside the review window.', 'La date de la source ou du reçu est hors de la période de contrôle.'],
  ORDER: ['Receipt date cannot precede source observation.', 'La date du reçu ne peut précéder celle de la source.'],
  PACKET_DATE: ['Packet date cannot precede a linked receipt.', 'La date du paquet ne peut précéder un reçu associé.'],
  CONFLICT: ['Conflicting access evidence must leave UNKNOWN.', 'Les observations contradictoires doivent conserver UNKNOWN.'],
  STATUS: ['Known access status requires matching current evidence.', 'Un état d’accès connu exige une observation récente correspondante.'],
  UNKNOWN: ['Unknown access must remain explicitly UNKNOWN.', 'Un accès inconnu doit rester explicitement UNKNOWN.'],
  TRANSLATION: ['English and French text are required and must be safe.', 'Les textes anglais et français sont requis et doivent être sûrs.'],
  GRAPH: ['Packet predecessor graph contains a cycle or missing item.', 'La chaîne des paquets contient une boucle ou un élément absent.'],
  FORWARD: ['Packet chronology cannot run backwards.', 'La chronologie des paquets ne peut pas reculer.'],
  UNUSED: ['Source has no published record.', 'La source ne figure dans aucune fiche publiée.'],
  LIMIT: ['Handoff inventory exceeds the supported size.', 'L’inventaire dépasse la taille prise en charge.'],
} as const;
const PACKET_KEYS = ['id', 'generatedOn', 'status', 'recordIds', 'previousId'];
const RECORD_KEYS = ['id', 'status', 'silo', 'sourceIds', 'receiptIds', 'labelEn', 'labelFr'];
const RECEIPT_KEYS = ['id', 'packetId', 'recordId', 'state', 'capturedOn', 'sourceIds', 'silo', 'noteEn', 'noteFr'];
const SOURCE_KEYS = ['id', 'source', 'licence', 'observedOn', 'reference', 'silo'];

function strings(value: unknown, max = 5000): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(identifier);
}
function parsePacket(value: unknown): value is Packet {
  return object(value) && exact(value, PACKET_KEYS) && identifier(value.id) &&
    day(value.generatedOn) !== null && (value.status === 'DRAFT' || value.status === 'READY') &&
    strings(value.recordIds) && (value.previousId === null || identifier(value.previousId));
}
function parseRecord(value: unknown): value is HandoffRecord {
  return object(value) && exact(value, RECORD_KEYS) && identifier(value.id) && access(value.status) &&
    silo(value.silo) && strings(value.sourceIds) && strings(value.receiptIds) &&
    safeText(value.labelEn) && frenchText(value.labelFr);
}
function parseSource(value: unknown): value is Source {
  return object(value) && exact(value, SOURCE_KEYS) && identifier(value.id) && silo(value.silo) &&
    stamp({ source: value.source, licence: value.licence,
      observedOn: value.observedOn, reference: value.reference });
}
function parseReceipt(value: unknown): value is Receipt {
  return object(value) && exact(value, RECEIPT_KEYS) && identifier(value.id) &&
    identifier(value.packetId) && identifier(value.recordId) && access(value.state) &&
    day(value.capturedOn) !== null && strings(value.sourceIds) && silo(value.silo) &&
    safeText(value.noteEn) && frenchText(value.noteFr);
}
function inWindow(observed: string, asOf: string, maxAge: number): boolean {
  return current(observed, asOf, maxAge);
}
function mapById<T extends { id: string }>(items: readonly T[], add: (code: "DUPLICATE", path: string) => void,
  collection: string): Map<string, T> {
  const map = new Map<string, T>();
  items.forEach((item, index) => {
    if (map.has(item.id)) add('DUPLICATE', `$.${collection}[${index}].id`);
    map.set(item.id, item);
  });
  return map;
}

/** Audit an untrusted, local JSON handoff inventory. Nothing is uploaded or changed. */
export function auditHandoff(input: unknown): HandoffReport {
  const findings: Finding[] = [];
  const add = (code: keyof typeof WORDS, path: string, severity: 'ERROR' | 'NOTICE' = 'ERROR'): void =>
    push(findings, WORDS, code, path, severity);
  const empty: HandoffTotals = { packets: 0, records: 0, sources: 0, receipts: 0, unknown: 0, unusedReceipts: 0 };
  if (!object(input) || !exact(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'packets', 'records', 'sources', 'receipts']) ||
      input.schemaVersion !== 1) {
    add('ROOT', '$');
    return finish(findings, empty);
  }
  if (day(input.asOf) === null || !integer(input.maxAgeDays, 0, 3650)) {
    add('POLICY', '$.asOf');
    return finish(findings, empty);
  }
  const packetsInput = array(input.packets);
  const recordsInput = array(input.records);
  const sourcesInput = array(input.sources);
  const receiptsInput = array(input.receipts);
  if (!packetsInput || !recordsInput || !sourcesInput || !receiptsInput ||
      packetsInput.length + recordsInput.length + sourcesInput.length + receiptsInput.length > 15000) {
    add('LIMIT', '$');
    return finish(findings, empty);
  }
  const packets: Packet[] = [];
  const records: HandoffRecord[] = [];
  const sources: Source[] = [];
  const receipts: Receipt[] = [];
  packetsInput.forEach((item, i) => {
    if (!parsePacket(item)) add('PACKET', `$.packets[${i}]`);
    else packets.push(item);
  });
  recordsInput.forEach((item, i) => {
    if (!parseRecord(item)) add('RECORD', `$.records[${i}]`);
    else records.push(item);
  });
  sourcesInput.forEach((item, i) => {
    if (!parseSource(item)) {
      add('SOURCE', `$.sources[${i}]`);
      if (object(item) && held(item.source)) add('HELD', `$.sources[${i}].source`);
    } else sources.push(item);
  });
  receiptsInput.forEach((item, i) => {
    if (!parseReceipt(item)) add('RECEIPT', `$.receipts[${i}]`);
    else receipts.push(item);
  });
  const totals: HandoffTotals = {
    packets: packetsInput.length, records: recordsInput.length,
    sources: sourcesInput.length, receipts: receiptsInput.length,
    unknown: records.filter(r => r.status === 'UNKNOWN').length, unusedReceipts: 0,
  };
  const byPacket = mapById(packets, add, 'packets');
  const byRecord = mapById(records, add, 'records');
  const bySource = mapById(sources, add, 'sources');
  const byReceipt = mapById(receipts, add, 'receipts');
  const usedReceipts = new Set<string>();
  const usedSources = new Set<string>();
  const ownedRecords = new Map<string, string>();
  packets.forEach((packet, i) => {
    const location = `$.packets[${i}]`;
    if (!unique(packet.recordIds)) add('DUPLICATE', `${location}.recordIds`);
    if (!inWindow(packet.generatedOn, input.asOf as string, input.maxAgeDays as number)) add('DATE', `${location}.generatedOn`);
    packet.recordIds.forEach((id, j) => {
      if (!byRecord.has(id)) add('MISSING', `${location}.recordIds[${j}]`);
      const owner = ownedRecords.get(id);
      if (owner && owner !== packet.id) add('UNLINKED', `${location}.recordIds[${j}]`);
      ownedRecords.set(id, packet.id);
    });
    const visited = new Set<string>();
    let walk: Packet | undefined = packet;
    while (walk) {
      if (visited.has(walk.id)) { add('GRAPH', `${location}.previousId`); break; }
      visited.add(walk.id);
      if (!walk.previousId) break;
      const parent: Packet | undefined = byPacket.get(walk.previousId);
      if (!parent) { add('GRAPH', `${location}.previousId`); break; }
      if ((day(parent.generatedOn) ?? Infinity) > (day(walk.generatedOn) ?? -Infinity)) {
        add('FORWARD', `${location}.previousId`);
        break;
      }
      walk = parent;
    }
  });
  sources.forEach((source, i) => {
    if (!inWindow(source.observedOn, input.asOf as string, input.maxAgeDays as number)) add('DATE', `$.sources[${i}].observedOn`);
    if (source.silo !== (source.licence === 'ODbL-1.0' ? 'odbl' : 'open')) add('SILO', `$.sources[${i}].silo`);
  });
  receipts.forEach((receipt, i) => {
    const path = `$.receipts[${i}]`;
    const packet = byPacket.get(receipt.packetId);
    const record = byRecord.get(receipt.recordId);
    if (!packet) add('MISSING', `${path}.packetId`);
    if (!record) add('MISSING', `${path}.recordId`);
    if (packet && !packet.recordIds.includes(receipt.recordId)) add('UNLINKED', `${path}.recordId`);
    if (packet && (day(receipt.capturedOn) ?? Infinity) > (day(packet.generatedOn) ?? -Infinity)) {
      add('PACKET_DATE', `${path}.capturedOn`);
    }
    if (!inWindow(receipt.capturedOn, input.asOf as string, input.maxAgeDays as number)) add('DATE', `${path}.capturedOn`);
    if (!unique(receipt.sourceIds) || receipt.sourceIds.length === 0) add('SOURCE', `${path}.sourceIds`);
    const linked: Source[] = [];
    receipt.sourceIds.forEach((id, j) => {
      const source = bySource.get(id);
      if (!source) add('MISSING', `${path}.sourceIds[${j}]`);
      else {
        linked.push(source);
        usedSources.add(id);
        if ((day(source.observedOn) ?? Infinity) > (day(receipt.capturedOn) ?? -Infinity)) {
          add('ORDER', `${path}.sourceIds[${j}]`);
        }
      }
    });
    if (linked.length && receipt.silo !== stampSilo(linked)) add('SILO', `${path}.silo`);
  });
  records.forEach((record, i) => {
    const path = `$.records[${i}]`;
    if (!ownedRecords.has(record.id)) add('UNLINKED', path);
    if (!unique(record.sourceIds) || !unique(record.receiptIds)) add('DUPLICATE', path);
    const linkedSources: Source[] = [];
    record.sourceIds.forEach((id, j) => {
      const source = bySource.get(id);
      if (!source) add('MISSING', `${path}.sourceIds[${j}]`);
      else { linkedSources.push(source); usedSources.add(id); }
    });
    if (linkedSources.length && stampSilo(linkedSources) !== record.silo) add('ODBL', `${path}.silo`);
    const support: Receipt[] = [];
    record.receiptIds.forEach((id, j) => {
      const receipt = byReceipt.get(id);
      if (!receipt) add('MISSING', `${path}.receiptIds[${j}]`);
      else {
        usedReceipts.add(receipt.id);
        if (receipt.recordId !== record.id || receipt.silo !== record.silo) {
          add('UNLINKED', `${path}.receiptIds[${j}]`);
        } else if (!receipt.sourceIds.every(sourceId => record.sourceIds.includes(sourceId))) {
          add('SOURCE', `${path}.receiptIds[${j}]`);
        } else support.push(receipt);
      }
    });
    if (record.status === 'YES' || record.status === 'NO') {
      const yes = support.some(r => r.state === 'YES');
      const no = support.some(r => r.state === 'NO');
      if (yes && no) add('CONFLICT', `${path}.status`);
      else if (!support.some(r => r.state === record.status)) add('STATUS', `${path}.status`);
    } else if (support.some(r => r.state === 'YES') && support.some(r => r.state === 'NO')) {
      // Explicit UNKNOWN is the safe result for conflicting observations.
    }
    if (record.status !== 'UNKNOWN' && support.length === 0) add('UNKNOWN', `${path}.status`);
  });
  let unused = 0;
  receipts.forEach((receipt, i) => {
    if (!usedReceipts.has(receipt.id)) { add('ORPHAN', `$.receipts[${i}]`); unused++; }
  });
  sources.forEach((source, i) => {
    if (!usedSources.has(source.id)) add('UNUSED', `$.sources[${i}]`, 'NOTICE');
  });
  return finish(findings, { ...totals, unusedReceipts: unused });
}
