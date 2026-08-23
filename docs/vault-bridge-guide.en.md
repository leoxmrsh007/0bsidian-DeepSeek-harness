# Vault API Bridge Guide (0.3.0)

How to use the DSH ↔ Obsidian bidirectional bridge: enabling the bridge, generating the DSH config, read-only and write tools, the confirmation flow, and troubleshooting.

## 1. Overview

| Direction | Channel | Version |
| --- | --- | --- |
| Obsidian → DSH | Drive `dsh web` from the sidebar (chat/execution/file access) | 0.1.x |
| DSH → Obsidian (read-only) | `vault_read` / `vault_search` / `vault_backlinks` / `vault_tags` / `vault_frontmatter_get` | 0.2.0 |
| DSH → Obsidian (confirmed writes) | `vault_write` / `vault_append` / `vault_delete` / `vault_move` / `vault_frontmatter_set` / `vault_frontmatter_delete` | 0.3.0 |

Architecture: DSH launches the plugin-generated `mcp-bridge.cjs` over MCP stdio; the proxy talks to the vault API server inside Obsidian over loopback HTTP with a token.

```
DSH (.cordis.yml → mcp-bridge.cjs, stdio)
  └─ HTTP POST 127.0.0.1:<port>/api/* (X-DSH-Vault-Token)
       └─ plugin server → vault / metadataCache / fileManager
```

## 2. Install the plugin

- Community directory (if listed): Obsidian → Settings → Community plugins → Browse → search **DeepSeek Vault Harness**.
- Otherwise: install with BRAT (`leoxmrsh007/0bsidian-DeepSeek-harness`) or copy the three files from the GitHub Release.
- Plugin folder: `<vault>/.obsidian/plugins/deepseek-vault-harness/`

## 3. Enable the bridge

1. Obsidian → Settings → **DeepSeek Vault Harness** → **Vault API bridge (DSH ↔ Obsidian)**.
2. Turn on **Enable bridge** (off by default).
3. Confirm the status shows Running, e.g. `Running at http://127.0.0.1:3081`.
4. Optional: change **Port** (default 3081, range 1024–65535).

> Read-only tools are available as soon as the bridge is enabled.

## 4. Enable the write bridge (0.3.0)

1. In bridge settings, turn on **Enable write bridge** (off by default).
2. From now on, every DSH write first opens a confirmation dialog in Obsidian.
3. Per-write flow:
   - DSH calls `vault_write` etc. → Obsidian shows a **DSH wants to …** dialog with the path, content preview (≤400 chars), and source request ID;
   - **Approve** → the write runs; the dialog reports “DSH write approved and applied.”;
   - **Reject** → discarded, vault unchanged;
   - A confirmId can only be consumed once; re-confirming returns `confirm-not-found`.

## 5. Generate and install the DSH-side config

1. In bridge settings click **Write script & copy config**.
   - The plugin writes the self-contained proxy to `.../plugins/deepseek-vault-harness/mcp-bridge.cjs`;
   - It also copies the DSH `.cordis.yml` snippet to the clipboard.
2. Save the snippet as `obsidian-vault-bridge.cordis.yml` under DSH's config directory. The snippet looks like:

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

3. Restart DSH (or reload its config) and confirm the `vault_*` tools appear.

> The proxy reads `vaultApi.token` from `.../deepseek-vault-harness/data.json`; no manual token copying, nothing crosses the network in plaintext.

## 6. Tools available to DSH

**Read-only (always available)**

| Tool | Description | Params |
| --- | --- | --- |
| `vault_capabilities` | vault name, path, API version, feature list | — |
| `vault_list` | List files under a folder | `dir?` `limit?` |
| `vault_read` | Read note content (≤1 MiB, truncated flag) | `path` |
| `vault_search` | Full-text search (≤200 hits, ≤256 KiB/file) | `query` `dir?` `limit?` `context?` |
| `vault_backlinks` | Backlinks (which notes link here) | `path` |
| `vault_tags` | Tag counts | `dir?` |
| `vault_frontmatter_get` | Read YAML frontmatter | `path` |

**Writes (confirmed in Obsidian)**

| Tool | Description | Params |
| --- | --- | --- |
| `vault_write` | Create/overwrite a note (≤8 MiB) | `path` `content` |
| `vault_append` | Append content | `path` `content` |
| `vault_delete` | Move to trash (respects deletion preference) | `path` |
| `vault_move` | Move/rename; reports affected links | `path` `to` |
| `vault_frontmatter_set` | Set a frontmatter field | `path` `key` `value` |
| `vault_frontmatter_delete` | Delete a frontmatter field | `path` `key` |

## 7. Security notes

- Binds `127.0.0.1` only; never exposed on the network.
- Requests must carry `X-DSH-Vault-Token` (random per install, constant-time comparison).
- 8 MiB body cap; paths reject `..`, absolute paths, NUL bytes, and hidden folders (`/.`).
- Write bridge is off by default; every write needs manual confirmation.
- Use **Rotate token** to rotate the credential (existing DSH connections must update their config).

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| DSH can't find the tools | Verify the bridge is enabled, the `.cordis.yml` is saved, DSH was restarted |
| `unauthorized` | Token rotated or data.json changed; regenerate the config |
| `writes-disabled` | Turn on **Enable write bridge** in settings |
| `pending-confirmation` | Normal: a confirmation dialog is open in Obsidian; approve/reject there |
| `confirm-not-found` | That confirmation was already handled; don't resubmit |
| Port in use | Change **Port**, then regenerate the config |
| Bridge stopped | Read the error; the bridge auto-starts on Obsidian launch |

## 9. FAQ

- **Why not execute writes directly?** Security: every write must be approved in Obsidian so an agent can't silently modify files.
- **Does the token leak?** It lives only in the local vault's `data.json` and is read by the DSH-side proxy; nothing goes over the network.
- **Multiple vaults?** Each vault has its own bridge, token, and port.
