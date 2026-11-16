/**
 * P15I — root test-runner ownership guard.
 *
 * The root repository has two intentionally different TypeScript test runners:
 * Vitest for suites authored against Vitest, and tsx with node:test for P15
 * QA and offline attribution suites. An integration merge must not make the
 * runners overlap or silently drop the suites belonging to either owner.
 * This guard uses only Node built-ins and does not need a TypeScript runtime.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const vitestSource = readFileSync(join(root, 'vitest.config.ts'), 'utf8');
const script = packageJson.scripts.test;

const p15 = Object.freeze([
  'tools/data-qa/p15c-pipeline.test.ts',
  'tools/data-qa/p15c-cli.test.ts',
  'tools/data-qa/p15d-*.test.ts',
  'tools/data-qa/p15e-*.test.ts',
  'tools/data-qa/p15g-*.test.ts',
  'tools/data-qa/p15h-*.test.ts',
]);
const exclusions = Object.freeze([
  'tools/data-qa/p15c-*.test.ts',
  'tools/data-qa/p15d-*.test.ts',
  'tools/data-qa/p15e-*.test.ts',
  'tools/data-qa/p15g-*.test.ts',
  'tools/data-qa/p15h-*.test.ts',
]);
const offline = 'docs/attribution/offline-*.spec.ts';
const workspaces = Object.freeze([
  '@access-maps/journey',
  '@access-maps/outages',
  '@access-maps/map-ui',
  '@access-maps/journey-data',
  '@access-maps/conditions',
]);

function individualCommands(testScript) {
  return testScript.split(/\s+&&\s+/u).map((command) => command.trim());
}
function testScriptCommands() {
  assert.equal(typeof script, 'string');
  const commands = individualCommands(script);
  assert.ok(commands.length >= 5, 'Root script must run both QA runners and every workspace');
  return commands;
}
function assertOneScriptReference(name) {
  const references = script.split(name).length - 1;
  assert.equal(references, 1, `Expected exactly one test-script reference to ${name}`);
}
function assertVitestExclusion(name) {
  const value = `"${name}"`;
  assert.ok(vitestSource.includes(value), `Vitest exclude must include ${name}`);
}

describe('P15I root runner integration contract', () => {
  it('runs Vitest exactly once, ahead of Node test suites', () => {
    const commands = testScriptCommands();
    assert.equal(commands[0], 'vitest run');
    assert.equal(commands.filter((command) => command === 'vitest run').length, 1);
  });

  it('runs P15C through P15H in one Node test invocation', () => {
    const commands = testScriptCommands();
    const nodeSuites = commands[1];
    assert.ok(nodeSuites.startsWith('tsx --test '));
    for (const pattern of p15) {
      assert.ok(nodeSuites.includes(pattern), `Missing ${pattern} from P15 Node runner`);
      assertOneScriptReference(pattern);
    }
  });

  it('retains the P18 offline attribution suite in a separate Node runner', () => {
    const commands = testScriptCommands();
    assert.equal(commands[2], `tsx --test ${offline}`);
    assertOneScriptReference(offline);
  });

  it('runs every package workspace after the integration tests', () => {
    const commands = testScriptCommands();
    const expected = workspaces.map((name) => `npm test -w ${name}`);
    assert.equal(commands[3], 'node --test tools/data-qa/p15i-runner-config.test.mjs');
    assert.deepEqual(commands.slice(4), expected);
  });

  it('never sends any P15 Node suite through the root Vitest runner', () => {
    for (const pattern of exclusions) assertVitestExclusion(pattern);
  });

  it('preserves Vitest discovery for genuine Vitest tests', () => {
    for (const pattern of ['test/**/*.test.ts', 'packages/*/test/**/*.test.ts',
      'packages/*/test/**/*.test.tsx', 'tools/**/*.test.ts', 'docs/**/*.test.ts']) {
      assert.ok(vitestSource.includes(`"${pattern}"`), `Missing Vitest include: ${pattern}`);
    }
  });

  it('leaves workspace-owned suites outside the root Vitest runner', () => {
    for (const workspace of ['packages/journey/**', 'packages/map-ui/**',
      'packages/journey-data/**', 'packages/conditions/**',
      'packages/outages/**']) assertVitestExclusion(workspace);
  });

  it('retains offline attribution CLI and dedicated test commands', () => {
    assert.equal(packageJson.scripts['audit:offline-attribution'],
      'tsx docs/attribution/offline-cli.ts');
    assert.equal(packageJson.scripts['test:offline-attribution'], `tsx --test ${offline}`);
  });

  it('retains both P15 release CLI entrypoints', () => {
    assert.equal(packageJson.scripts['data-qa:publish'],
      'tsx tools/data-qa/p15g-cli.ts');
    assert.equal(packageJson.scripts['data-qa:regression'],
      'tsx tools/data-qa/p15h-cli.ts');
  });

  it('never regresses the published React types dependency', () => {
    assert.equal(packageJson.devDependencies['@types/react'], '^19.3.0');
  });

  it('does not double-run the P15I guard via Vitest', () => {
    assert.ok(!vitestSource.includes('tools/**/*.test.mjs'));
    assertOneScriptReference('tools/data-qa/p15i-runner-config.test.mjs');
  });

  it('does not omit a suite when changing the root test runner', () => {
    const commands = testScriptCommands();
    assert.equal(commands.filter((item) => item.startsWith('tsx --test ')).length, 2);
    assert.equal(commands.filter((item) => item.startsWith('npm test -w ')).length, workspaces.length);
  });
});
