#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {parseConflicts,ConflictInputError} from './conflict-core.mjs';
import {gateConflicts,reconcileAgainstBaseline} from './conflict-audit.mjs';
import {reportText,changesText} from './conflict-copy.mjs';
export async function runCli(args,out=process.stdout,err=process.stderr) {
 if(args.length<1 || args.length>4 || args.some(a=>a.startsWith('--')&&!['--fr','--json'].includes(a))){err.write('Usage: conflict-cli.mjs CURRENT.json [PREVIOUS.json] [--fr] [--json]\n');return 2;}
 const files=args.filter(a=>!a.startsWith('--'));
 if(files.length<1||files.length>2){err.write('Provide one or two file paths.\n');return 2;}
 try{
  const current=parseConflicts(await readFile(files[0],'utf8'));
  const previous=files[1]?parseConflicts(await readFile(files[1],'utf8')):null;
  const gate=gateConflicts(current);
  const changes=previous?reconcileAgainstBaseline(previous,current):null;
  if(args.includes('--json'))out.write(`${JSON.stringify({gate,changes},null,2)}\n`);
  else {out.write(reportText(current,args.includes('--fr')?'fr':'en'));if(previous)out.write(changesText(previous,current,args.includes('--fr')?'fr':'en'));}
  return gate.allowed && (!changes || !changes.blocked)?0:1;
 }catch(e){err.write(`Invalid local input: ${e instanceof ConflictInputError?e.code:e.message}\n`);return 2;}
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href)process.exitCode=await runCli(process.argv.slice(2));
