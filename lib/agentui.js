'use strict';
/**
 * Agent-UI localization for surfaces with NO NLS mechanism:
 * the standalone Agent Manager window loads the IDE's React bundle
 * (out/jetskiAgent/main.js), whose strings are hardcoded English literals.
 *
 * Strategy: guarded string-literal patching with backup + marker + restore.
 * This is the only viable path for these surfaces today (no i18n hooks exist),
 * so we make it reversible, version-marked and idempotent.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MARKER_SUFFIX = '.agy-i18n.json';
const BACKUP_SUFFIX = '.agy-orig';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeJsString(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
}

function sha8(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/** Heuristic scan for translatable UI literals in a minified React bundle. */
function extractCandidates(bundleJs) {
  const found = new Set();
  const props = 'children|label|title|placeholder|tooltip|description|text|textContext|ariaLabel|header|heading|emptyMessage|confirmText|cancelText';
  const re = new RegExp("(?:" + props + ")\\s*:\\s*([\"'])((?:(?!\\1).){2,80})\\1", 'g');
  let m;
  while ((m = re.exec(bundleJs))) {
    const v = m[2];
    if (/[<>{}\\]|=>|:\s|^\s*$/.test(v)) continue; // skip code-ish payloads
    if (!/[A-Za-z]/.test(v)) continue;
    found.add(v);
  }
  return [...found];
}

/** Replace `"En"` literals with `"Zh"` preserving the quote character. Idempotent per mapping. */
function applyTranslations(bundleJs, map) {
  let applied = 0;
  const missed = [];
  for (const [en, zh] of Object.entries(map)) {
    if (!zh) continue;
    const re = new RegExp("([\"'])" + escapeRegExp(en) + "\\1", 'g');
    let n = 0;
    bundleJs = bundleJs.replace(re, (match, q) => { n++; return q + escapeJsString(zh) + q; });
    if (n > 0) applied += n; else missed.push(en);
  }
  return { bundleJs, applied, missed };
}

function markerFile(bundlePath) {
  return bundlePath + MARKER_SUFFIX;
}

function backupFile(bundlePath) {
  return bundlePath + BACKUP_SUFFIX;
}

function readMarker(bundlePath) {
  try { return JSON.parse(fs.readFileSync(markerFile(bundlePath), 'utf8')); } catch { return null; }
}

/**
 * Patch the agent-UI bundle with `map`. Safe to re-run:
 * - if a marker exists and matches the current bundle hash and lang, nothing is done
 * - otherwise the current (pristine) bundle is re-patched from the stored backup
 */
/** Syntax-validate a JS buffer with `node --check` before it touches disk as the real bundle. */
function validateSyntax(jsBuffer) {
  const os = require('os');
  const { spawnSync } = require('child_process');
  const tmp = path.join(os.tmpdir(), 'agy18n-check-' + Date.now() + '.js');
  fs.writeFileSync(tmp, jsBuffer);
  try {
    const res = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 60000 });
    return { ok: res.status === 0, error: res.status === 0 ? '' : ((res.stdout || '') + (res.stderr || '')).slice(0, 400) };
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
  }
}

function patchAgentBundle(bundlePath, map, meta = {}) {
  if (!fs.existsSync(bundlePath)) throw new Error(`bundle not found: ${bundlePath}`);
  const current = fs.readFileSync(bundlePath);
  const currentHash = sha8(current);
  const marker = readMarker(bundlePath);

  if (marker && marker.patchedHash === currentHash && marker.lang === meta.lang && marker.mapHash === sha8(Buffer.from(JSON.stringify(map)))) {
    return { status: 'already-patched', applied: marker.applied, missed: marker.missed || [] };
  }

  let source;
  if (marker && fs.existsSync(backupFile(bundlePath)) && marker.patchedHash === currentHash) {
    // re-run on our own patched output: patch the pristine backup instead
    source = fs.readFileSync(backupFile(bundlePath));
  } else {
    // pristine bundle (first run, or the app updated and replaced the file)
    fs.copyFileSync(bundlePath, backupFile(bundlePath));
    source = current;
  }
  const { bundleJs, applied, missed } = applyTranslations(source.toString('utf8'), map);
  const patched = Buffer.from(bundleJs, 'utf8');
  const check = validateSyntax(patched);
  if (!check.ok) throw new Error(`patched bundle failed syntax validation, aborting (original untouched): ${check.error}`);
  fs.writeFileSync(bundlePath, patched);
  fs.writeFileSync(markerFile(bundlePath), JSON.stringify({
    ...meta, sourceHash: sha8(source), patchedHash: sha8(patched), mapHash: sha8(Buffer.from(JSON.stringify(map))),
    applied, missed, patchedAt: new Date().toISOString(), tool: 'antigravity-i18n',
  }, null, 2));
  return { status: 'patched', applied, missed };
}

