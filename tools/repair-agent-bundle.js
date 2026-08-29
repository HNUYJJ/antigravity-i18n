'use strict';
/**
 * One-shot repair: invert the corrupted double-applied replacements.
 * Corruption pattern from the buggy callback: ("EN"ZH)+EN wrapped in quotes:
 *   pass1: "EN"  -> "EN"ZH"EN"
 *   pass2: "EN"ZH"EN" -> "EN"ZH"EN"ZH"EN"
 * General form: ("EN"ZH){k}"EN"  -> collapse back to "EN".
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const B = process.env.LOCALAPPDATA + '/Programs/Antigravity IDE/resources/app/out/jetskiAgent/main.js';
const MAP = path.join(__dirname, '..', 'locales', 'zh-cn', 'agent-ui.json');

const escR = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escJ = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');

let js = fs.readFileSync(B, 'utf8');
const before = js.length;
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const entries = Object.entries(map)
  .filter(([k, v]) => v && !k.startsWith('_'))
  .sort((a, b) => b[0].length - a[0].length);

for (const [en, zh] of entries) {
  const Z = escJ(zh);
  const re = new RegExp('(?:(["\'])' + escR(en) + '\\1' + escR(Z) + ')+(["\'])' + escR(en) + '\\2', 'g');
  js = js.replace(re, (m, q1, q2) => q2 + en + q2);
}

console.log('chars before:', before, ' after:', js.length, ' (pristine was 13983324)');
const tmp = path.join(os.tmpdir(), 'agy-repair-check.js');
fs.writeFileSync(tmp, js);
const chk = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 120000 });
try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
if (chk.status !== 0) {
  console.error('SYNTAX CHECK FAILED — not writing file.');
  console.error(((chk.stdout || '') + (chk.stderr || '')).slice(-600));
  process.exit(1);
}
fs.writeFileSync(B, js);
console.log('repaired + syntax OK, written back');
