// @ts-check

/** @param {Uint8Array[]} parts */
export function concat(...parts) {
  const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let pos = 0;
  for (const part of parts) {
    bytes.set(part, pos);
    pos += part.length;
  }
  return bytes;
}

/** @param {number} n */
export function varint(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('integer');
  const result = [];
  for (; n > 127; n = Math.floor(n / 128)) result.push(n % 128 + 128);
  result.push(n);
  return Uint8Array.from(result);
}

/** @param {number} field @param {number} value */
export function numberField(field, value) {
  return concat(varint(field * 8), varint(value));
}

/** @param {number} field @param {Uint8Array} value */
export function bytesField(field, value) {
  return concat(varint(field * 8 + 2), varint(value.length), value);
}

/** @param {number} field @param {string} value */
export function textField(field, value) {
  return bytesField(field, new TextEncoder().encode(value));
}

/**
 * Construct a small tile in memory. Each supplied feature gets an independent
 * ID and a point geometry. Keys and values are shared by index per layer,
 * exactly as in a tile with repeated property values.
 * @typedef {Record<string,string|number|boolean>} ExampleFeature
 * @param {{name:string,features:ExampleFeature[]}[]} layers
 */
export function makeVectorTile(layers) {
  const payload = layers.map(layer => {
    /** @type {Map<string,number>} */
    const keys = new Map();
    /** @type {Map<string|number|boolean,number>} */
    const values = new Map();
    const messages = layer.features.map((feature, index) => {
      const tags = [];
      for (const [key, value] of Object.entries(feature)) {
        if (!keys.has(key)) keys.set(key, keys.size);
        if (!values.has(value)) values.set(value, values.size);
        tags.push(varint(/** @type {number} */ (keys.get(key))), varint(/** @type {number} */ (values.get(value))));
      }
      return bytesField(2, concat(
        numberField(1, index + 1),
        bytesField(2, concat(...tags)),
        numberField(3, 1),
        bytesField(4, Uint8Array.of(9, 0, 0)),
      ));
    });
    const names = [...keys.keys()].map(key => textField(3, key));
    const entries = [...values.keys()].map(value => bytesField(4,
      typeof value === 'string' ? textField(1, value) :
        typeof value === 'boolean' ? numberField(7, Number(value)) : numberField(5, value),
    ));
    return bytesField(3, concat(textField(1, layer.name), ...messages, ...names, ...entries, numberField(15, 2)));
  });
  return concat(...payload);
}
