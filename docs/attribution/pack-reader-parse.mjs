// @ts-check

/** Maximum size of the JSON input in UTF-8 bytes, including ignored fields. */
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

/** @typedef {'json'|'version'|'limit'|'format'} ReaderErrorCode */

export class PackReaderError extends Error {
  /** @param {ReaderErrorCode} code */
  constructor(code) {
    super(code);
    this.name = 'PackReaderError';
    this.code = code;
  }
}

/** @param {unknown} item @returns {Record<string, unknown>} */
export function object(item) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new PackReaderError('format');
  }
  return /** @type {Record<string, unknown>} */ (item);
}

/** @param {unknown} items @param {number} maximum @returns {unknown[]} */
export function list(items, maximum) {
  if (!Array.isArray(items)) throw new PackReaderError('format');
  if (items.length > maximum) throw new PackReaderError('limit');
  return items;
}

/**
 * JSON.parse accepts duplicate object keys and silently keeps the last value.
 * A source list or record count must have one interpretation. Scan the already
 * syntactically valid document with a bounded stack; decode escaped key names
 * before comparing them so that "\u0061" is the same key as "a".
 * @param {string} text
 */
function checkKeys(text) {
  /** @type {(Set<string> | null)[]} */
  const scopes = [];
  for (let i = 0; i < text.length; i++) {
    const symbol = text[i];
    if (symbol === '{' || symbol === '[') {
      if (scopes.length === 48) throw new PackReaderError('limit');
      scopes.push(symbol === '{' ? new Set() : null);
    } else if (symbol === '}' || symbol === ']') {
      scopes.pop();
    } else if (symbol === '"') {
      const start = i++;
      let escaped = false;
      while (text[i] !== '"') {
        if (text[i] === '\\') {
          escaped = true;
          i++;
        }
        i++;
      }
      const scope = scopes.at(-1);
      if (!scope) continue;
      let next = i + 1;
      while (next < text.length && text.charCodeAt(next) <= 32) next++;
      if (text[next] === ':') {
        const key = escaped
          ? /** @type {string} */ (JSON.parse(text.slice(start, i + 1)))
          : text.slice(start + 1, i);
        if (scope.has(key)) throw new PackReaderError('format');
        scope.add(key);
      }
    }
  }
}

/** @param {string} text @returns {Record<string, unknown>} */
export function readObject(text) {
  if (typeof text !== 'string') throw new PackReaderError('format');
  if (text.length > MAX_MANIFEST_BYTES || new TextEncoder().encode(text).length > MAX_MANIFEST_BYTES) {
    throw new PackReaderError('limit');
  }
  const json = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PackReaderError('json');
  }
  checkKeys(json);
  return object(parsed);
}

/** @param {unknown} value @returns {string} */
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,95}$/iu.test(value)
      || ['unknown', 'constructor', 'prototype'].includes(value.toLowerCase())) {
    throw new PackReaderError('format');
  }
  return value;
}

/** @param {unknown} value @returns {number} */
export function count(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PackReaderError('format');
  }
  return value;
}

/** @param {number} sum @param {number} amount */
export function add(sum, amount) {
  if (!Number.isSafeInteger(sum + amount)) throw new PackReaderError('limit');
  return sum + amount;
}

/** @param {unknown} value @returns {string} */
export function cellId(value) {
  const match = typeof value === 'string' && /^([ns])(\d{2,3}\.[05])_([ew])(\d{3}\.[05])$/u.exec(value);
  if (!match) throw new PackReaderError('format');
  const south = Number(match[2]) * (match[1] === 's' ? -1 : 1);
  const west = Number(match[4]) * (match[3] === 'w' ? -1 : 1);
  if (south < -90 || south >= 90 || west < -180 || west >= 180) throw new PackReaderError('format');
  return match[0];
}

/**
 * Copy only the single public descriptive field requested. Reject markup,
 * contact details, directional overrides and terms unsuitable for display.
 * Extra keys (including record contents and names of local files) never
 * become part of the presentation or export model.
 * @param {unknown} value @param {number} maximum
 */
export function publicField(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum) return 'UNKNOWN';
  const field = value.trim();
  if (!field || /^(?:unknown|inconnu[e]?|n\/?a|null|undefined|[-—])$/iu.test(field)) return 'UNKNOWN';
  if (/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(field) || /\S@\S/u.test(field)) return 'UNKNOWN';
  if (/\b(?:verify|verified|verifying|verification|AI|IA|partnerships?|guarantee\w*|endorse[ds]?|real[ -]time)\b|v[ée]rif|temps r[ée]el|partenariat|garanti(?:e|es|s)?\b/iu.test(field)) {
    return 'UNKNOWN';
  }
  return field;
}

/** v1 metadata dates are calendar dates. Do not substitute the build date. @param {unknown} value */
export function retrievalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return 'UNKNOWN';
  const epoch = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value ? value : 'UNKNOWN';
}

/**
 * Match the held transit provider by id or name. "Mississauga" alone also
 * occurs in published regional sources and is deliberately insufficient.
 * @param {unknown} value
 */
export function excluded(value) {
  if (typeof value !== 'string') return false;
  const compact = value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/gu, '');
  return compact.includes('miway') || compact.includes('mississaugatransit')
    || compact.includes('gtfsmississauga') || compact.includes('mississaugagtfs')
    || compact.includes('transitmississauga');
}
