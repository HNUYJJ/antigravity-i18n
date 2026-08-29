'use strict';
/** Locate Antigravity IDE installs, user data folders and CLI binaries across platforms. */
const fs = require('fs');
const os = require('os');
const path = require('path');

function exists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}

/** Directories that may contain an Antigravity IDE `resources/app`. */
function candidateRoots() {
  const roots = [];
  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    roots.push(path.join(local, 'Programs', 'Antigravity IDE'));
    roots.push(path.join(local, 'Programs', 'antigravity'));
  } else if (process.platform === 'darwin') {
    roots.push('/Applications/Antigravity IDE.app');
    roots.push(home + '/Applications/Antigravity IDE.app');
  } else {
    roots.push('/usr/share/antigravity-ide');
    roots.push('/opt/Antigravity IDE');
    roots.push('/opt/antigravity-ide');
  }
  return roots;
}

/** Validate a resources/app dir: must be the VS Code-fork IDE with product.json. */
function inspectAppDir(appDir) {
  const productFile = path.join(appDir, 'product.json');
  if (!exists(productFile)) return null;
  let product;
  try { product = JSON.parse(fs.readFileSync(productFile, 'utf8')); } catch { return null; }
  if (!/antigravity/i.test(product.nameShort || '')) return null;
  return product;
}

function findIde(overrides = {}) {
  if (overrides.appDir) {
    const product = inspectAppDir(overrides.appDir);
    if (!product) throw new Error(`ANTIGRAVITY_APP_DIR=${overrides.appDir} does not look like an Antigravity IDE install (missing/invalid product.json)`);
    return finalize(overrides.appDir, product);
  }
  for (const root of candidateRoots()) {
    const appDir = path.join(root, 'resources', 'app');
    const product = inspectAppDir(appDir);
    if (product) return finalize(appDir, product);
  }
  return null;
}

function finalize(appDir, product) {
  const installRoot = path.resolve(appDir, '..', '..'); // .../resources/app -> install root
  const appName = product.applicationName || 'antigravity-ide';
  const dataDirName = product.dataFolderName || '.antigravity-ide';
  const dataDir = process.env.ANTIGRAVITY_DATA_DIR || path.join(os.homedir(), dataDirName);
  let cli;
  if (process.platform === 'win32') {
    cli = path.join(installRoot, 'bin', appName + '.cmd');
  } else {
    cli = path.join(installRoot, 'bin', appName);
    if (process.platform === 'darwin' && !exists(cli)) {
      cli = path.join(installRoot, 'Resources', 'app', 'bin', appName);
    }
  }
  return {
    appDir,
    installRoot,
    product,
    version: product.version || '',
    ideVersion: product.ideVersion || '',
    applicationName: appName,
    dataDir,
    cli: exists(cli) ? cli : null,
  };
}

/** Find installed MS-style base language packs for the IDE's data dir. -> Map<langId, packDir> */
function findBasePacks(dataDir) {
  const extDir = path.join(dataDir, 'extensions');
  const map = new Map();
  if (!exists(extDir)) return map;
  for (const name of fs.readdirSync(extDir)) {
    const m = name.match(/^ms-ceintl\.vscode-language-pack-([a-z-]+?)-\d/);
    if (!m) continue;
    const dir = path.join(extDir, name);
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
    const loc = pkg.contributes && pkg.contributes.localizations && pkg.contributes.localizations[0];
    if (loc && loc.languageId) map.set(loc.languageId, dir);
  }
  return map;
}

module.exports = { findIde, findBasePacks, candidateRoots };
