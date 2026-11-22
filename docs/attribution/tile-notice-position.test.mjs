// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { latitudeLimit, tileAt, tileBounds, tileCenter, neighbor } from './tile-notice-position.mjs';

test('the world tile covers the projected world and includes both far edges', () => {
  assert.ok(Math.abs(latitudeLimit - 85.0511287798066) < 1e-12);
  assert.deepEqual(tileBounds(0, 0, 0), [-180, -latitudeLimit, 180, latitudeLimit]);
  for (const lon of [-180, 0, 180]) {
    for (const lat of [-latitudeLimit, 0, latitudeLimit]) {
      assert.deepEqual(tileAt(lon, lat, 0), {z: 0, x: 0, y: 0});
    }
  }
  assert.deepEqual(tileCenter(0, 0, 0), {lon: 0, lat: 0});
});

test('prime meridian and equator belong to the eastern, southern tile', () => {
  assert.deepEqual(tileAt(0, 0, 1), {z: 1, x: 1, y: 1});
  assert.deepEqual(tileAt(-0.001, 0.001, 1), {z: 1, x: 0, y: 0});
  assert.deepEqual(tileAt(-1e-16, 1e-16, 1), {z: 1, x: 0, y: 0});
  assert.deepEqual(tileAt(180, -latitudeLimit, 4), {z: 4, x: 15, y: 15});
  assert.deepEqual(tileAt(-180, latitudeLimit, 4), {z: 4, x: 0, y: 0});
});

test('uses geographic latitude of the projected centre at high latitudes', () => {
  const {lon, lat} = tileCenter(2, 0, 0);
  const [,south,,north] = tileBounds(2, 0, 0);
  assert.equal(lon, -135);
  assert.ok(Math.abs(lat - 79.17133464081945) < 1e-10);
  assert.ok(Math.abs((north + south) / 2 - lat) > 1);
});

test('every centre at small zooms returns to its tile', () => {
  for (let z = 0; z <= 5; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        const center = tileCenter(z, x, y);
        assert.deepEqual(tileAt(center.lon, center.lat, z), {z, x, y});
      }
    }
  }
});

test('interior boundaries select the same tile as the displayed extent', () => {
  for (const z of [2, 10, 19, 26]) {
    const size = 2 ** z;
    for (const y of [0, 1, size / 2, size - 2, size - 1]) {
      const x = size / 2;
      const [west,south,east,north] = tileBounds(z,x,y);
      assert.deepEqual(tileAt(west, north, z), {z,x,y});
      assert.deepEqual(tileAt(east, south, z), {z,x:x+1,y:Math.min(size-1,y+1)});
    }
  }
});

test('directional moves preserve zoom, and terminate at grid edges', () => {
  assert.deepEqual(neighbor(3,2,1,'west'), {z:3,x:1,y:1});
  assert.deepEqual(neighbor(3,2,1,'east'), {z:3,x:3,y:1});
  assert.deepEqual(neighbor(3,2,1,'north'), {z:3,x:2,y:0});
  assert.deepEqual(neighbor(3,2,1,'south'), {z:3,x:2,y:2});
  assert.equal(neighbor(3,0,1,'west'), null);
  assert.equal(neighbor(3,7,1,'east'), null);
  assert.equal(neighbor(3,1,0,'north'), null);
  assert.equal(neighbor(3,1,7,'south'), null);
});

test('unsupported locations produce a coordinate error before a file lookup', () => {
  for (const x of [NaN, Infinity, -181, 180.001]) assert.throws(() => tileAt(x,0,2), /coordinate/);
  for (const y of [NaN, -Infinity, -86, 90]) assert.throws(() => tileAt(0,y,2), /coordinate/);
  for (const z of [-1, 27, 1.5]) assert.throws(() => tileAt(0,0,z), /coordinate/);
  for (const index of [-1, 1.5, 2]) {
    assert.throws(() => tileBounds(1,index,0), /coordinate/);
    assert.throws(() => tileCenter(1,0,index), /coordinate/);
    assert.throws(() => neighbor(1,0,index,'east'), /coordinate/);
  }
});
