# antigravity-i18n

[![CI](https://github.com/HNUYJJ/antigravity-i18n/actions/workflows/ci.yml/badge.svg)](https://github.com/HNUYJJ/antigravity-i18n/actions/workflows/ci.yml)

**Community language packs for [Google Antigravity](https://antigravity.google) — in every language, not just one.**
**Google Antigravity 社区多语言语言包 —— 让 Agent 时代的 IDE 说你的母语。**

> Google Antigravity ships **English-only** ([community feature request](https://discuss.ai.google.dev/t/add-language-settings-to-antigravity/169954), unanswered). The official VS Code language packs cover only the base editor UI; **Antigravity's own UI** — the Agent Manager window, agent panel, welcome screen, agent sessions, model management, quick settings — is not covered by *any* official pack, in *any* language.
>
> This project closes that gap for **all languages**: the VS Code base stays with the official MS packs, we compute the **exact delta** they miss and translate that, and the i18n-less React agent surfaces get a guarded, reversible patch. 中文说明见下方表格。

## What gets translated, and how / 翻译范围与机制

| surface | mechanism | update-safe |
| --- | --- | --- |
| VS Code base UI (menus, editor, settings…) | official MS language packs (install alongside) | ✅ managed by MS |
| Workbench-level agent UI: agent side panel, welcome, agent sessions, model management, chat status (`nls.*` catalog) | **language pack VSIX** built from this repo, installed through Antigravity's own CLI — the official NLS mechanism, verified merging with the MS pack | ✅ untranslated keys fall back to English |
| Agent Manager window + React agent panel (`out/jetskiAgent/main.js`, `out/vs/workbench/workbench.desktop.main.js` — no i18n hooks) | **guarded string patch**: pristine backup → syntax-validated replacement → **product.json checksums re-synced** (the IDE verifies SHA-256 at startup and otherwise warns "installation appears corrupt") → hash marker → one-command restore; re-applies cleanly after IDE updates | ⚠️ reversible by design (`restore-agent`) |

On Antigravity IDE 2.5.5 the NLS delta is ~1,166 strings for zh-cn and the React agent surfaces add ~1,200 hardcoded literals. That is a weekend-sized workload per language — which is exactly why no one has done it beyond Chinese, and nobody has done it beyond Chinese at all.

**Honesty note:** only `patch-agent` modifies files inside the IDE install, and only because those surfaces have no supported i18n mechanism. It keeps pristine `.agy-orig` backups, runs `node --check` on the patched output *before* writing, records hashes in marker files, and — importantly — **re-computes and updates the `product.json` integrity checksums** for every patched file, so Google's startup integrity check keeps passing instead of scaring users with "your installation appears to be corrupt". `restore-agent` reverts files *and* checksums exactly. The `strings.json` language-pack path never touches app files.

## Quick start

```bash
git clone https://github.com/HNUYJJ/antigravity-i18n
cd antigravity-i18n

# 1) workbench-level agent UI + full integration (official language pack):
node bin/cli.js install zh-cn     # build + install + set locale; restart Antigravity IDE

# 2) Agent Manager window + React agent panel:
node bin/cli.js patch-agent zh-cn # fully close Antigravity windows first; restore: restore-agent
```

No Node on your machine? Grab a prebuilt VSIX from [Releases](https://github.com/HNUYJJ/antigravity-i18n/releases) and install it with Antigravity's own CLI: `"Antigravity IDE.exe" --install-extension <file>.vsix`.

Requires Node ≥ 18. Windows verified; macOS/Linux paths implemented (testers welcome).

## Commands

| command | what it does |
| --- | --- |
| `node bin/cli.js status` | detected IDE install, installed packs, current locale |
| `node bin/cli.js scan` | compute per-language NLS worklists into `locales/_meta/` |
| `node bin/cli.js scaffold <lang>` | create `locales/<lang>/strings.json` from the worklist |
| `node bin/cli.js build <lang>` | build `dist/antigravity-language-pack-<lang>-*.vsix` |
| `node bin/cli.js install <lang>` | build + install via the IDE's own CLI + set `argv.json` locale |
| `node bin/cli.js uninstall <lang>` | remove the pack for `<lang>` |
| `node bin/cli.js validate <lang>` | quality gates: placeholders, markdown links, no-op translations (CI-enforced) |
| `node bin/cli.js scan-agent` | extract candidate UI literals from the agent React bundle |
| `node bin/cli.js patch-agent <lang>` | patch the agent-UI bundle (backup + syntax check + marker) |
| `node bin/cli.js restore-agent` | restore the pristine agent-UI bundle |
| `node bin/cli.js agent-status` | show whether/when/how the bundle is patched |

## How it works

1. **scan** reads the IDE's `out/nls.keys.json` + `out/nls.messages.json` (the full English catalog: 1,390 modules / 16,555 strings on 2.5.5) and diffs it against every MS-style base pack you have installed. The diff is your exact translation workload.
2. **translate** `locales/<lang>/strings.json` (NLS) and `locales/<lang>/agent-ui.json` (agent surfaces) — flat maps; untranslated keys simply stay English, nothing breaks.
3. **build** packages the NLS part into a standard language-pack VSIX (`contributes.localizations`, engine `*`); **install** uses Antigravity's own CLI — the same mechanism as the official MS pack. Verified: both packs register and merge in the IDE's `languagepacks.json`.
4. **patch-agent** replaces exact string literals in the React bundle (`"Queued Messages"` → `"排队消息"`), preserving quote styles and JS escapes. Enum-like values used in logic (e.g. `Queue`, `Running`) are deliberately left untranslated.

Zero npm dependencies. Windows / macOS / Linux. `npm test` runs an 18-case offline self-test suite (zip roundtrip, checksum format, NLS diffing, replacement edge cases, validate gates, and the full patch lifecycle: patch → idempotence → restore → rebase-after-update → downgrade-guard), enforced in CI.

## Language status

| language | NLS strings | agent-UI strings | status |
| --- | --- | --- | --- |
| 🇨🇳 中文（简体） zh-cn | 409 / 1166 | 391 keys — 2,182 replacements applied | seeded by @HNUYJJ — **PRs welcome** |
| 🇯🇵 日本語 ja | — | 391 keys seeded | agent-UI usable now (`patch-agent ja`); NLS **help wanted** |
| 🇰🇷 한국어 ko | — | — | **help wanted** |
| 🇷🇺 Русский ru | — | — | **help wanted** |
| 🇪🇸 🇧🇷 🇫🇷 🇩🇪 🇹🇷 … | — | — | **help wanted** |

Adding a language is two JSON files: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## FAQ

**Does this modify or break Antigravity?** The language-pack path never touches app files — it installs a standard extension via the IDE's own CLI and sets `argv.json`'s `locale`. `patch-agent` modifies one JS bundle, with backup + pre-write syntax validation + hash marker; `restore-agent` reverts it exactly.

**What happens when Antigravity updates?** The language pack keeps working — new/changed strings fall back to English; re-run `scan` for the new (usually tiny) delta. For the agent bundle, the marker hash won't match the replaced file anymore, so `patch-agent` automatically backs up the *new* pristine bundle and re-applies.

**Is this affiliated with Google?** No. "Antigravity" is a trademark of Google LLC; this is an independent community project, nominatively describing what it translates. All translations are original work by contributors, MIT-licensed.

**Why not inject into the asar like other localization tools?** We do where there is no alternative (the React agent surfaces), but as a *reversible, validated, marked* patch of a single file — not asar repacking. The language-pack mechanism is the supported path wherever it exists, and it covers far more than the Chinese-only tools ever attempted.

## Roadmap

- [x] delta scan tooling (works against any installed base pack)
- [x] zh-cn NLS seed (409 strings) + official-CLI install verified on Windows
- [x] zh-cn agent-UI seed (~330 keys) + guarded patching with backup/restore
- [x] verified two-pack merge with the official MS language pack
- [ ] ja / ko / ru / es / pt-br seeds
- [ ] publish packs to Open VSX for one-click install
- [ ] mac/linux verification

## License

MIT © antigravity-i18n contributors
