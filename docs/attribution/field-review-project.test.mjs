// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The regular repository test command discovers this suite. The type checker
// is available in the root development install and in the browser test install.
test('the complete field review and its unit tests pass strict type checking', () => {
  const fromTests = createRequire(new URL('../../e2e/package.json', import.meta.url));
  const compiler = fromTests.resolve('typescript/bin/tsc');
  const project = fileURLToPath(new URL('./tsconfig.field-review.json', import.meta.url));
  const run = spawnSync(process.execPath, [compiler, '--project', project], {encoding: 'utf8'});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
