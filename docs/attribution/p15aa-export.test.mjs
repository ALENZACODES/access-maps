import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checksum } from './p15aa-contract.mjs';
import { parseEvidenceRegister } from './p15aa-intake.mjs';
import {
  validateBytesByPath, exportEvidenceSubset, exportRouteEvidence,
  validateReceipt, compareExportManifests, inventoryByLicence,
  listMissingDependencies, localExportDescriptor,
} from './p15aa-export.mjs';
import {
  register, withAsset, withOdbl, routeRequest, bytes, bytesMap, copy,
} from './p15aa-fixtures.mjs';

const parsed = (value) => parseEvidenceRegister(value).value;

describe('P15AA export: actual bytes, complete dependencies and no uploads', () => {
  it('checks the actual bytes of every declared asset', () => {
    const result = validateBytesByPath(parsed(withAsset()), bytesMap());
    assert.equal(result.ok, true);
    assert.equal(result.value.length, 1);
    assert.equal(result.summary.totalBytes, bytes('map').length);
  });
  it('rejects undeclared bytes', () => {
    const result = validateBytesByPath(parsed(register()), bytesMap());
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'REFERENCE'));
  });
  it('rejects missing bytes for a declared asset', () => {
    const result = validateBytesByPath(parsed(withAsset()), new Map());
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('rejects altered asset content of the same size', () => {
    const result = validateBytesByPath(parsed(withAsset()), bytesMap('abc'));
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'HASH'));
  });
  it('rejects altered asset size', () => {
    const result = validateBytesByPath(parsed(withAsset()), bytesMap('changed content'));
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'ASSET'));
  });
  it('rejects invalid byte containers', () => {
    const result = validateBytesByPath(parsed(withAsset()), {});
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('rejects byte maps containing unsafe file paths', () => {
    const value = bytesMap();
    value.set('../elsewhere', bytes('x'));
    const result = validateBytesByPath(parsed(withAsset()), value);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'REFERENCE'));
  });
  it('exports a dependency-complete local subset', () => {
    const result = exportEvidenceSubset(withAsset(), ['entrance-a'], bytesMap());
    assert.equal(result.ok, true);
    assert.equal(result.value.document.register.features.length, 1);
    assert.equal(result.value.document.register.observations.length, 1);
    assert.equal(result.value.document.register.sources.length, 1);
    assert.equal(result.value.document.assets.length, 1);
  });
  it('does not include unrelated observations in a sliced export', () => {
    const result = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.document.register.observations.map((row) => row.id), ['obs-a']);
  });
  it('rejects a missing selected feature', () => {
    const result = exportEvidenceSubset(register(), ['not-here'], new Map());
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('rejects duplicated selected feature ids', () => {
    const result = exportEvidenceSubset(register(), ['entrance-a', 'entrance-a'], new Map());
    assert.equal(result.ok, false);
  });
  it('rejects incomplete input instead of exporting partial bytes', () => {
    const value = register();
    value.features[0].sourceIds = ['missing'];
    const result = exportEvidenceSubset(value, ['entrance-a'], new Map());
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('calculates SHA-256 from the exact serialized export', () => {
    const result = exportEvidenceSubset(withAsset(), ['entrance-a'], bytesMap());
    assert.equal(result.ok, true);
    assert.equal(result.value.sha256, checksum(result.value.bytes));
    assert.equal(result.value.totalBytes, result.value.bytes.length);
  });
  it('is deterministic under input permutations', () => {
    const first = withAsset();
    const second = copy(first);
    second.features.reverse();
    second.observations.reverse();
    const a = exportEvidenceSubset(first, ['entrance-a'], bytesMap());
    const b = exportEvidenceSubset(second, ['entrance-a'], bytesMap());
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.value.sha256, b.value.sha256);
  });
  it('creates a route assessment receipt with evidence references', () => {
    const result = exportRouteEvidence(withAsset(), routeRequest(), bytesMap());
    assert.equal(result.ok, true);
    assert.equal(result.value.report.routeId, 'sample-route');
    assert.equal(result.value.report.assessment.sections.length, 2);
    assert.equal(result.value.sha256, checksum(result.value.bytes));
  });
  it('rejects a route export with a missing source', () => {
    const value = withAsset();
    value.sources = [];
    const result = exportRouteEvidence(value, routeRequest(), bytesMap());
    assert.equal(result.ok, false);
  });
  it('rejects a route request mixing licence groups', () => {
    const result = exportRouteEvidence(withOdbl(), routeRequest({
      featureIds: ['entrance-a', 'ramp-c'], silo: 'open',
    }), new Map());
    assert.equal(result.ok, false);
  });
  it('does not add unrelated assets to a route receipt', () => {
    const value = withAsset();
    const result = exportRouteEvidence(value, routeRequest({
      featureIds: ['entrance-b'],
    }), new Map());
    assert.equal(result.ok, true);
    assert.equal(result.value.report.routeId, 'sample-route');
  });
  it('checks receipts against independently supplied bytes', () => {
    const outcome = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    const receipt = { sha256: outcome.value.sha256, totalBytes: outcome.value.totalBytes };
    const result = validateReceipt(receipt, outcome.value.sha256, outcome.value.bytes);
    assert.equal(result.ok, true);
    assert.equal(result.value.sha256, receipt.sha256);
  });
  it('rejects receipts when the claimed digest changes', () => {
    const outcome = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    const receipt = { sha256: '0'.repeat(64), totalBytes: outcome.value.totalBytes };
    const result = validateReceipt(receipt, outcome.value.sha256, outcome.value.bytes);
    assert.equal(result.ok, false);
  });
  it('rejects receipts when the declared size changes', () => {
    const outcome = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    const receipt = { sha256: outcome.value.sha256, totalBytes: 0 };
    const result = validateReceipt(receipt, outcome.value.sha256, outcome.value.bytes);
    assert.equal(result.ok, false);
  });
  it('rejects malformed receipt byte containers', () => {
    const outcome = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    const result = validateReceipt({ sha256: outcome.value.sha256, totalBytes: 3 },
      outcome.value.sha256, 'not bytes');
    assert.equal(result.ok, false);
  });
  it('detects changed asset digests between manifests', () => {
    const before = { assets: [{ id: 'map-a', sha256: 'a'.repeat(64), bytes: 3 }] };
    const after = { assets: [{ id: 'map-a', sha256: 'b'.repeat(64), bytes: 3 }] };
    const result = compareExportManifests(before, after);
    assert.equal(result.ok, true);
    assert.equal(result.value[0].kind, 'changed');
  });
  it('detects added and removed asset manifests', () => {
    const before = { assets: [{ id: 'map-a', sha256: 'a'.repeat(64), bytes: 3 }] };
    const after = { assets: [{ id: 'map-b', sha256: 'b'.repeat(64), bytes: 4 }] };
    const result = compareExportManifests(before, after);
    assert.equal(result.ok, true);
    assert.equal(result.summary.removed, 1);
    assert.equal(result.summary.added, 1);
  });
  it('rejects malformed manifest comparisons', () => {
    assert.equal(compareExportManifests(null, { assets: [] }).ok, false);
    assert.equal(compareExportManifests({ assets: [] }, {}).ok, false);
  });
  it('groups feature inventory by licence and silo', () => {
    const inventory = inventoryByLicence(parsed(withOdbl()));
    assert.equal(inventory.length, 2);
    assert.ok(inventory.some((row) => row.group.startsWith('odbl|')));
    assert.ok(inventory.some((row) => row.group.startsWith('open|')));
  });
  it('lists missing dependencies without inventing records', () => {
    const value = parsed(register());
    const result = listMissingDependencies(value, ['entrance-a', 'entrance-b']);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, []);
  });
  it('flags a requested feature outside the inventory', () => {
    const result = listMissingDependencies(parsed(register()), ['absent']);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, ['feature:absent']);
  });
  it('refuses duplicated dependency selections', () => {
    const result = listMissingDependencies(parsed(register()), ['entrance-a', 'entrance-a']);
    assert.equal(result.ok, false);
  });
  it('creates local-only descriptors without transmission', () => {
    const exportResult = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    const descriptor = localExportDescriptor(exportResult, '2026-11-19');
    assert.equal(descriptor.ok, true);
    assert.equal(descriptor.value.transmitted, false);
    assert.equal(descriptor.value.storage, 'local-only');
    assert.equal(descriptor.value.sha256, exportResult.value.sha256);
  });
  it('refuses a descriptor for a blocked export', () => {
    const result = localExportDescriptor({ ok: false }, '2026-11-19');
    assert.equal(result.ok, false);
  });
  it('refuses descriptors with invalid calendar dates', () => {
    const outcome = exportEvidenceSubset(register(), ['entrance-a'], new Map());
    assert.equal(localExportDescriptor(outcome, '2026-02-30').ok, false);
  });
});
