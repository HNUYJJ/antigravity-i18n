#!/usr/bin/env node
'use strict';
/**
 * antigravity-i18n CLI — community language packs for Google Antigravity.
 *
 *   agy18n scan                 compute per-language translation workloads
 *   agy18n status               show detected installs, packs and locale
 *   agy18n build <lang>         build dist/…vsix from locales/<lang>/strings.json
 *   agy18n install <lang>       build + install via the IDE CLI, set argv.json locale
 *   agy18n uninstall <lang>     remove our pack for <lang>
 *   agy18n scaffold <lang>      create locales/<lang>/strings.json from the worklist
 */
const fs = require('fs');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');
const { findIde, findBasePacks } = require('../lib/locate');
const { scan, topModules } = require('../lib/scan');
const { buildVsix, extensionId } = require('../lib/vsix');
const { install, uninstall, setLocale, listInstalled, readLocale } = require('../lib/install');
const { extractCandidates, patchAgentBundle, restoreAgentBundle, targetPaths, syncIntegrity, restoreIntegrity, readMarker } = require('../lib/agentui');
const { validate } = require('../lib/validate');

/** Like mustIde, but build works in CI/containers without a local Antigravity install. */
function optionalIde() {
  return findIde() || { appDir: '', version: '', ideVersion: '', dataDir: '', cli: null };
}

function languages() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'locales', 'languages.json'), 'utf8'));
}

function pkgVersion() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
}

function mustIde() {
  const ide = findIde();
  if (!ide) {
    console.error('Could not locate an Antigravity IDE installation.\nSet ANTIGRAVITY_APP_DIR=<...>/resources/app and retry.');
    process.exit(1);
  }
  return ide;
}

function mustLang(lang) {
  const langs = languages();
  const meta = langs[lang];
  if (!meta) {
    console.error(`Unknown language "${lang}". Known: ${Object.keys(langs).join(', ')}.\nAdd it to locales/languages.json first (see CONTRIBUTING.md).`);
    process.exit(1);
  }
  return meta;
}

const [, , cmd, arg] = process.argv;
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const verbose = flags.includes('--verbose');
const noCli = flags.includes('--no-cli');

