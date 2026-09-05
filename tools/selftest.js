'use strict';
/**
 * Offline self-test suite (zero dependencies). Run: npm test
 * Covers the pipelines that have bitten us before: zip roundtrip, checksum
 * format, NLS diffing, literal replacement edge cases, validate rules, and the
 * full patch lifecycle (patch → idempotence → restore → rebase-after-update →
 * restore-guard against downgrades).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');

const { zipStore, unzip, crc32 } = require('../lib/zip');
const { expandToPackFormat, computeDelta } = require('../lib/nls');
const { applyTranslations, patchAgentBundle, restoreAgentBundle, restoreIntegrity, syncIntegrity, computeChecksum, readMarker, extractCandidates } = require('../lib/agentui');
const { validate } = require('../lib/validate');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (err) { failures.push({ name, err }); console.error('  FAIL ' + name + ' — ' + err.message); }
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agy18n-test-'));
}

console.log('== zip ==');
test('crc32 known vector', () => {
  assert.equal(crc32(Buffer.from('123456789')) >>> 0, 0xcbf43926);
});
test('zip roundtrip with unicode + special names', () => {
  const entries = [
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'extension/translations/中文.json', data: '{"a":"值"}' },
    { name: 'extension.vsixmanifest', data: '<Manifest/>' },
  ];
  const buf = zipStore(entries);
  const out = unzip(buf);
  assert.equal(out.size, entries.length);
  for (const e of entries) assert.equal(out.get(e.name).toString('utf8'), e.data);
});

console.log('== checksums ==');
test('computeChecksum = sha256 base64 without padding', () => {
  // sha256("hello") base64 = "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ="
  assert.equal(computeChecksum(Buffer.from('hello')), 'LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ');
});

console.log('== nls ==');
const plain = (x) => JSON.parse(JSON.stringify(x)); // strip null prototypes (kept in lib on purpose: prototype-pollution safety)
test('expandToPackFormat splits module|key', () => {
  assert.deepEqual(plain(expandToPackFormat({ 'mod/a|k1': 'v1', 'mod/a|k2': 'v2', 'mod/b|k3': 'v3' })),
    { 'mod/a': { k1: 'v1', k2: 'v2' }, 'mod/b': { k3: 'v3' } });
});
test('computeDelta finds uncovered modules and missing keys', () => {
  const app = { m1: { k1: 'A', k2: 'B' }, m2: { k3: 'C' } };
  const pack = { m1: { k1: 'AA' } };
  assert.deepEqual(plain(computeDelta(app, pack)), { 'm1|k2': 'B', 'm2|k3': 'C' });
});

console.log('== applyTranslations ==');
test('replaces preserving double and single quotes', () => {
  const { bundleJs, applied, missed } = applyTranslations('x="Open";y=\'Open\';z="Close"', { Open: '打开' });
  assert.equal(bundleJs, 'x="打开";y=\'打开\';z="Close"');
  assert.equal(applied, 2);
  assert.deepEqual(missed, []); // 'Close' is not a map key, so it can't be "missed"
});
test('escapes quotes inside translations (output stays valid JS)', () => {
  const { bundleJs } = applyTranslations('a="New Chat";', { 'New Chat': '新建"聊天"' });
  assert.equal(bundleJs, 'a="新建\\"聊天\\"";');
});
test('does not touch longer strings containing the key', () => {
  const { bundleJs } = applyTranslations('d="Open Settings";', { Open: '打开' });
  assert.equal(bundleJs, 'd="Open Settings";');
});
test('extractor captures placeholders with @ and /', () => {
  const js = 'el({placeholder:"Ask anything, @ to mention, / for actions",label:\'Split View\'})';
  const cands = extractCandidates(js);
  assert.ok(cands.includes('Ask anything, @ to mention, / for actions'));
  assert.ok(cands.includes('Split View'));
});

console.log('== validate ==');
test('placeholder/link/stale gates fire; product-name no-op allowed', () => {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, 'locales', '_meta'), { recursive: true });
  fs.mkdirSync(path.join(root, 'locales', 'tst'), { recursive: true });
  fs.writeFileSync(path.join(root, 'locales', '_meta', 'tst.missing.json'), JSON.stringify({
    'a|k1': 'Files: {0}',
    'a|k2': 'See [Docs](u) and [More](m)',
    'a|k3': 'Copilot Pro',
  }));
  fs.writeFileSync(path.join(root, 'locales', 'tst', 'strings.json'), JSON.stringify({
    'a|k1': '文件：{1}',               // placeholder changed -> violation
    'a|k2': '见 [文档](u)',             // link count changed -> violation
    'a|k3': 'Copilot Pro',            // product-name no-op -> allowed
    'a|stale': 'x',                   // not in worklist -> violation
  }));
  const r = validate(root, 'tst');
  const joined = r.problems.join('\n');
  assert.equal(r.ok, false);
  assert.ok(/placeholders changed: a\|k1/.test(joined), joined);
  assert.ok(/markdown link count changed: a\|k2/.test(joined), joined);
  assert.ok(/stale key \(not in worklist\): a\|stale/.test(joined), joined);
  assert.ok(!/a\|k3/.test(joined), 'product-name no-op must not be flagged');
});
test('placeholder passthrough no-op allowed', () => {
  const root = tmpdir();
  fs.mkdirSync(path.join(root, 'locales', '_meta'), { recursive: true });
  fs.mkdirSync(path.join(root, 'locales', 'tst'), { recursive: true });
  fs.writeFileSync(path.join(root, 'locales', '_meta', 'tst.missing.json'), JSON.stringify({ 'a|q': '{0}%' }));
  fs.writeFileSync(path.join(root, 'locales', 'tst', 'strings.json'), JSON.stringify({ 'a|q': '{0}%' }));
  const r = validate(root, 'tst');
  assert.equal(r.ok, true, r.problems.join('\n'));
});

console.log('== patch lifecycle (fake IDE app dir) ==');
const MAP = { 'Queued Messages': '排队消息', 'New Conversation': '新建对话' };
function fakeApp() {
  const app = path.join(tmpdir(), 'resources', 'app');
  fs.mkdirSync(path.join(app, 'out', 'jetskiAgent'), { recursive: true });
  fs.mkdirSync(path.join(app, 'out', 'vs', 'workbench'), { recursive: true });
  const orig1 = Buffer.from('const q="Queued Messages";const n="New Conversation";', 'utf8');
  const orig2 = Buffer.from('const f="AI may make mistakes.";const q="Queued Messages";', 'utf8');
  fs.writeFileSync(path.join(app, 'out', 'jetskiAgent', 'main.js'), orig1);
  fs.writeFileSync(path.join(app, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'), orig2);
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({
    nameShort: 'Fake', version: '1.0.0',
    checksums: {
      'jetskiAgent/main.js': computeChecksum(orig1),
      'vs/workbench/workbench.desktop.main.js': computeChecksum(orig2),
    },
  }, null, '\t'));
  return { app, orig1, orig2 };
}
const B1 = path.join('out', 'jetskiAgent', 'main.js');

test('first patch: translated, checksums synced, backup+marker present', () => {
  const { app, orig1 } = fakeApp();
  const r1 = patchAgentBundle(path.join(app, B1), MAP, { lang: 'tst', version: '0.0.0' });
  assert.equal(r1.status, 'patched');
  assert.equal(r1.applied, 2);
  syncIntegrity(app, ['jetskiAgent/main.js']);
  const patched = fs.readFileSync(path.join(app, B1), 'utf8');
  assert.ok(patched.includes('排队消息') && patched.includes('新建对话'));
  assert.ok(fs.existsSync(path.join(app, B1) + '.agy-orig'));
  assert.equal(readMarker(path.join(app, B1)).lang, 'tst');
  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  assert.equal(product.checksums['jetskiAgent/main.js'], computeChecksum(Buffer.from(patched, 'utf8')));
  assert.notEqual(product.checksums['jetskiAgent/main.js'], computeChecksum(orig1));
});
test('re-patch with same map is a no-op (already-patched)', () => {
  const { app } = fakeApp();
  const b = path.join(app, B1);
  patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  const before = fs.readFileSync(b);
  const r = patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  assert.equal(r.status, 'already-patched');
  assert.deepEqual(fs.readFileSync(b), before);
});
test('restore: original bytes back, checksums back, state cleaned', () => {
  const { app, orig1 } = fakeApp();
  const b = path.join(app, B1);
  patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  const r = restoreAgentBundle(b);
  assert.equal(r.status, 'restored');
  assert.deepEqual(fs.readFileSync(b), orig1);
  assert.ok(!fs.existsSync(b + '.agy-orig') && !fs.existsSync(b + '.agy-i18n.json'));
  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  assert.equal(product.checksums['jetskiAgent/main.js'], computeChecksum(orig1));
});
test('restoreIntegrity is surgical: unrelated product.json changes survive', () => {
  const { app, orig1 } = fakeApp();
  const b = path.join(app, B1);
  patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  syncIntegrity(app, ['jetskiAgent/main.js']);
  const productPath = path.join(app, 'product.json');
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  product.version = '2.0.0'; // simulate IDE update metadata change
  fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'));
  const ri = restoreIntegrity(app);
  assert.equal(ri.status, 'restored');
  const after = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  assert.equal(after.version, '2.0.0', 'unrelated fields must be preserved');
  assert.equal(after.checksums['jetskiAgent/main.js'], computeChecksum(orig1), 'checksum must be restored to the pre-patch value');
});
test('rebase after IDE update: new pristine is backed up and patched', () => {
  const { app } = fakeApp();
  const b = path.join(app, B1);
  patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  const newPristine = Buffer.from('const n="New Conversation";const extra="Agent Behavior";', 'utf8');
  fs.writeFileSync(b, newPristine); // installer replaced the file
  const r = patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  assert.equal(r.status, 'patched');
  assert.deepEqual(fs.readFileSync(b + '.agy-orig'), newPristine, 'backup must be the NEW pristine');
  const patched = fs.readFileSync(b, 'utf8');
  assert.ok(patched.includes('新建对话'));
  assert.ok(patched.includes('Agent Behavior'), 'new untranslated string must remain');
  // restore returns exactly the new pristine
  assert.equal(restoreAgentBundle(b).status, 'restored');
  assert.deepEqual(fs.readFileSync(b), newPristine);
});
test('restore refuses to downgrade after update (stale state cleared)', () => {
  const { app, orig1 } = fakeApp();
  const b = path.join(app, B1);
  patchAgentBundle(b, MAP, { lang: 'tst', version: '0.0.0' });
  const newPristine = Buffer.from('const fresh="New Conversation";', 'utf8');
  fs.writeFileSync(b, newPristine); // update replaced file; marker now stale
  const r = restoreAgentBundle(b);
  assert.equal(r.status, 'stale-state-cleared');
  assert.deepEqual(fs.readFileSync(b), newPristine, 'current (new) file must NOT be overwritten by old backup');
  assert.ok(!fs.existsSync(b + '.agy-orig') && !fs.existsSync(b + '.agy-i18n.json'));
});
test('full IDE simulation: patch both targets + syncIntegrity matches every entry', () => {
  const { app } = fakeApp();
  for (const rel of ['jetskiAgent/main.js', 'vs/workbench/workbench.desktop.main.js']) {
    const r = patchAgentBundle(path.join(app, 'out', rel), MAP, { lang: 'tst', version: '0.0.0' });
    assert.equal(r.status, 'patched');
    syncIntegrity(app, [rel]);
  }
  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  for (const [rel, ck] of Object.entries(product.checksums)) {
    const actual = computeChecksum(fs.readFileSync(path.join(app, 'out', rel)));
    assert.equal(actual, ck, 'checksum mismatch for ' + rel);
  }
});

console.log('');
if (failures.length) {
  console.error(`${failures.length}/${passed + failures.length} tests FAILED`);
  process.exit(1);
}
console.log(`${passed}/${passed} tests passed`);
