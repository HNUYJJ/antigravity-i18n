'use strict';
/**
 * doctor — one-shot health report for the whole antigravity-i18n setup.
 * Answers the question every user has after an IDE update: "what state am I
 * in, and what do I run to fix it?"
 */
const fs = require('fs');
const path = require('path');
const { computeChecksum, readMarker, targetPaths, hash8 } = require('./agentui');

function check(level, msg) {
  return { level, msg };
}

function doctor({ ide, listInstalled, readLocale }) {
  const checks = [];
  if (!ide) {
    checks.push(check('error', 'Antigravity IDE not found (set ANTIGRAVITY_APP_DIR to .../resources/app)'));
    return { checks, ok: false };
  }
  checks.push(check('ok', `IDE: Antigravity ${ide.ideVersion || '?'} (VS Code base ${ide.version}) at ${ide.appDir}`));

  if (ide.cli) checks.push(check('ok', `CLI: ${ide.cli}`));
  else checks.push(check('warn', 'IDE CLI not found — install/uninstall will fall back to manual file copy'));

  const locale = readLocale(ide.dataDir);
  if (locale) checks.push(check('ok', `Locale: ${locale}`));
  else checks.push(check('warn', `Locale not set — run: agy18n install <lang>`));

  const inst = listInstalled(ide);
  if (inst.ours.length) checks.push(check('ok', `Our packs: ${inst.ours.join(', ')}`));
  else checks.push(check('warn', 'No antigravity-i18n language pack installed — run: agy18n install <lang>'));
  if (inst.base.length) checks.push(check('ok', `Base packs: ${inst.base.join(', ')}`));
  else checks.push(check('warn', 'No official MS language pack installed — base editor UI will stay English'));

  for (const t of targetPaths(ide)) {
    const marker = readMarker(t.abs);
    if (!fs.existsSync(t.abs)) { checks.push(check('error', `Bundle missing: ${t.rel}`)); continue; }
    if (!marker) { checks.push(check('warn', `Agent-UI not patched: ${t.rel} — run: agy18n patch-agent <lang>`)); continue; }
    const currentHash = hash8(fs.readFileSync(t.abs)); // marker stores the truncated hash (see agentui.patchAgentBundle)
    if (marker.patchedHash === currentHash) {
      checks.push(check('ok', `Agent-UI patched (${marker.lang}, ${marker.applied} replacements): ${t.rel}`));
    } else {
      checks.push(check('warn', `Agent-UI patch is stale (IDE updated?): ${t.rel} — re-run: agy18n patch-agent ${marker.lang}`));
    }
  }

  const productPath = path.join(ide.appDir, 'product.json');
  try {
    const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    let mismatches = 0;
    for (const [rel, recorded] of Object.entries(product.checksums || {})) {
      const abs = path.join(ide.appDir, 'out', rel);
      if (!fs.existsSync(abs)) { mismatches++; continue; }
      if (computeChecksum(fs.readFileSync(abs)) !== recorded) mismatches++;
    }
    if (mismatches === 0) checks.push(check('ok', `Integrity: all ${Object.keys(product.checksums || {}).length} product.json checksums match (no corrupt-install warning)`));
    else checks.push(check('error', `Integrity: ${mismatches} product.json checksum(s) MISMATCH — the IDE will show a corrupt-install warning. Run: agy18n patch-agent <lang> (re-syncs checksums) or agy18n restore-agent`));
  } catch (err) {
    checks.push(check('error', `product.json unreadable: ${err.message}`));
  }
  if (fs.existsSync(productPath + '.agy-orig')) {
    checks.push(check('ok', 'product.json pristine backup present (restore-agent can revert checksums)'));
  }

  return { checks, ok: checks.every((c) => c.level === 'ok') };
}

module.exports = { doctor };