try {
  switch (cmd) {
    case 'scan': {
      const ide = mustIde();
      const lang = arg && !arg.startsWith('--') ? arg : undefined;
      const s = scan({ repoRoot, ide, lang });
      console.log(`Antigravity IDE ${s.ide.ideVersion || s.ide.version} — ${s.catalog.modules} modules / ${s.catalog.messages} messages`);
      console.log(`Base packs installed: ${s.basePacksDetected.join(', ') || 'none'}`);
      for (const g of s.generated) console.log(`  ${g.lang.padEnd(8)} ${String(g.strings).padStart(5)} strings  ->  ${g.file}  (${g.basis})`);
      console.log(`Fork-specific strings overall: ${s.forkStrings} (locales/_meta/fork.en.json)`);
      break;
    }
    case 'status': {
      const ide = mustIde();
      console.log(`IDE install : ${ide.appDir}`);
      console.log(`Version     : Antigravity ${ide.ideVersion || '?'} (VS Code base ${ide.version})`);
      console.log(`CLI         : ${ide.cli || 'not found'}`);
      console.log(`Data dir    : ${ide.dataDir}`);
      console.log(`Locale      : ${readLocale(ide.dataDir) || '(system default)'}`);
      const inst = listInstalled(ide);
      console.log(`Our packs   : ${inst.ours.join(', ') || 'none'}`);
      console.log(`Base packs  : ${inst.base.join(', ') || 'none'}`);
      break;
    }
    case 'build': {
      if (!arg) { console.error('usage: agy18n build <lang>'); process.exit(1); }
      const meta = mustLang(arg);
      if (!fs.existsSync(path.join(repoRoot, 'locales', arg, 'strings.json'))) {
        console.log(`${arg}: no NLS strings.json yet — nothing to build as a VSIX.`);
        console.log('(agent-UI translations work independently: agy18n patch-agent ' + arg + ')');
        break;
      }
      const r = buildVsix({
        repoRoot, lang: arg, meta,
        outDir: path.join(repoRoot, 'dist'),
        version: pkgVersion(),
        ideInfo: optionalIde(),
      });
      console.log(`Built ${path.relative(repoRoot, r.outFile)} — ${r.translated} translated strings across ${r.modules} modules`);
      break;
    }
    case 'validate': {
      if (!arg) { console.error('usage: agy18n validate <lang>'); process.exit(1); }
      mustLang(arg);
      const r = validate(repoRoot, arg);
      if (!r.nls.available) console.log(`nls strings.json : skipped (${r.nls.reason})`);
      else console.log(`nls strings.json : ${r.nls.translated}/${r.nls.total} translated`);
      if (!r.agent.available) console.log(`agent-ui.json    : skipped (${r.agent.reason})`);
      else console.log(`agent-ui.json    : ${r.agent.translated}/${r.agent.total} translated`);
      if (r.ok) {
        console.log(`OK — no quality gate violations for ${arg}`);
      } else {
        console.error(`FAIL — ${r.problems.length} violation(s):`);
        for (const p of r.problems) console.error('  - ' + p);
        process.exit(1);
      }
      break;
    }
    case 'install': {
      if (!arg) { console.error('usage: agy18n install <lang> [--no-cli] [--verbose]'); process.exit(1); }
      const ide = mustIde();
      const meta = mustLang(arg);
      const built = buildVsix({
        repoRoot, lang: arg, meta,
        outDir: path.join(repoRoot, 'dist'),
        version: pkgVersion(),
        ideInfo: ide,
      });
      console.log(`Built ${path.relative(repoRoot, built.outFile)} (${built.translated} strings)`);
      const r = install(ide, built.outFile, arg, pkgVersion(), { verbose, noCli });
      const argvFile = setLocale(ide.dataDir, meta.languageId);
      console.log(`Installed (${r.how}): ${r.message}`);
      console.log(`Locale set to "${meta.languageId}" in ${argvFile}`);
      console.log('→ Restart Antigravity to apply. Uninstall anytime with: agy18n uninstall ' + arg);
      break;
    }
    case 'uninstall': {
      if (!arg) { console.error('usage: agy18n uninstall <lang>'); process.exit(1); }
      const ide = mustIde();
      const r = uninstall(ide, arg);
      console.log(`${r.message} (${r.how})`);
      break;
    }
    case 'scaffold': {
      if (!arg) { console.error('usage: agy18n scaffold <lang>'); process.exit(1); }
      mustLang(arg);
      const worklist = path.join(repoRoot, 'locales', '_meta', `${arg}.missing.json`);
      const fallback = path.join(repoRoot, 'locales', '_meta', 'fork.en.json');
      const source = [worklist, fallback].find((f) => fs.existsSync(f));
      if (!source) { console.error('No worklist found — run `agy18n scan` first.'); process.exit(1); }
      const en = JSON.parse(fs.readFileSync(source, 'utf8'));
      const dir = path.join(repoRoot, 'locales', arg);
      fs.mkdirSync(dir, { recursive: true });
      const stringsFile = path.join(dir, 'strings.json');
      if (fs.existsSync(stringsFile)) { console.error(`${stringsFile} already exists — not overwriting.`); process.exit(1); }
      const skeleton = {};
      for (const [k, v] of Object.entries(en)) skeleton[k] = ''; // translator fills these in
      fs.writeFileSync(stringsFile, JSON.stringify(skeleton, null, '\t'));
      console.log(`Created ${path.relative(repoRoot, stringsFile)} with ${Object.keys(en).length} slots (empty = English fallback).`);
      console.log(`English reference: ${path.relative(repoRoot, source)}`);
      console.log(`Top modules to start with:`);
      for (const [mod, n] of topModules(en, 10)) console.log(`  ${mod} (${n})`);
      break;
    }
    case 'scan-agent': {
      const ide = mustIde();
      const bundle = agentBundlePath(ide);
      const cands = extractCandidates(fs.readFileSync(bundle, 'utf8'));
      const filtered = cands.filter((s) => /^[A-Z][A-Za-z0-9 '&,.:%+()/\-]{2,58}$/.test(s) && /[a-z]{3}/.test(s));
      const out = path.join(repoRoot, 'locales', '_meta', 'agent-ui.filtered.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(filtered, null, 1));
      console.log(`${path.relative(repoRoot, bundle)}: ${filtered.length} candidate UI strings -> ${path.relative(repoRoot, out)}`);
      break;
    }
    case 'patch-agent': {
      if (!arg) { console.error('usage: agy18n patch-agent <lang>'); process.exit(1); }
      mustLang(arg);
      const ide = mustIde();
      const mapFile = path.join(repoRoot, 'locales', arg, 'agent-ui.json');
      if (!fs.existsSync(mapFile)) { console.error(`no agent-ui map: ${path.relative(repoRoot, mapFile)}`); process.exit(1); }
      const raw = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
      const map = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
      const integrityPatched = [];
      for (const t of targetPaths(ide)) {
        if (!fs.existsSync(t.abs)) { console.log(`skip (not found): ${t.rel}`); continue; }
        const r = patchAgentBundle(t.abs, map, { lang: arg, version: pkgVersion(), target: t.rel });
        console.log(`${r.status}: ${t.rel} — ${r.applied} replacements${r.missed && r.missed.length ? ` (missed ${r.missed.length}: ${r.missed.slice(0, 8).join(' | ')}${r.missed.length > 8 ? '…' : ''})` : ''}`);
        if (r.status === 'patched') integrityPatched.push(t.integrity);
      }
      const synced = syncIntegrity(ide.appDir, integrityPatched);
      if (synced.length) console.log(`product.json checksums synced: ${synced.join(', ')} (integrity check will pass)`);
      console.log('→ Fully close Antigravity windows (IDE + Manager) and reopen to apply. Restore with: agy18n restore-agent');
      break;
    }
    case 'restore-agent': {
      const ide = mustIde();
      for (const t of targetPaths(ide)) {
        const r = restoreAgentBundle(t.abs);
        if (r.status !== 'not-patched') console.log(`${r.status}${r.was ? ` (was: ${r.was})` : ''}: ${t.rel}`);
      }
      const ri = restoreIntegrity(ide.appDir);
      if (ri.status === 'restored') console.log('restored: product.json (original checksums)');
      console.log('done');
      break;
    }
    case 'agent-status': {
      const ide = mustIde();
      for (const t of targetPaths(ide)) {
        const m = readMarker(t.abs);
        console.log(m ? `patched: ${t.rel} lang=${m.lang} applied=${m.applied} at ${m.patchedAt}` : `not patched: ${t.rel}`);
      }
      break;
    }
    default:
      console.log(__doc__);
  }
} catch (err) {
  console.error('error:', err.message);
  if (verbose) console.error(err.stack);
  process.exit(1);
}

const __doc__ = `
antigravity-i18n — community language packs for Google Antigravity

commands:
  scan               compute per-language translation workloads (writes locales/_meta/*)
  status             show detected IDE install, installed packs, current locale
  build <lang>       build dist/antigravity-language-pack-<lang>-*.vsix
  install <lang>     build + install + set argv.json locale  [--no-cli] [--verbose]
  uninstall <lang>   remove our pack for <lang>
  scaffold <lang>    create locales/<lang>/strings.json from the scan worklist

env overrides:
  ANTIGRAVITY_APP_DIR   path to an install's resources/app
  ANTIGRAVITY_DATA_DIR  path to the IDE user-data folder

docs: https://github.com/HNUYJJ/antigravity-i18n
`;
