# Contributing a language

The whole point of this project: **your language's workload is tiny** because the official VS Code language pack already covers the base UI. You translate only what it misses — mostly Antigravity's agent-era UI.

## 1. Scaffold

```bash
node bin/cli.js scan            # writes locales/_meta/<lang>.missing.json (your worklist)
node bin/cli.js scaffold ja     # creates locales/ja/strings.json with empty slots
```

- If an official MS language pack for your language is installed in Antigravity, the worklist is the precise delta (~1,000 strings on 2.5.5, and shrinking as MS catches up).
- If not, the worklist is the fork-specific subset (module paths containing `antigravity`/`jetski`, ~100 strings) — still very useful.

## 2. Translate

`locales/<lang>/strings.json` is a flat map:

```json
{
  "vs/workbench/contrib/antigravityFeedback/browser/antigravityFeedback.contribution|reportIssue": "問題を報告"
}
```

Rules that keep the pack working:

1. **Keep placeholders**: `{0}`, `{1}`, … must survive. `"{0} files"` → `"{0} 件のファイル"`.
2. **Keep Markdown link structure**: `[Terms]({1})` → `[利用規約]({1})` — brackets and parens stay.
3. **Menu accelerators**: `&&Reload` → `再読み込み(&&R)` — keep `&&` on one letter.
4. **Product names stay**: `Copilot Pro`, `Gemini`, `MCP`, `Agent` (per-language convention is fine — zh-cn keeps "Agent" as-is).
5. **Leave a slot empty** (`""`) if unsure — empty = English fallback, never a broken UI.
6. Don't reorder keys; don't add keys that aren't in the worklist (they're ignored anyway).

## 3. Verify locally

```bash
node bin/cli.js install ja      # build + install + set locale, then restart Antigravity
node bin/cli.js uninstall ja    # roll back
```

You can keep the official MS pack installed alongside — VS Code merges them; your pack wins only for keys it defines.

## 4. Open the PR

One language per PR. Run `node bin/cli.js build <lang>` to make sure the VSIX builds, and paste the string count in the PR description. Translators get credited in the release notes and the README table — that's the deal.

## After Antigravity updates

```bash
node bin/cli.js scan
```

The new worklist is the new delta (usually small). Update `strings.json`, bump version, PR. This is also how we stay compatible without ever patching the app.
