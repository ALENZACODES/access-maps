import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const route = await readFile(new URL('./observation-route.mjs', import.meta.url), 'utf8');
test('French editor heading uses a locale-aware separator', () => {
  assert.match(route, /function colon\(\) \{ return locale === 'fr' \? '\\u00a0:' : ':'; \}/u);
  assert.match(route, /`\$\{t\(\)\.edit\}\$\{colon\(\)\} \$\{editing\.kind\}`/u);
  assert.doesNotMatch(route, /`\$\{t\(\)\.edit\}: /u);
});
test('French findings heading uses a locale-aware separator', () => {
  assert.match(route, /`\$\{t\(\)\.findings\} — \$\{t\(\)\.issueCount\}\$\{colon\(\)\} \$\{report\.totals\.blocking\}`/u);
  assert.doesNotMatch(route, /\$\{t\(\)\.issueCount\}: /u);
});
test('legacy links remain mounted alongside the conflict-review links', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  for (const fragment of ['placement.html?lang=en', 'placement.html?lang=fr', 'trace.html?lang=fr',
    'observation.html?lang=en', 'observation.html?lang=fr', 'conflict.html?lang=en', 'conflict.html?lang=fr']) {
    assert.ok(html.includes(fragment), fragment);
  }
});
