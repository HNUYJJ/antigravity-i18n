'use strict';
/** scratch: inspect the agent bundle for candidate UI strings (dev tool) */
const fs = require('fs');
const { extractCandidates } = require('../lib/agentui');

const js = fs.readFileSync(process.argv[2], 'utf8');
console.log('bundle chars:', js.length);
for (const s of process.argv.slice(3)) {
  const dq = js.split('"' + s + '"').length - 1;
  const sq = js.split("'" + s + "'").length - 1;
  console.log(JSON.stringify(s), 'dq:' + dq, 'sq:' + sq);
}
const cands = extractCandidates(js);
fs.writeFileSync('locales/_meta/agent-ui.candidates.json', JSON.stringify(cands, null, 1));
console.log('candidates:', cands.length, '-> locales/_meta/agent-ui.candidates.json');
console.log(cands.slice(0, 120).join(' | '));
