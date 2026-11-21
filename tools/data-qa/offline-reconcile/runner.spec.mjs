import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const vitest = readFileSync(join(root, 'vitest.config.ts'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/p15j-data-qa.yml'), 'utf8');

describe('P15J runner regression: no missing suites or skipped tests', () => {
  it('excludes P15J from Vitest discovery', () => {
    assert.match(vitest, /tools\/data-qa\/p15j-\*\.test\.ts/u);
  });
  it('runs P15J suites using tsx and Node test', () => {
    assert.match(pkg.scripts.test, /tsx --test [^&]*tools\/data-qa\/p15j-\*\.test\.ts/u);
  });
  it('does not remove the older audit suites from root test', () => {
    for (const lane of ['p15c', 'p15d', 'p15e', 'p15g', 'p15h']) {
      assert.match(pkg.scripts.test, new RegExp(`tools/data-qa/${lane}-`, 'u'));
    }
  });
  it('runs P15J in its own CI workflow using same runner', () => {
    assert.match(workflow, /npx tsx --test tools\/data-qa\/p15j-\*\.test\.ts/u);
  });
  it('does not use a second Vitest invocation for P15J', () => {
    assert.doesNotMatch(workflow, /vitest run tools\/data-qa\/p15j/u);
  });
  it('keeps the four original suites present', () => {
    for (const subject of ['cli', 'coverage', 'handoff', 'resume']) {
      assert.match(readFileSync(join(root, `tools/data-qa/p15j-${subject}.test.ts`), 'utf8'),
        /import \{ describe, it \} from 'node:test'/u);
    }
  });
  it('does not mask tests using runner skip directives', () => {
    for (const subject of ['cli', 'coverage', 'handoff', 'resume']) {
      const source = readFileSync(join(root, `tools/data-qa/p15j-${subject}.test.ts`), 'utf8');
      assert.doesNotMatch(source, /\b(?:it|test|describe)\.skip\s*\(/u);
    }
  });
  it('keeps the published package React types on the existing version', () => {
    assert.equal(pkg.devDependencies['@types/react'], '^19.3.0');
  });
  it('exposes new browser review as a callable local server', () => {
    assert.equal(pkg.scripts['data-qa:reconcile'], 'node tools/data-qa/offline-reconcile/serve.mjs');
  });
  it('executes new review regression suite in dedicated CI job', () => {
    const ci = readFileSync(join(root, '.github/workflows/p15m-offline-reconcile.yml'), 'utf8');
    assert.match(ci, /node --test tools\/data-qa\/offline-reconcile\/\*\.spec\.mjs/u);
  });
});
