import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const handoff = read('.github/workflows/p15j-data-qa.yml');
const reconcile = read('.github/workflows/p15m-offline-reconcile.yml');

describe('QA runner ownership', () => {
  it('runs the four Vitest handoff modules with the runner that defines their tests', () => {
    for (const name of ['cli', 'coverage', 'handoff', 'resume']) {
      const source = read(`tools/data-qa/p15j-${name}.test.ts`);
      assert.match(source, /from ['"]vitest['"]/u);
      assert.doesNotMatch(source, /\b(?:describe|it|test)\.skip\s*\(/u);
    }
    assert.match(handoff, /run: npx vitest run tools\/data-qa\/p15j-\*\.test\.ts/u);
    assert.equal(pkg.scripts.test.split(' && ')[0], 'vitest run');
  });

  it('registers the offline tool and runs every reconciliation spec in pull requests', () => {
    const command = 'node --test tools/data-qa/offline-reconcile/*.spec.mjs';
    assert.equal(pkg.scripts['data-qa:reconcile'], 'node tools/data-qa/offline-reconcile/serve.mjs');
    assert.equal(pkg.scripts['test:data-qa:reconcile'], command);
    assert.ok(reconcile.includes(`run: ${command}`));
    for (const workflow of [handoff, reconcile]) {
      assert.match(workflow, /^on:\n  pull_request:/mu);
      assert.doesNotMatch(workflow, /^  (?:push|schedule|workflow_dispatch):/mu);
    }
  });
});
