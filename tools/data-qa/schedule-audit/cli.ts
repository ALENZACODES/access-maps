import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditSchedules, type AuditOptions, type Status } from './audit.ts';
import { formatReport, type Language } from './report.ts';

export const auditExitCodes: Readonly<Record<Status, number>> = {
  clean: 0, invalid: 1, incomplete: 3, review: 4,
};

interface Request {
  options: AuditOptions;
  lang: Language;
  format: 'text' | 'json';
  help: boolean;
}

interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
}

function help(lang: Language): string {
  if (lang === 'fr') return [
    'Vérification hors ligne des horaires',
    '--manifest FICHIER    Manifeste v1 (par défaut, pack/schedules/manifest.json).',
    '--pack-root DOSSIER   Racine des fichiers distribués dans Git (data/schedules/v1).',
    '--release-root DOSSIER   Dossier local des fichiers de publication (release-assets).',
    '--source ID           Vérifier une source du manifeste.',
    '--region ID           Vérifier une région du manifeste.',
    '--max-examples N      Afficher de 0 à 1000 emplacements (20 par défaut).',
    '--lang en|fr          Langue du rapport texte.',
    '--format text|json    Format du rapport (text par défaut).',
    '--help                Afficher cette aide.',
    'Codes de sortie : 0 réussi, 1 erreurs, 2 arguments invalides, 3 données incomplètes, 4 examen requis.',
    'Les filtres portent sur les fichiers à lire. Toutes les déclarations du manifeste sont vérifiées.',
  ].join('\n') + '\n';
  return [
    'Offline timetable audit',
    '--manifest FILE       Version 1 manifest (default pack/schedules/manifest.json).',
    '--pack-root DIR       Root of Git-distributed files (default data/schedules/v1).',
    '--release-root DIR    Local release asset directory (default release-assets).',
    '--source ID           Check one manifest source.',
    '--region ID           Check one manifest region.',
    '--max-examples N      Show 0 to 1000 finding locations (default 20).',
    '--lang en|fr          Text report language.',
    '--format text|json    Report format (default text).',
    '--help                Show help.',
    'Exit codes: 0 passed, 1 errors, 2 invalid arguments, 3 incomplete evidence, 4 review needed.',
    'Filters select files to read. All manifest declarations are checked.',
  ].join('\n') + '\n';
}

const validId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function parseArguments(args: readonly string[]): Request | null {
  const request: Request = {
    options: {
      manifest: 'pack/schedules/manifest.json',
      packRoot: 'data/schedules/v1',
      releaseRoot: 'release-assets',
    },
    lang: 'en',
    format: 'text',
    help: false,
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (seen.has(flag)) return null;
    seen.add(flag);
    if (flag === '--help') {
      request.help = true;
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith('--') || value.includes('\0')) return null;
    switch (flag) {
      case '--lang':
        if (value !== 'en' && value !== 'fr') return null;
        request.lang = value;
        break;
      case '--format':
        if (value !== 'text' && value !== 'json') return null;
        request.format = value;
        break;
      case '--manifest': request.options.manifest = value; break;
      case '--pack-root': request.options.packRoot = value; break;
      case '--release-root': request.options.releaseRoot = value; break;
      case '--source':
      case '--region':
        if (value.length > 100 || !validId.test(value) || value.trim() !== value) return null;
        request.options[flag === '--source' ? 'source' : 'region'] = value;
        break;
      case '--max-examples':
        if (!/^(?:0|[1-9][0-9]{0,3})$/u.test(value) || value.trim() !== value || Number(value) > 1000) return null;
        request.options.maxExamples = Number(value);
        break;
      default: return null;
    }
  }
  return request;
}

export async function runCli(args: readonly string[], output: Output): Promise<number> {
  const request = parseArguments(args);
  if (!request) {
    const asksFrench = args.some((value, i) => value === '--lang' && args[i + 1] === 'fr');
    output.stderr(asksFrench ? 'Arguments invalides. Consultez --help.\n' : 'Invalid arguments. See --help.\n');
    return 2;
  }
  if (request.help) {
    output.stdout(help(request.lang));
    return 0;
  }
  const report = await auditSchedules(request.options);
  output.stdout(request.format === 'text' ? formatReport(report, request.lang) : JSON.stringify(report, null, 2) + '\n');
  return auditExitCodes[report.status];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
  });
}
