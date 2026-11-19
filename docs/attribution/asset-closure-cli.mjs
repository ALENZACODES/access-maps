import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAssetClosure, renderClosureText } from './asset-closure.mjs';

export async function executeClosureCli(args) {
  if (!Array.isArray(args) || args.length < 2 || args.includes('--help')) {
    return { status: 2, stdout: '', stderr: 'Usage: asset-closure-cli.mjs <root> <entry> [entry ...] [--lang en|fr]' };
  }
  const items = [...args];
  let language = 'en';
  const position = items.indexOf('--lang');
  if (position !== -1) {
    const value = items[position + 1];
    if (value !== 'en' && value !== 'fr') return { status: 2, stdout: '', stderr: 'Language must be en or fr' };
    language = value;
    items.splice(position, 2);
  }
  if (items.length < 2 || items.some(x => x.startsWith('-'))) return { status: 2, stdout: '', stderr: 'Expected a root and local entry paths' };
  try {
    const result = await auditAssetClosure(items[0], items.slice(1));
    return { status: result.blocked ? 1 : 0, stdout: renderClosureText(result, language), stderr: '' };
  } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid local files' };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void executeClosureCli(process.argv.slice(2)).then(({ status, stdout, stderr }) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode = status;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Input error'}\n`);
    process.exitCode = 2;
  });
}
