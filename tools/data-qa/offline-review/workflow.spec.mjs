import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const folder = dirname(fileURLToPath(import.meta.url));
const root = resolve(folder, '../../..');
const workflow = readFileSync(resolve(root, '.github/workflows/p15l-offline-review.yml'), 'utf8');
const readme = readFileSync(resolve(folder, 'README.md'), 'utf8');

describe('P15L repository CI and README integration', () => {
  it('has a dedicated workflow inside the repository', () => {
    assert.match(workflow, /name: P15L offline publication review/);
    assert.match(workflow, /^on:\n  pull_request:/m);
    assert.doesNotMatch(workflow, /^  (?:push|schedule|workflow_dispatch):/m);
  });
  it('runs all .spec.mjs files without omissions or skips', () => {
    assert.match(workflow, /node --test tools\/data-qa\/offline-review\/\*\.spec\.mjs/);
    assert.doesNotMatch(workflow, /--test-skip-pattern|--test-name-pattern|\.skip\(/);
  });
  it('tests the JavaScript syntax of each local module', () => {
    assert.match(workflow, /node --check "\$file"/);
  });
  it('uses a finite job duration and read-only permissions', () => {
    assert.match(workflow, /timeout-minutes:\s*10/);
    assert.match(workflow, /contents:\s*read/);
  });
  it('documents the exact executable test command', () => {
    assert.ok(readme.includes('node --test tools/data-qa/offline-review/*.spec.mjs'));
    assert.ok(readme.includes('.github/workflows/p15l-offline-review.yml'));
  });
  it('does not introduce package mutation or remote data access', () => {
    assert.doesNotMatch(workflow, /npm install|npm publish|curl |wget |schedule:/);
  });
});
