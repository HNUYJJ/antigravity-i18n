'use strict';
/** Install / uninstall / activate language packs for a detected Antigravity IDE. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { unzip } = require('./zip');
const { extensionId, PUBLISHER } = require('./vsix');

function runCli(cli, args) {
  let res;
  if (process.platform === 'win32') {
    // Node cannot exec .cmd shims directly (>=18.20), and the shim path contains
    // spaces which cmd.exe strips quotes from. Route through a space-free shim script.
    const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy18n-'));
    const shim = path.join(shimDir, 'run.cmd');
    fs.writeFileSync(shim, `@echo off\r\ncall "${cli}" %*\r\n`);
    res = spawnSync('cmd.exe', ['/d', '/s', '/c', shim, ...args], { encoding: 'utf8', windowsHide: true });
    try { fs.rmSync(shimDir, { recursive: true, force: true }); } catch { /* best effort */ }
  } else {
    res = spawnSync(cli, args, { encoding: 'utf8', windowsHide: true });
  }
  return { ok: res.status === 0, out: ((res.stdout || '') + (res.stderr || '')).trim() };
}

function extensionsJsonFile(dataDir) {
  return path.join(dataDir, 'extensions', 'extensions.json');
}

function readExtensionsJson(dataDir) {
  const file = extensionsJsonFile(dataDir);
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeExtensionsJson(dataDir, entries) {
  fs.mkdirSync(path.join(extensionsJsonFile(dataDir), '..'), { recursive: true });
  fs.writeFileSync(extensionsJsonFile(dataDir), JSON.stringify(entries, null, '\t'));
}

function manualInstall(dataDir, vsixPath, lang, version) {
  const map = unzip(fs.readFileSync(vsixPath));
  const id = extensionId(lang);
  const relDir = `${id}-${version}`;
  const dest = path.join(dataDir, 'extensions', relDir);
  for (const [name, data] of map) {
    if (!name.startsWith('extension/')) continue;
    const rel = name.slice('extension/'.length);
    if (!rel || rel.endsWith('/')) continue;
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  const entries = readExtensionsJson(dataDir).filter(
    (e) => !((e.identifier && e.identifier.id || '').toLowerCase().includes(id.toLowerCase()))
  );
  const fileUriPath = dest.replace(/\\/g, '/');
  const template = entries.find((e) => e.location && e.location.scheme === 'file');
  const entry = {
    identifier: { id },
    version,
    location: { ...(template ? template.location : {}), $mid: 1, fsPath: dest, external: 'file:///' + fileUriPath, path: '/' + fileUriPath.replace(/^\//, ''), scheme: 'file' },
    relativeLocation: relDir,
    metadata: {
      ...((template && template.metadata) || {}),
      installedTimestamp: Date.now(),
      isMachineScoped: false,
      isPreRelease: false,
      pinned: true,
      private: false,
      source: 'vsix',
    },
  };
  entries.push(entry);
  writeExtensionsJson(dataDir, entries);
  return dest;
}

function install(ide, vsixPath, lang, version, opts = {}) {
  const id = extensionId(lang);
  if (ide.cli && !opts.noCli) {
    const r = runCli(ide.cli, ['--install-extension', vsixPath, '--force']);
    if (r.ok) return { how: 'cli', message: r.out || 'installed via CLI' };
    if (opts.verbose) console.error(`[cli install failed: ${r.out}] — falling back to manual install`);
  }
  const dest = manualInstall(ide.dataDir, vsixPath, lang, version);
  return { how: 'manual', message: `installed to ${dest}` };
}

function uninstall(ide, lang) {
  const id = extensionId(lang);
  if (ide.cli) {
    const r = runCli(ide.cli, ['--uninstall-extension', id]);
    if (r.ok) return { how: 'cli', message: r.out || 'uninstalled via CLI' };
  }
  const dataDir = ide.dataDir;
  const extDir = path.join(dataDir, 'extensions');
  let removed = false;
  if (fs.existsSync(extDir)) {
    for (const name of fs.readdirSync(extDir)) {
      if (name.toLowerCase().startsWith(id.toLowerCase() + '-')) {
        fs.rmSync(path.join(extDir, name), { recursive: true, force: true });
        removed = true;
      }
    }
  }
  const before = readExtensionsJson(dataDir);
  const after = before.filter((e) => !((e.identifier && e.identifier.id || '').toLowerCase().includes(id.toLowerCase())));
  if (after.length !== before.length) { writeExtensionsJson(dataDir, after); removed = true; }
  if (!removed) throw new Error(`${id} is not installed`);
  return { how: 'manual', message: `removed ${id}` };
}

/** Point argv.json's "locale" at the given language id (JSONC-safe text surgery). */
function setLocale(dataDir, languageId) {
  const file = path.join(dataDir, 'argv.json');
  let text = '{}';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* create below */ }
  if (/"locale"\s*:/.test(text)) {
    text = text.replace(/("locale"\s*:\s*)"[^"]*"/, `$1"${languageId}"`);
  } else {
    text = text.replace(/\}\s*$/, `\t"locale": "${languageId}"\n}`);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function listInstalled(ide) {
  const extDir = path.join(ide.dataDir, 'extensions');
  const packs = { ours: [], base: [] };
  if (!fs.existsSync(extDir)) return packs;
  for (const name of fs.readdirSync(extDir)) {
    if (/^agy-i18n\.antigravity-language-pack-/.test(name)) packs.ours.push(name);
    else if (/^ms-ceintl\.vscode-language-pack-/.test(name)) packs.base.push(name);
  }
  return packs;
}

function readLocale(dataDir) {
  try {
    const text = fs.readFileSync(path.join(dataDir, 'argv.json'), 'utf8');
    const m = text.match(/"locale"\s*:\s*"([^"]*)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

module.exports = { install, uninstall, setLocale, listInstalled, readLocale, runCli };
