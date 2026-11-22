// @ts-check

/** @typedef {{z:number,x:number,y:number}} TilePosition */
/** @typedef {'west'|'east'|'north'|'south'} Direction */
/** @typedef {[number,number,number,number]} TileBounds */

const degrees = 180 / Math.PI;
export const latitudeLimit = Math.atan(Math.sinh(Math.PI)) * degrees;

/** @param {number} zoom */
function gridSize(zoom) {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 26) throw new RangeError('coordinate');
  return 2 ** zoom;
}

/** @param {number} z @param {number} x @param {number} y */
function checkPosition(z, x, y) {
  const size = gridSize(z);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= size || y < 0 || y >= size) {
    throw new RangeError('coordinate');
  }
  return size;
}

/** @param {number} row @param {number} size */
function northAt(row, size) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * row / size))) * degrees;
}

/**
 * Locate a point on the square tile grid. Interior boundaries belong to
 * the tile east or south of them. Include the outer world edges in the last
 * column and row. Reject latitudes outside the supported Mercator extent.
 * @param {number} lon
 * @param {number} lat
 * @param {number} z
 * @returns {TilePosition}
 */
export function tileAt(lon, lat, z) {
  const size = gridSize(z);
  if (!Number.isFinite(lon) || Math.abs(lon) > 180 ||
      !Number.isFinite(lat) || Math.abs(lat) > latitudeLimit) {
    throw new RangeError('coordinate');
  }
  let x = Math.min(size - 1, Math.floor((lon + 180) / 360 * size));
  // Adding 180 can round a point just west of a boundary onto that boundary.
  if (x > 0 && lon < 360 * x / size - 180) x--;
  else if (x + 1 < size && lon >= 360 * (x + 1) / size - 180) x++;
  const mercator = Math.asinh(Math.tan(lat / degrees));
  let y = Math.max(0, Math.min(size - 1, Math.floor((1 - mercator / Math.PI) * size / 2)));
  // A boundary transformed forward and back can differ by one rounding step.
  // Compare the latitude with the same boundary used by the display.
  if (y > 0 && lat > northAt(y, size)) y--;
  else if (y + 1 < size && lat <= northAt(y + 1, size)) y++;
  return {z, x, y};
}

/** @param {number} z @param {number} x @param {number} y @returns {TileBounds} */
export function tileBounds(z, x, y) {
  const size = checkPosition(z, x, y);
  const west = 360 * x / size - 180;
  const east = 360 * (x + 1) / size - 180;
  return [west, northAt(y + 1, size), east, northAt(y, size)];
}

/** @param {number} z @param {number} x @param {number} y */
export function tileCenter(z, x, y) {
  const size = checkPosition(z, x, y);
  return {lon: 360 * (x + 0.5) / size - 180, lat: northAt(y + 0.5, size)};
}

/** @param {number} z @param {number} x @param {number} y @param {Direction} direction @returns {TilePosition|null} */
export function neighbor(z, x, y, direction) {
  const size = checkPosition(z, x, y);
  switch (direction) {
    case 'west': return x > 0 ? {z, x: x - 1, y} : null;
    case 'east': return x + 1 < size ? {z, x: x + 1, y} : null;
    case 'north': return y > 0 ? {z, x, y: y - 1} : null;
    case 'south': return y + 1 < size ? {z, x, y: y + 1} : null;
    default: throw new RangeError('coordinate');
  }
}
