// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

test('the browser reader, the report and their unit tests typecheck together', () => {
  const resolve = createRequire(new URL('../../e2e/package.json', import.meta.url)).resolve;
  const compiler = resolve('typescript/bin/tsc');
  const project = fileURLToPath(new URL('tsconfig.tile-notice.json', import.meta.url));
  const run = spawnSync(process.execPath, [compiler, '-p', project], {encoding: 'utf8'});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
