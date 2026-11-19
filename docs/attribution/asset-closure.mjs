/** Offline, read-only publication asset-closure audit. */
import { lstat, readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const LIMIT = 1024 * 1024;
const SUFFIXES = new Set(['.html', '.css', '.js', '.mjs', '.ts', '.tsx']);
const REMOTE = /^(?:https?:|data:|javascript:|\/\/)/iu;
const RELATIVE = /^\.\.?\//u;

function problem(code, source, target, detail = '') {
  return Object.freeze({ code, source, target, detail });
}

function within(root, file) {
  const r = relative(root, file);
  return r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r);
}

/** Extract only direct, literal, local dependency references. */
export function extractDependencies(file, content) {
  const extension = extname(file).toLowerCase();
  const result = [];
  const add = (value, kind) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    result.push({ target: trimmed, kind });
  };
  if (extension === '.html') {
    for (const tag of content.matchAll(/<(?:script|link)\b[^>]*>/giu)) {
      const source = tag[0];
      if (/<link\b/iu.test(source) && !/\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/iu.test(source)) continue;
      const match = /\b(?:src|href)\s*=\s*["']([^"']+)["']/iu.exec(source);
      if (match?.[1]) add(match[1], 'html');
    }
  }
  if (['.mjs', '.js', '.ts', '.tsx'].includes(extension)) {
    for (const match of content.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/gu)) {
      if (match[1] && RELATIVE.test(match[1])) add(match[1], 'module');
    }
    for (const match of content.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
      if (match[1] && RELATIVE.test(match[1])) add(match[1], 'module');
    }
  }
  if (extension === '.css') {
    for (const match of content.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gu)) {
      if (match[1]) add(match[1], 'css');
    }
    for (const match of content.matchAll(/\burl\(\s*["']?([^'"\)]+)["']?\s*\)/gu)) {
      if (match[1]) add(match[1], 'css');
    }
  }
  // A source test can read a file absent from its import graph; inspect these
  // literal test-relative references as well as executable dependencies.
  if (/\.test\.mjs$/u.test(file)) {
    for (const match of content.matchAll(/\b(?:read|file|source)\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
      if (match[1] && !REMOTE.test(match[1])) add(match[1], 'test-read');
    }
  }
  return result;
}

function localTarget(root, file, value) {
  if (REMOTE.test(value)) return { remote: true };
  const cleaned = value.split(/[?#]/u, 1)[0];
  if (!cleaned || cleaned.startsWith('/')) return { unsafe: true };
  const absolute = resolve(dirname(file), cleaned);
  if (!within(root, absolute)) return { unsafe: true };
  return { path: absolute };
}

/**
 * Inspect a bounded local dependency graph and literal test-read references.
 * No requests, mutations, timestamps, or environment-dependent state.
 */
export async function auditAssetClosure(rootPath, entryPaths, options = {}) {
  const root = resolve(rootPath);
  const maxFiles = options.maxFiles ?? 512;
  const maxBytes = options.maxBytes ?? LIMIT;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 4096) throw new TypeError('Invalid file bound');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * LIMIT) throw new TypeError('Invalid byte bound');
  if (!Array.isArray(entryPaths) || entryPaths.length === 0 || entryPaths.some((x) => typeof x !== 'string')) {
    throw new TypeError('Expected entry paths');
  }
  const findings = [];
  const visited = new Set();
  const queue = [];
  for (const item of entryPaths) {
    const absolute = resolve(root, item);
    if (!within(root, absolute)) findings.push(problem('PATH_ESCAPE', '<entry>', item));
    else queue.push({ file: absolute, from: '<entry>', kind: 'entry' });
  }
  while (queue.length) {
    const job = queue.shift();
    if (!job || visited.has(job.file)) continue;
    const name = relative(root, job.file).split(sep).join('/');
    let info;
    try { info = await lstat(job.file); }
    catch (error) {
      if (error && error.code === 'ENOENT') findings.push(problem('MISSING_FILE', job.from, name, job.kind));
      else findings.push(problem('FILE_UNAVAILABLE', job.from, name));
      continue;
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      findings.push(problem('NOT_REGULAR_FILE', job.from, name));
      continue;
    }
    if (info.size > maxBytes) {
      findings.push(problem('FILE_TOO_LARGE', job.from, name));
      continue;
    }
    if (visited.size >= maxFiles) {
      findings.push(problem('FILE_COUNT_LIMIT', job.from, name));
      break;
    }
    visited.add(job.file);
    if (!SUFFIXES.has(extname(job.file).toLowerCase())) continue;
    let content;
    try { content = await readFile(job.file, 'utf8'); }
    catch { findings.push(problem('READ_ERROR', job.from, name)); continue; }
    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      findings.push(problem('FILE_TOO_LARGE', job.from, name));
      continue;
    }
    for (const edge of extractDependencies(job.file, content)) {
      const next = localTarget(root, job.file, edge.target);
      if (next.remote) findings.push(problem('REMOTE_EXECUTABLE_ASSET', name, edge.target, edge.kind));
      else if (next.unsafe) findings.push(problem('PATH_ESCAPE', name, edge.target, edge.kind));
      else if (next.path) queue.push({ file: next.path, from: name, kind: edge.kind });
    }
  }
  findings.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.code.localeCompare(b.code));
  return Object.freeze({ blocked: findings.length !== 0, files: [...visited].map(x => relative(root, x).split(sep).join('/')).sort(), findings });
}

export function renderClosureText(result, language = 'en') {
  const fr = language === 'fr';
  const lines = [fr ? 'Dépendances des pages locales' : 'Local page dependencies',
    `${fr ? 'État' : 'Status'}${fr ? '\u00a0' : ''}: ${result.blocked ? (fr ? 'Bloqué' : 'Blocked') : (fr ? 'Aucun blocage' : 'No blockers')}`,
    `${fr ? 'Fichiers inspectés' : 'Files inspected'}${fr ? '\u00a0' : ''}: ${result.files.length}`];
  for (const f of result.findings) lines.push(`${f.code}: ${f.source} → ${f.target}`);
  return `${lines.join('\n')}\n`;
}
