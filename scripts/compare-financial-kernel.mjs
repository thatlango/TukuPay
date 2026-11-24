// Compare current TypeScript money rules with Rust in one offline batch.
// Divergences are reported; this script never decides payment outcomes.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { majorToMinor,minorToMajor } from '../apps/api/dist/utils/money.js';
const vectors=readFileSync(new URL('../contracts/financial/money.tsv',import.meta.url),'utf8').trimEnd().split('\n').slice(1).map(line=>line.split('\t'));
const inputs=vectors.map(([c,a])=>c+'\t'+a);
const ts= vectors.map(([c,a])=>{
  try { const m=majorToMinor(a,c);return ['OK',m.toString(),minorToMajor(m,c)].join('\t'); }
  catch { return 'ERROR'; }
});
const binary=process.argv[2];
if(!binary) throw new Error('Pass the locally compiled Rust shadow binary');
const run=spawnSync(binary,[],{input:inputs.join('\n')+'\n',encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
if(run.error||run.status!==0) throw new Error('Rust shadow failed');
const actual=run.stdout.trimEnd().split('\n');
const differences=inputs.flatMap((input,i)=>actual[i]===ts[i]?[]:[{input,typescript:ts[i],rust:actual[i]??'MISSING'}]);
console.log(JSON.stringify({vectors:inputs.length,differences,passed:differences.length===0&&actual.length===ts.length},null,2));
if(differences.length||actual.length!==ts.length) process.exitCode=1;
