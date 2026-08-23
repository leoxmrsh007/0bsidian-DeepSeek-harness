# Vault API Bridge 操作指南（0.3.0）

DSH ↔ Obsidian 双向桥接的使用手册。覆盖：启用桥、生成 DSH 配置、只读与写工具、确认流程、故障排查。

## 1. 总览

| 方向 | 通道 | 版本 |
| --- | --- | --- |
| Obsidian → DSH | 插件侧边栏直接驱动 `dsh web`（聊天/执行/文件读写） | 0.1.x |
| DSH → Obsidian（只读） | `vault_read` / `vault_search` / `vault_backlinks` / `vault_tags` / `vault_frontmatter_get` | 0.2.0 |
| DSH → Obsidian（写，需确认） | `vault_write` / `vault_append` / `vault_delete` / `vault_move` / `vault_frontmatter_set` / `vault_frontmatter_delete` | 0.3.0 |

架构：DSH 通过 MCP stdio 启动插件生成的 `mcp-bridge.cjs`，代理再通过 loopback HTTP + token 访问 Obsidian 内的 vault API server。

```
DSH (.cordis.yml → mcp-bridge.cjs, stdio)
  └─ HTTP POST 127.0.0.1:<port>/api/*（X-DSH-Vault-Token）
       └─ Obsidian 插件内 server → vault / metadataCache / fileManager
```

## 2. 安装插件

- 社区目录（如果已上架）：Obsidian → 设置 → 第三方插件 → 浏览 → 搜索 **DeepSeek Vault Harness**。
- 未上架时：BRAT 添加 `leoxmrsh007/0bsidian-DeepSeek-harness`，或从 GitHub Release 手动安装。
- 安装目录：`<vault>/.obsidian/plugins/deepseek-vault-harness/`

## 3. 启用桥接

1. 打开 Obsidian → 设置 → **DeepSeek Vault Harness** → **Vault API bridge (DSH ↔ Obsidian)**。
2. 打开 **Enable bridge** 开关（默认关闭）。
3. 确认状态显示 Running，例如 `Running at http://127.0.0.1:3081`。
4. （可选）修改 **Port**，默认 3081，范围 1024–65535。

> 只读能力：启用桥后，DSH 即可调用 5 个只读工具。

## 4. 启用写桥（0.3.0）

1. 在桥接设置里打开 **Enable write bridge**（默认关闭）。
2. 提示已开启：此后 DSH 的所有写操作都会先在 Obsidian 弹出确认框。
3. 每笔写入的流程：
   - DSH 调用 `vault_write` 等 → Obsidian 弹出 **DSH wants to …** 弹窗，显示路径、内容预览（≤400 字符）与来源请求 ID；
   - 点 **Approve** → 写入执行，弹窗显示“DSH write approved and applied.”；
   - 点 **Reject** → 丢弃，vault 不变；
   - 同一 confirmId 只能确认一次，重复确认返回 `confirm-not-found`。

## 5. 生成并安装 DSH 侧配置

1. 在桥接设置点 **Write script & copy config**。
   - 插件会把自包含代理写入 `.../plugins/deepseek-vault-harness/mcp-bridge.cjs`；
   - 并把 DSH 的 `.cordis.yml` 配置片段复制到剪贴板。
2. 把剪贴板内容保存为 DSH 配置目录下的 `obsidian-vault-bridge.cordis.yml`。
   - 片段类似：

```yaml
- insert:
    - id: obsidian-vault-bridge
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: obsidian-vault-bridge
        transport: stdio
        command: node
        args: ["<vault>/.obsidian/plugins/deepseek-vault-harness/mcp-bridge.cjs", --vault, "<vault>", --port, "3081"]
        cwd: !!js process.cwd()
```

3. 重启 DSH（或重新加载其配置），确认工具列表出现 `vault_*` 工具。

> 代理启动时会读取 `.../deepseek-vault-harness/data.json` 中的 `vaultApi.token`，无需手动复制 token，也不会在网络上明文传输。

## 6. DSH 中可用工具

**只读（始终可用）**

| 工具 | 说明 | 参数 |
| --- | --- | --- |
| `vault_capabilities` | vault 名称、路径、API 版本、功能列表 | — |
| `vault_list` | 列出目录下文件 | `dir?` `limit?` |
| `vault_read` | 读取笔记内容（≤1 MiB，超出截断并标记） | `path` |
| `vault_search` | 全文搜索（≤200 命中，单文件 ≤256 KiB） | `query` `dir?` `limit?` `context?` |
| `vault_backlinks` | 反向链接（谁链接了该笔记） | `path` |
| `vault_tags` | 标签计数 | `dir?` |
| `vault_frontmatter_get` | 读取 YAML frontmatter | `path` |

**写操作（需 Obsidian 内确认）**

| 工具 | 说明 | 参数 |
| --- | --- | --- |
| `vault_write` | 新建/覆盖笔记（≤8 MiB） | `path` `content` |
| `vault_append` | 追加内容 | `path` `content` |
| `vault_delete` | 移到回收站（尊重删除偏好） | `path` |
| `vault_move` | 移动/重命名，并统计受影响链接 | `path` `to` |
| `vault_frontmatter_set` | 设置 frontmatter 字段 | `path` `key` `value` |
| `vault_frontmatter_delete` | 删除 frontmatter 字段 | `path` `key` |

## 7. 安全要点

- 仅监听 `127.0.0.1`，不对外网开放；
- 请求必须携带 `X-DSH-Vault-Token`（每次启用随机生成，常量时间比较）；
- 请求体上限 8 MiB；路径拒绝 `..`、绝对路径、NUL、隐藏目录（`/.`）；
- 写桥默认关闭；所有写入需人工确认；
- 可在设置中 **Rotate token** 轮换令牌（旧的 DSH 连接需更新配置）。

## 8. 故障排查

| 现象 | 处理 |
| --- | --- |
| DSH 找不到工具 | 确认桥已启用、`.cordis.yml` 已保存、DSH 已重启 |
| 报 `unauthorized` | token 已轮换或 data.json 被改，重新复制配置 |
| 报 `writes-disabled` | 在设置中打开 **Enable write bridge** |
| 报 `pending-confirmation` | 正常：Obsidian 里弹了确认框，等你在 Obsidian 操作 |
| 报 `confirm-not-found` | 该确认已被处理（批准或拒绝），勿重复提交 |
| 端口被占用 | 改 Port 后重新复制配置 |
| 桥停止（Stopped） | 检查错误信息；Obsidian 重启后桥会自动拉起 |

## 9. 常见问题

- **写桥为什么不直接执行？** 安全设计：任何写操作都必须由用户在 Obsidian 内批准，防止 agent 静默改文件。
- **token 会泄露吗？** 只存在本机 vault 的 `data.json`，由 DSH 侧代理读取，不经过网络。
- **多 vault 怎么办？** 每个 vault 独立启用桥、独立 token、独立端口。
