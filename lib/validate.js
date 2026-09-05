'use strict';
/**
 * Quality gates for translation files — catches the mistakes that break UIs:
 * lost placeholders, broken markdown links, stale keys, no-op translations.
 */
const fs = require('fs');
const path = require('path');

function placeholders(s) {
  const out = [];
  const re = /\{(\d+)\}/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out.sort().join(',');
}

function mdLinks(s) {
  return (s.match(/\]\(/g) || []).length;
}

/** Product names that legitimately stay identical across languages. */
const PRODUCT_NAME = /^(copilot(\s?(free|pro|pro\+|business|enterprise)|\.?)|antigravity|mcp|gemini|jetski|ide|vs code|github|chrome|google|codex)$/i;

function isLegitNoOp(en, tr) {
  if (en !== tr) return false;
  if (/\{\d+\}/.test(en)) return true; // pure placeholder passthrough, e.g. "{0}%"
  return PRODUCT_NAME.test(en.trim());
}

function validateNls(repoRoot, lang) {
  const refFile = path.join(repoRoot, 'locales', '_meta', `${lang}.missing.json`);
  const trFile = path.join(repoRoot, 'locales', lang, 'strings.json');
  if (!fs.existsSync(refFile)) return { available: false, reason: `no worklist ${path.relative(repoRoot, refFile)} — run scan with the official base pack installed` };
  const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));
  const tr = JSON.parse(fs.readFileSync(trFile, 'utf8'));
  const problems = [];
  let translated = 0;
  for (const [k, v] of Object.entries(tr)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    translated++;
    const en = ref[k];
    if (en === undefined) { problems.push(`stale key (not in worklist): ${k}`); continue; }
    if (placeholders(en) !== placeholders(v)) problems.push(`placeholders changed: ${k}\n    en: ${en}\n    ${lang}: ${v}`);
    if (mdLinks(en) !== mdLinks(v)) problems.push(`markdown link count changed: ${k}\n    en: ${en}\n    ${lang}: ${v}`);
    if (!isLegitNoOp(en, v) && v === en) problems.push(`translation identical to English (no-op): ${k}`);
  }
  return { available: true, total: Object.keys(tr).length, translated, problems };
}

function validateAgentUi(repoRoot, lang) {
  const file = path.join(repoRoot, 'locales', lang, 'agent-ui.json');
  if (!fs.existsSync(file)) return { available: false, reason: `no ${path.relative(repoRoot, file)}` };
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  let translated = 0;
  for (const [en, v] of Object.entries(map)) {
    if (en.startsWith('_')) continue;
    if (typeof v !== 'string' || !v.trim()) continue;
    translated++;
    if (placeholders(en) !== placeholders(v)) problems.push(`placeholders changed: "${en}" -> "${v}"`);
    if (!isLegitNoOp(en, v) && v === en) problems.push(`translation identical to English (no-op): "${en}"`);
    if (/\{[a-zA-Z]/.test(v)) problems.push(`suspicious placeholder in translation: "${v}"`);
  }
  return { available: true, total: Object.keys(map).length, translated, problems };
}

function validate(repoRoot, lang) {
  const nls = validateNls(repoRoot, lang);
  const agent = validateAgentUi(repoRoot, lang);
  const problems = [...(nls.problems || []), ...(agent.problems || [])];
  return { lang, nls, agent, problems, ok: problems.length === 0 };
}

module.exports = { validate };
