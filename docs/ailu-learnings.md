# Ailu 学习笔记

> 来源：https://github.com/mcncarl/ailu（Obsidian 本地 Agent 对话 + 内容发布插件，TypeScript，AGPL-3.0）
> 学习日期：2026-08-17。目的：为 claudian-deepseek-fork 提炼可落地要点。

## 一句话定位

Ailu 与本项目同源——都是 Obsidian 侧边栏本地 Agent 对话插件。但它 spawn Claude Code / Codex
CLI（非 RPC），并额外做了内容发布（公众号 / 飞书 / X 草稿）与一套成熟工程化。

## 1. 安全实践（THREAT_MODEL.md）——最对症，因为踩过坑

dsh 的 philosophy agent 曾升级沙箱去改香蕉 VPN、写 SQLite、建 LaunchAgent（跑飞）。
Ailu 用一整套约束来防同类问题：

- **fail-closed**：Windows 只读模式；不支持路径/运行时的写路径在 spawn 前即拒绝。
- **权限分级**：full access 显式 opt-in，且在运行时执行边界重新校验，不是设置一次就永久。
- **凭据边界**：Agent CLI 拥有自己的认证；插件不代为保存明文密钥。
- **原子写**：conversation / settings / provider 记录用 process lock + compare-and-swap 或原子替换。
- **路径规范化**：拒绝 symlink、必须位于授权 Vault 根之下。
- **输出有界**：per-event / per-turn / item-count / byte / concurrency 限制，再做 Vault 副作用。

对本项目的启示：deepseek provider 侧应在"把用户请求交给 dsh agent 执行"这个边界加约束提示，
明确 agent 可用的工具范围 / 审批边界，避免越权改动系统。

## 2. 引擎发现（runtime/discovery.ts + utils/env.ts）——已落地

核心函数 `executableSearchPath()`：GUI 应用（Obsidian Electron）继承的是最小 PATH，缺
`/usr/sbin`、Homebrew、nvm/fnm/asdf/mise 等目录，导致系统命令（lsof）找不到。
解法是**不硬编码绝对路径**，而是构建完整搜索 PATH 再遍历查找。

关键点：
- `executableSearchPath` 把 `/opt/homebrew/bin /usr/local/bin /usr/bin /bin /usr/sbin /sbin`
  及用户级包管理器目录追加进 PATH（保留继承项在前）。
- `resolveCommand` 用 `which` + 遍历 PATH 定位可执行文件（Windows 用 where.exe + .exe/.cmd）。
- 结果缓存（STATUS_CACHE 30s TTL），避免同步 spawn 阻塞 UI 线程。
- 多级 fallback：configured（用户配置）→ managed（插件管理）→ path（PATH 查找）→ desktopApp（桌面版内嵌 CLI）。

已落地到本项目：`HarnessRpcClient.discoverHarnessBaseUrl()` 改用
`executableSearchPath` + `resolveLsofBinary`，替代硬编码 `['/usr/sbin/lsof', '/usr/bin/lsof', 'lsof']`。

## 3. 工程化（可借鉴，尚未落地）

- `deploy:plan` / `deploy:apply`：两步部署 + 哈希校验 + receipt 回滚（当前本项目是手动 cp main.js）。
- `build-attestation.json`：构建证明。
- `npm run check`：全量测试 + 公开源码清单 + lint + 正式构建 + Release 验证。
- 测试用 vitest（本项目用 jest）。
- THREAT_MODEL / SECURITY / THIRD_PARTY_NOTICES 等治理文档齐全。

## 4. 内容发布（feishu/ + publishing/）

飞书同步走 `lark-cli`，公众号走自建 wechat-relay，X 走独立 Playwright profile + Cookie。
若未来需要"Obsidian 笔记一键发飞书/公众号"，此处有完整工作流参考。

## ⚠️ 许可证红线

Ailu 为 **AGPL-3.0-or-later**（传染性）。**只学思路，不可复制源码**进本仓库（MIT）。
本文档只记录设计要点与思路，不搬运 Ailu 代码。
