import { pathToFileURL } from 'node:url';
import { CustodyError } from './p15-custody-contract.mjs';
import { SourceReviewError } from './p15al-input.mjs';
import { CustodyReviewError, openCustodyReviewSession, resumeCustodyReviewSession } from './p15-review-custody.mts';
import { ERRORS, QueueError, choice, demand, fields } from './p15am-model.mts';
import { applyReviewCommands, openReviewQueue, traceReviewItem, validateReviewQueue } from './p15am-queue.mts';
import { checkoutReviewCursor, compareReviewBranches } from './p15am-history.mts';
import { planReviewAssignments } from './p15am-dispatch.mts';
import { describeReviewQueue } from './p15am-report.mts';
import { exportReviewHandoff, importReviewHandoff } from './p15am-transfer.mts';

type Language = 'en' | 'fr';
const MAX_INPUT_BYTES = 48 * 1024 * 1024;
const OPERATIONS = ['open', 'apply', 'plan', 'report', 'export', 'receive', 'open-custody', 'resume-custody', 'verify', 'checkout', 'compare', 'trace'] as const;

export function runQueueOperation(op: string, input: unknown, lang: Language): unknown {
  switch (choice(op, OPERATIONS)) {
    case 'open': return openReviewQueue(input);
    case 'open-custody': {
      const request = fields(input, ['input', 'setup']);
      return openCustodyReviewSession(request.input, request.setup);
    }
    case 'resume-custody': {
      const request = fields(input, ['input', 'setup', 'session']);
      return resumeCustodyReviewSession(request.input, request.setup, request.session);
    }
    case 'apply': {
      const request = fields(input, ['queue', 'commands']);
      return applyReviewCommands(request.queue, request.commands);
    }
    case 'plan': {
      const request = fields(input, ['queue', 'limit']);
      demand(typeof request.limit === 'number', 'VALUE');
      return planReviewAssignments(request.queue, request.limit);
    }
    case 'report': return describeReviewQueue(input, lang);
    case 'export': {
      const request = fields(input, ['queue', 'after']);
      return exportReviewHandoff(request.queue, request.after);
    }
    case 'receive': {
      const request = fields(input, ['queue', 'handoff']);
      return importReviewHandoff(request.queue, request.handoff);
    }
    case 'checkout': {
      const request = fields(input, ['queue', 'at']);
      return checkoutReviewCursor(request.queue, request.at);
    }
    case 'compare': {
      const request = fields(input, ['left', 'right']);
      return compareReviewBranches(request.left, request.right);
    }
    case 'trace': {
      const request = fields(input, ['queue', 'proposalId']);
      return traceReviewItem(request.queue, request.proposalId);
    }
    case 'verify': {
      const { cursor, genesis, seed } = validateReviewQueue(input);
      return { queueId: seed.queueId, genesis, cursor };
    }
  }
}

async function readStdin(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    demand(bytes <= MAX_INPUT_BYTES, 'LIMIT');
    chunks.push(buffer);
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
    return JSON.parse(text);
  } catch {
    throw new QueueError('INPUT');
  }
}

async function main(): Promise<void> {
  const [op, requestedLang = 'en', ...extra] = process.argv.slice(2);
  const language = requestedLang === 'fr' ? 'fr' : 'en';
  try {
    demand(!extra.length && requestedLang === language && op && OPERATIONS.some(name => name === op), 'USAGE');
    const output = runQueueOperation(op, await readStdin(), language);
    process.stdout.write(JSON.stringify(output) + '\n');
  } catch (failure) {
    let error: { code: string; message: string };
    if (failure instanceof QueueError) {
      error = { code: failure.code, message: ERRORS[failure.code][language === 'fr' ? 1 : 0] };
    } else if (failure instanceof CustodyReviewError || failure instanceof SourceReviewError) {
      error = { code: failure.code, message: failure.localize(language) };
    } else if (failure instanceof CustodyError) {
      error = { code: 'CUSTODY', message: language === 'en'
        ? 'Invalid evidence custody ledger.' : 'Registre de conservation des preuves invalide.' };
    } else throw failure;
    process.stderr.write(JSON.stringify(error) + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
