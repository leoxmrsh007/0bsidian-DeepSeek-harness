# v0.3.1-patch1 (本地 patch)

## 新增
- **同一会话内允许切换 provider**(原行为: 一旦会话被绑定 provider, 模型选择器仅显示该 provider 的模型, 跨 provider 选择被强制拒绝并提示 "Start a new conversation instead").
- Claude provider 下 **pill 现在会列出 `~/.claude/settings.json` 中 `modelPicker.options` 配置的所有自定义网关模型**(典型: magpie 后端 `nairos/nairos-pro`、`nairos/nairos-std`、`nairos/nairos-lite` 等).

## 技术细节
- `TabRuntimeUI.ts`:`onModelChange` 的 bound 分支不再拒绝跨 provider 选择; 改为以 `getProviderForModel` 解析出的新 provider 作为 commit 目标, 并同步 `shell.providerId`.
- `TabRuntimeUI.ts`: 新增 `universalUIConfigProxy()`(全列 `getBlankTabModelOptions`),取代按会话绑定过滤的 `getTabChatUIConfig`.
- 新增 `src/providers/claude/cli/claudeModelPicker.ts`: 读取插件运行时的 `resolveClaudeConfigDir()/settings.json`, 把 `modelPicker.options` 折入 `getClaudeModelOptions` 默认分支, 去重后并入下拉清单.
- `main.js` 为相应源补丁的 esbuild 产物.

## 相容性
- 向后兼容: 单 provider 的工作流(只在 deepseek/codex/claude 内部换模型)行为不变.
- 若该会话已选中新 provider, 旧 provider 的 partial settings(如 `claudeSettings.lastModel`)会以新 provider 语义复用; effortLevel/thinkingBudget 的 normalize 沿用现有逻辑.

## 验收
- 同一会话内 3 个 provider 间切换 → UI 与发送路由同时切换.
- pill 中存在 `nairos/nairos-pro`(来自 `~/.claude/settings.json` 的 modelPicker)→ 选即生效; Obsidian 需读到此 cli 配置(若 Obsidian 由 GUI 方式启动, 需要在 launchctl 配置 ANTHROPIC_BASE_URL).
