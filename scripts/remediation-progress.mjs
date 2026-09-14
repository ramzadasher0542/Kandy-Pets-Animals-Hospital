import { readFileSync } from 'node:fs';
import path from 'node:path';

const blueprint = readFileSync(
  path.join(process.cwd(), '..', 'outputs', 'VHMS_REMEDIATION_BLUEPRINT.md'),
  'utf8',
);

const checklist = [...blueprint.matchAll(/^- \[([ x~])\] (P\d(?:\.\d+)?)[^\n]*$/gm)]
  .map(([, marker, id]) => ({ id, value: marker === 'x' ? 1 : marker === '~' ? 0.5 : 0 }));

const total = checklist.length;
const completed = checklist.reduce((sum, item) => sum + item.value, 0);
const percentage = total === 0 ? 0 : (completed / total) * 100;
const releaseReady = checklist
  .filter((item) => item.id.startsWith('P7.'))
  .every((item) => item.value === 1);

console.log(`Remediation checklist progress: ${percentage.toFixed(1)}% (${completed}/${total} weighted items)`);
console.log(`Release readiness: ${releaseReady ? 'READY FOR FINAL DECISION' : 'NO-GO; P7 release gates remain incomplete'}`);
console.log(`Completed: ${checklist.filter((item) => item.value === 1).length}`);
console.log(`Partial: ${checklist.filter((item) => item.value === 0.5).length}`);
console.log(`Open: ${checklist.filter((item) => item.value === 0).length}`);
