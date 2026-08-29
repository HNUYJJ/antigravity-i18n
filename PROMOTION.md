# 推广与增长手册（内部文档）

目标不是刷 star，而是**真实用户 + 真实贡献者**——这既是项目活下去的燃料，也是申请 OpenAI [Codex for Open Source](https://developers.openai.com/community/codex-for-oss)（6 个月免费 ChatGPT Pro，要求"核心维护者/被广泛使用的公开项目"，无硬性 star 门槛）的底气。

## 0. 发布前 checklist

- [ ] 把仓库/包名里的 `HNUYJJ` 全部替换成真实 GitHub 用户名
- [ ] 录一张 30 秒 GIF：重启前后 Agent 面板/欢迎页对比（放 README 顶部，这是转化率的第一决定因素）
- [ ] GitHub Release 附上编译好的 `.vsix`（不想装 Node 的用户直接拖进 IDE 即可）
- [ ] topics 加齐：`antigravity` `google` `gemini` `i18n` `language-pack` `localization`
- [ ] 建好 issue 模板：`translation: <lang>` 一个模板，降低贡献门槛

## 1. 中文圈（首发阵地）

| 渠道 | 打法 |
| --- | --- |
| V2EX `/go/create` | 标题直接说痛点："Antigravity 界面汉化补全：官方语言包不管的那 1166 条，我来补" |
| linux.do | 已有[官方功能请求帖](https://discuss.ai.google.dev/t/add-language-settings-to-antigravity/169954)和教程帖，去补充"更干净的方案"（不碰 asar、不怕升级） |
| 知乎 | 回答"Antigravity 怎么设置中文"类问题（这类问题正持续被搜索） |
| 少数派 / 即刻 | 截图 + 一键命令 |
| B 站 | 3 分钟演示视频（README/GIF 素材直接复用） |

中文注意：cshitian、yuexps、qqxpee（455★，ASAR 注入路线）等项目已存在，**别踩它们，链接它们**——我们的差异点是"纯官方机制、不怕升级、多语言"。在 README 的 FAQ 里明确对比，国内社区吃"升级不失效"这个点。

## 2. 多语言圈（真正的增量）

这是本项目和所有现有竞品的本质区别——每个语言就是一个新市场：

- 🇯🇵 Qiita / X 的 #antigravityJP
- 🇰🇷 velog / OKKY
- 🇷🇺 Habr / Telegram 频道
- 🇪🇸🇧🇷 dev.to / Medium
- 🌍 Reddit r/vscode、r/GoogleGeminiAI、Hacker News（Show HN，挑周二~周四美东早上发）

每开一个新语言种子，就在该语言社区发一次——**每个语言都是一次小型 launch**。贡献者 PR 进来后会自带传播（他们的 follower 会看到）。

## 3. 借官方的势

- 在 Google AI Dev Forum 那个功能请求帖下回复社区方案链接（解决官方未解的问题，Google 员工在看）
- Antigravity 官方 Discord 的 feedback 频道
- 如果官方哪天内置了 i18n（大概率会）：项目转型为"官方覆盖前后的 delta 包 + 长尾语言"，或转向 Agent Manager 窗口（独立 Electron 应用，无 NLS 目录，官方语言包机制管不到，是明确的第二战场）

## 4. 增长回路设计（已经内置在项目里）

1. `scaffold <lang>` 让"贡献翻译"变成一个 JSON 文件的 PR
2. README 语言状态表把"help wanted"写在明面上
3. 每期 Release notes 致谢翻译贡献者
4. `scan` 让项目在 Antigravity 每次升级后都有一次自然更新曝光

## 5. 何时申请 Codex for Open Source

真实节奏参考：先让项目有 100+ 真实用户信号（Release 下载量、issue 数、外部教程引用），再附上"维护者 + 项目作用"的说明去申请 [openai.com/form/codex-for-oss](https://openai.com/form/codex-for-oss/)。官方明确欢迎"生态重要性"叙事：一个让非英语开发者真正用上 Agent IDE 的项目，讲得通。用免费额度持续维护翻译流水线（新版本 delta 扫描、多语言审校）——这本身就是站得住的申请理由。
