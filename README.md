# antigravity-i18n

**Community language packs for [Google Antigravity](https://antigravity.google) — in every language, not just one.**
**Google Antigravity 社区多语言语言包 —— 让 Agent 时代的 IDE 说你的母语。**

> Google Antigravity ships **English-only**. The official VS Code language packs cover the base editor UI, but **Antigravity's own UI** — the agent panel, welcome screen, agent sessions, model management, quick settings — is not covered by *any* official pack, in *any* language.
>
> We compute the **exact delta** against your installed base language pack and translate **only that**. No asar hacking, no binary patching — just the IDE's own, official language-pack mechanism.

[Google 官方至今未提供 Antigravity 的界面语言设置（社区功能请求](https://discuss.ai.google.dev/t/add-language-settings-to-antigravity/169954)）。本项目的思路：VS Code 底座 UI 交给微软官方语言包，Antigravity 专属 UI 由社区补齐 —— 并面向**所有语言**，而不只是中文。

## Why this exists / 为什么做这个

| | official MS packs | Antigravity's own UI | this project |
| --- | --- | --- | --- |
| VS Code base UI | ✅ | — | not touched (official packs handle it) |
| Agent panel / welcome / sessions / models UI | ❌ | English-only | ✅ translated by community |
| Languages | 12 | 0 | as many as people care about |
| Mechanism | — | — | official language-pack NLS only — survives IDE updates |

On Antigravity IDE 2.5.5 the untranslated delta is ~1,166 strings for zh-cn (~104 of them Antigravity-specific, the rest being the new agent-era UI upstream added after the last official pack). That is a weekend-sized workload per language — which is exactly why no one has done it beyond Chinese.

## Quick start

```bash
git clone https://github.com/HNUYJJ/antigravity-i18n
cd antigravity-i18n
npm run install -- zh-cn     # build + install + set locale (restart Antigravity after)
```

Requires Node ≥ 18. `uninstall`, `status`, `scan`, `build`, `scaffold` — see below.

## Commands

| command | what it does |
| --- | --- |
| `node bin/cli.js status` | detected IDE install, installed packs, current locale |
| `node bin/cli.js scan` | compute per-language worklists into `locales/_meta/` |
| `node bin/cli.js scaffold <lang>` | create `locales/<lang>/strings.json` from the worklist |
| `node bin/cli.js build <lang>` | build `dist/antigravity-language-pack-<lang>-*.vsix` |
| `node bin/cli.js install <lang>` | build + install via the IDE's own CLI + set `argv.json` locale |
| `node bin/cli.js uninstall <lang>` | remove the pack for `<lang>` |

## How it works

1. **scan** reads the IDE's `out/nls.keys.json` + `out/nls.messages.json` (the full English catalog: 1,390 modules / 16,555 strings on 2.5.5) and diffs it against every MS-style base pack you have installed. The diff is your exact translation workload.
2. **translate** `locales/<lang>/strings.json` — a flat map of `"module|key": "translation"`. Untranslated keys simply stay English; nothing breaks.
3. **build** packages the translations into a standard language-pack VSIX (`contributes.localizations`, engine `*`).
4. **install** uses Antigravity's own CLI (`antigravity-ide --install-extension …`) — the same mechanism as the official MS pack — and sets `locale` in `argv.json`.

Zero npm dependencies. Windows / macOS / Linux.

## Language status

| language | strings translated | status |
| --- | --- | --- |
| 🇨🇳 中文（简体） zh-cn | 409 / 1166 | seeded by @HNUYJJ — **PRs welcome** |
| 🇯🇵 日本語 ja | — | **help wanted** |
| 🇰🇷 한국어 ko | — | **help wanted** |
| 🇷🇺 Русский ru | — | **help wanted** |
| 🇪🇸 🇧🇷 🇫🇷 🇩🇪 🇹🇷 … | — | **help wanted** |

Adding a language is one command + one JSON file: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## FAQ

**Does this modify or break Antigravity?** No. It installs a standard language-pack extension through the IDE's own CLI and touches only `argv.json`'s `locale` field. Uninstall = one command.

**What happens when Antigravity updates?** Nothing breaks — new/changed strings simply fall back to English. Re-run `scan` to get the new worklist; updated strings are usually a tiny delta.

**Is this affiliated with Google?** No. "Antigravity" is a trademark of Google LLC; this is an independent community project, nominatively describing what it translates. All translations are original work by contributors, MIT-licensed.

**Why not patch the asar like other Chinese localization tools?** Because patched files are overwritten on every update and can desync with the app's integrity. The language-pack mechanism is the supported path — we'd rather build something that survives.

## Roadmap

- [x] delta scan tooling (works against any installed base pack)
- [x] zh-cn seed translations (agent panel, welcome, sessions, model management)
- [x] one-command build/install on Windows (mac/linux paths implemented, needs testers)
- [ ] ja / ko / ru / es / pt-br seeds
- [ ] Agent Manager window (the separate Electron app) — it has no NLS catalog, needs a different approach; tracked in `PROMOTION.md` phase 2
- [ ] publish packs to Open VSX for one-click install

## License

MIT © antigravity-i18n contributors
