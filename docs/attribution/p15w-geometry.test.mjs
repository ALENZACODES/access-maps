import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ONTARIO_LIMITS, finite, point, inOntario, radians, distance, polyline, pathLength,
  bounds, insideBounds, azimuth, coordinateAt, closestOnSegment, closestOnPath,
  lengthGrade, geometryGrade, decimate, geometrySummary, routeBounds,
} from './p15w-geometry.mjs';
import { POSITIONS } from './p15w-fixtures.mjs';

const a = POSITIONS.alpha;
const b = POSITIONS.bravo;
const c = POSITIONS.charlie;
const d = POSITIONS.delta;

describe('P15W geometry intake', () => {
  it('publishes the configured Ontario coarse envelope', () => {
    assert.ok(ONTARIO_LIMITS.west < ONTARIO_LIMITS.east);
    assert.ok(ONTARIO_LIMITS.south < ONTARIO_LIMITS.north);
  });
  it('accepts real zero numeric quantities', () => assert.equal(finite(0), true));
  it('rejects a NaN number', () => assert.equal(finite(NaN), false));
  it('rejects both infinities', () => {
    assert.equal(finite(Infinity), false);
    assert.equal(finite(-Infinity), false);
  });
  it('rejects numeric strings', () => assert.equal(finite('3'), false));
  it('accepts a normal coordinate', () => assert.deepEqual(point(a), a));
  it('accepts the geographic origin', () => assert.deepEqual(point({ lat: 0, lon: 0 }), { lat: 0, lon: 0 }));
  it('rejects missing latitude', () => assert.equal(point({ lon: -80 }), null));
  it('rejects missing longitude', () => assert.equal(point({ lat: 43 }), null));
  it('rejects latitude outside range', () => assert.equal(point({ lat: 90.01, lon: 0 }), null));
  it('rejects longitude outside range', () => assert.equal(point({ lat: 0, lon: 180.01 }), null));
  it('rejects arrays as coordinates', () => assert.equal(point([43, -79]), null));
  it('rejects null input', () => assert.equal(point(null), null));
  it('rejects objects with NaN', () => assert.equal(point({ lat: NaN, lon: 0 }), null));
  it('identifies Toronto-area coordinates as in Ontario', () => assert.equal(inOntario(a), true));
  it('does not equate a different continent with Ontario', () => {
    assert.equal(inOntario({ lat: 10, lon: 20 }), false);
  });
  it('rejects a negative geographical margin', () => assert.equal(inOntario(a, -0.01), false));
  it('rejects a huge geographical margin', () => assert.equal(inOntario(a, 100), false));
  it('converts degrees to radians', () => assert.ok(Math.abs(radians(180) - Math.PI) < 1e-12));
  it('returns exactly zero between identical coordinates', () => assert.equal(distance(a, a), 0));
  it('measures a one-block journey as nonzero', () => assert.ok(distance(a, b) > 90));
  it('is symmetric in its geodesic distance', () => assert.ok(Math.abs(distance(a, b) - distance(b, a)) < 1e-9));
  it('returns null for missing endpoints', () => assert.equal(distance(null, b), null));
  it('keeps great-circle distances finite near the poles', () => {
    assert.ok(Number.isFinite(distance({ lat: 90, lon: 0 }, { lat: 90, lon: 180 })));
  });
  it('rejects a one-point polyline', () => assert.equal(polyline([a]), null));
  it('rejects an empty polyline', () => assert.equal(polyline([]), null));
  it('accepts a two-point polyline', () => assert.equal(polyline([a, b]).length, 2));
  it('rejects a malformed point in a polyline', () => assert.equal(polyline([a, null]), null));
  it('computes path length from consecutive segments', () => {
    assert.ok(Math.abs(pathLength([a, b, c]) - (distance(a, b) + distance(b, c))) < 1e-7);
  });
  it('does not skip repeated intermediate vertices', () => {
    assert.ok(Math.abs(pathLength([a, b, b, c]) - pathLength([a, b, c])) < 1e-7);
  });
  it('rejects too many vertices in a polyline', () => {
    assert.equal(polyline(Array.from({ length: 10001 }, () => a)), null);
  });
  it('computes north/south/west/east bounds', () => {
    assert.deepEqual(bounds([a, b, c, d]), { south: a.lat, north: c.lat, west: d.lon, east: a.lon });
  });
  it('rejects empty bounds', () => assert.equal(bounds([]), null));
  it('rejects bounds with invalid coordinates', () => assert.equal(bounds([a, {}]), null));
  it('detects points inside a bounding box', () => {
    assert.equal(insideBounds(a, bounds([a, c, d])), true);
  });
  it('detects outside points without margin', () => {
    assert.equal(insideBounds({ lat: 43.8, lon: -79.4 }, bounds([a, c])), false);
  });
  it('allows a declared margin around bounds', () => {
    assert.equal(insideBounds({ lat: 43.705, lon: -79.4 }, bounds([a, c]), 0.01), true);
  });
  it('rejects inverted geographic bounds', () => {
    assert.equal(insideBounds(a, { north: 0, south: 1, east: 1, west: 0 }), false);
  });
  it('provides a northbound bearing', () => assert.ok(azimuth(a, b) < 1));
  it('provides an eastbound bearing', () => {
    const bearing = azimuth(a, { lat: a.lat, lon: a.lon + 0.001 });
    assert.ok(Math.abs(bearing - 90) < 0.01);
  });
  it('returns null bearing for invalid input', () => assert.equal(azimuth({}, b), null));
  it('returns first coordinate at zero interpolation', () => assert.deepEqual(coordinateAt(a, b, 0), a));
  it('returns last coordinate at unit interpolation', () => assert.deepEqual(coordinateAt(a, b, 1), b));
  it('returns the midpoint at one-half interpolation', () => {
    const middle = coordinateAt(a, b, 0.5);
    assert.ok(Math.abs(middle.lat - (a.lat + b.lat) / 2) < 1e-12);
  });
  it('rejects extrapolation outside the segment', () => assert.equal(coordinateAt(a, b, 1.1), null));
  it('projects a point at the beginning of a segment', () => {
    const projected = closestOnSegment(a, a, b);
    assert.equal(projected.fraction, 0);
    assert.equal(projected.distanceMetres, 0);
  });
  it('projects a point at the end of a segment', () => {
    const projected = closestOnSegment(b, a, b);
    assert.equal(projected.fraction, 1);
  });
  it('clamps projections beyond the end', () => {
    const projected = closestOnSegment(c, a, b);
    assert.equal(projected.fraction, 1);
  });
  it('handles zero-length segment projections', () => {
    const projected = closestOnSegment(a, a, a);
    assert.equal(projected.fraction, 0);
  });
  it('finds a nearby projection on a long path', () => {
    const projected = closestOnPath(b, [a, b, c]);
    assert.ok(projected.distanceMetres < 0.01);
  });
  it('rejects malformed path projections', () => assert.equal(closestOnPath(b, [a]), null));
  it('computes percent grade on a rise', () => {
    assert.equal(lengthGrade(100, 8).percent, 8);
    assert.equal(lengthGrade(100, 8).direction, 'up');
  });
  it('computes percent grade on a descent', () => {
    assert.equal(lengthGrade(100, -8).direction, 'down');
  });
  it('indicates level grade', () => assert.equal(lengthGrade(100, 0).direction, 'level'));
  it('rejects grade over zero horizontal distance', () => assert.equal(lengthGrade(0, 8), null));
  it('computes maximum grade on a multi-segment path', () => {
    const result = geometryGrade([a, b, c], [0, 1, 10]);
    assert.ok(result.maximumPercent > 1);
    assert.equal(result.intervals.length, 2);
  });
  it('rejects height count mismatch', () => assert.equal(geometryGrade([a, b], [1]), null));
  it('rejects repeat-vertex grade', () => assert.equal(geometryGrade([a, a], [0, 2]), null));
  it('does not decimate a small path', () => assert.equal(decimate([a, b, c], 10).length, 3));
  it('preserves endpoints during decimation', () => {
    const result = decimate([a, b, c, d], 2);
    assert.deepEqual(result[0], a);
    assert.deepEqual(result.at(-1), d);
  });
  it('rejects decimation to one point', () => assert.equal(decimate([a, b], 1), null));
  it('returns a complete geometry summary', () => {
    const result = geometrySummary([a, b, c]);
    assert.equal(result.bearings.length, 2);
    assert.ok(result.lengthMetres > 190);
    assert.deepEqual(result.start, a);
    assert.deepEqual(result.end, c);
  });
  it('combines route bounds from multiple paths', () => {
    assert.deepEqual(routeBounds([[a, b], [b, c, d]]), bounds([a, b, c, d]));
  });
  it('rejects malformed combined route geometry', () => {
    assert.equal(routeBounds([[a, b], [null, c]]), null);
  });
});
