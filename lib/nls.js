'use strict';
/** Read and diff VS Code-style NLS catalogs (nls.keys.json / nls.messages.json). */
const fs = require('fs');
const path = require('path');

/** Antigravity IDE (VS Code fork) ships a single global catalog in out/. */
function readCatalog(appDir) {
  const keys = JSON.parse(fs.readFileSync(path.join(appDir, 'out', 'nls.keys.json'), 'utf8'));
  const msgs = JSON.parse(fs.readFileSync(path.join(appDir, 'out', 'nls.messages.json'), 'utf8'));
  const strings = Object.create(null);
  let idx = 0;
  for (const [mod, ks] of keys) {
    const m = strings[mod] || (strings[mod] = Object.create(null));
    for (const k of ks) m[k] = msgs[idx++] ?? '';
  }
  return { strings, totalMessages: idx, moduleCount: keys.length };
}

/** MS-style language pack: translations/main.i18n.json = { "", version, contents: { module: { key: value } } } */
function readPackTranslations(packDir) {
  const file = path.join(packDir, 'translations', 'main.i18n.json');
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  return p.contents || {};
}

/** Strings present in the app but missing from a language pack -> { "module|key": english } */
function computeDelta(appStrings, packContents) {
  const delta = Object.create(null);
  for (const [mod, ks] of Object.entries(appStrings)) {
    const covered = packContents[mod];
    if (!covered) {
      for (const [k, v] of Object.entries(ks)) delta[mod + '|' + k] = v;
    } else {
      for (const [k, v] of Object.entries(ks)) if (!(k in covered)) delta[mod + '|' + k] = v;
    }
  }
  return delta;
}

/** Fork-specific modules (name heuristic) — used when no base pack exists for a language. */
function forkOnly(appStrings) {
  const delta = Object.create(null);
  for (const [mod, ks] of Object.entries(appStrings)) {
    if (/antigravity|jetski/i.test(mod)) {
      for (const [k, v] of Object.entries(ks)) delta[mod + '|' + k] = v;
    }
  }
  return delta;
}

/** {"module|key": value} -> {module: {key: value}} in language-pack format */
function expandToPackFormat(flat) {
  const contents = Object.create(null);
  for (const [k, v] of Object.entries(flat)) {
    const i = k.indexOf('|');
    if (i < 0) continue;
    const mod = k.slice(0, i);
    const key = k.slice(i + 1);
    (contents[mod] || (contents[mod] = Object.create(null)))[key] = v;
  }
  return contents;
}

module.exports = { readCatalog, readPackTranslations, computeDelta, forkOnly, expandToPackFormat };