function restoreAgentBundle(bundlePath) {
  const marker = readMarker(bundlePath);
  const backup = backupFile(bundlePath);
  if (!marker && !fs.existsSync(backup)) return { status: 'not-patched' };
  // If the bundle no longer matches what we patched, the IDE updated and replaced
  // it — restoring the (older) backup would downgrade the file. Just clear state.
  if (marker && marker.patchedHash && fs.existsSync(bundlePath) && sha8(fs.readFileSync(bundlePath)) !== marker.patchedHash) {
    fs.rmSync(backup, { force: true });
    fs.rmSync(markerFile(bundlePath), { force: true });
    return { status: 'stale-state-cleared', note: 'bundle changed since patch (IDE update?); current file left untouched, stale marker/backup removed' };
  }
  if (fs.existsSync(backup)) fs.copyFileSync(backup, bundlePath);
  if (fs.existsSync(backup)) fs.rmSync(backup);
  if (fs.existsSync(markerFile(bundlePath))) fs.rmSync(markerFile(bundlePath));
  return { status: 'restored', was: marker ? marker.lang : 'unknown' };
}

function agentBundlePath(ide) {
  return path.join(ide.appDir, 'out', 'jetskiAgent', 'main.js');
}

/**
 * All app files we patch + their product.json integrity keys.
 * The IDE verifies SHA-256 checksums from product.json at startup ("installation
 * appears to be corrupt" prompt on mismatch), so every patch must be followed
 * by syncIntegrity().
 */
const AGENT_TARGETS = [
  { rel: 'jetskiAgent/main.js', integrity: 'jetskiAgent/main.js' },
  { rel: 'vs/workbench/workbench.desktop.main.js', integrity: 'vs/workbench/workbench.desktop.main.js' },
];

function targetPaths(ide) {
  return AGENT_TARGETS.map((t) => ({ ...t, abs: path.join(ide.appDir, 'out', t.rel) }));
}

/** sha256, standard base64, padding stripped — matches VS Code product.json checksums. */
function computeChecksum(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
}

/**
 * Re-hash patched files and update product.json.checksums so the IDE's
 * integrity check keeps passing. product.json gets its own pristine backup.
 */
function syncIntegrity(appDir, integrityKeys) {
  const productPath = path.join(appDir, 'product.json');
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  if (!product.checksums) return [];
  const updated = [];
  for (const rel of integrityKeys) {
    if (!(rel in product.checksums)) continue;
    const abs = path.join(appDir, 'out', rel);
    if (!fs.existsSync(abs)) continue;
    const ck = computeChecksum(fs.readFileSync(abs));
    if (product.checksums[rel] !== ck) {
      product.checksums[rel] = ck;
      updated.push(rel);
    }
  }
  if (updated.length) {
    const bak = productPath + BACKUP_SUFFIX;
    if (!fs.existsSync(bak)) fs.copyFileSync(productPath, bak);
    fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'));
  }
  return updated;
}

function restoreIntegrity(appDir) {
  const productPath = path.join(appDir, 'product.json');
  const bak = productPath + BACKUP_SUFFIX;
  if (!fs.existsSync(bak)) return { status: 'not-patched' };
  // Surgical restore: put back only the checksum entries we touched, so any
  // other product.json changes (e.g. a version bump from an IDE update made
  // after our patch) are preserved instead of being reverted wholesale.
  try {
    const current = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    const original = JSON.parse(fs.readFileSync(bak, 'utf8'));
    if (current.checksums && original.checksums) {
      for (const [rel, ck] of Object.entries(original.checksums)) {
        if (rel in current.checksums) current.checksums[rel] = ck;
      }
      fs.writeFileSync(productPath, JSON.stringify(current, null, '\t'));
    }
  } catch {
    fs.copyFileSync(bak, productPath); // unparseable current file: fall back to full restore
  }
  fs.rmSync(bak);
  return { status: 'restored' };
}

module.exports = { extractCandidates, applyTranslations, patchAgentBundle, restoreAgentBundle, agentBundlePath, readMarker, AGENT_TARGETS, targetPaths, syncIntegrity, restoreIntegrity, computeChecksum };
