'use strict';
/** Scan a local Antigravity IDE and compute the per-language translation workload. */
const fs = require('fs');
const path = require('path');
const { readCatalog, readPackTranslations, computeDelta, forkOnly } = require('./nls');
const { findIde, findBasePacks } = require('./locate');

function topModules(delta, n = 25) {
  const byMod = new Map();
  for (const key of Object.keys(delta)) {
    const mod = key.slice(0, key.indexOf('|'));
    byMod.set(mod, (byMod.get(mod) || 0) + 1);
  }
  return [...byMod.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function scan({ repoRoot, ide, lang }) {
  const outDir = path.join(repoRoot, 'locales', '_meta');
  fs.mkdirSync(outDir, { recursive: true });

  const catalog = readCatalog(ide.appDir);
  const packs = findBasePacks(ide.dataDir);
  const generated = [];
  const targets = lang ? [lang] : [...packs.keys()];

  for (const l of targets) {
    let delta;
    let basis;
    if (packs.has(l)) {
      delta = computeDelta(catalog.strings, readPackTranslations(packs.get(l)));
      basis = `delta vs installed base pack for "${l}"`;
    } else {
      delta = forkOnly(catalog.strings);
      basis = 'fork-module heuristic (no base pack installed for this language)';
    }
    const file = path.join(outDir, `${l}.missing.json`);
    fs.writeFileSync(file, JSON.stringify(delta, null, '\t'));
    generated.push({ lang: l, basis, strings: Object.keys(delta).length, file: path.relative(repoRoot, file) });
  }

  // Fork-only English snapshot is always useful (independent of any base pack).
  const forkDelta = forkOnly(catalog.strings);
  const forkFile = path.join(outDir, 'fork.en.json');
  fs.writeFileSync(forkFile, JSON.stringify(forkDelta, null, '\t'));

  const summary = {
    generatedAt: new Date().toISOString(),
    ide: { version: ide.version, ideVersion: ide.ideVersion, appDir: ide.appDir },
    catalog: { modules: catalog.moduleCount, messages: catalog.totalMessages },
    basePacksDetected: [...packs.keys()],
    generated,
    forkStrings: Object.keys(forkDelta).length,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  const lines = [
    `# Translation workload report`,
    '',
    `- IDE: Antigravity IDE ${ide.ideVersion || ''} (VS Code base ${ide.version})`,
    `- Catalog: ${catalog.moduleCount} modules / ${catalog.totalMessages} messages`,
    `- Base language packs installed: ${[...packs.keys()].join(', ') || 'none'}`,
    `- Fork-specific (antigravity*/jetski*) strings: **${Object.keys(forkDelta).length}**`,
    '',
    '## Per-language workload (strings the official packs miss)',
    '',
    '| language | basis | strings | worklist |',
    '| --- | --- | ---: | --- |',
  ];
  for (const g of generated) lines.push(`| ${g.lang} | ${g.basis} | ${g.strings} | \`${g.file}\` |`);
  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n') + '\n');

  return summary;
}

module.exports = { scan, topModules };
