# Obsidian Community Directory submission

Submit the plugin at [community.obsidian.md](https://community.obsidian.md).
The legacy `obsidianmd/obsidian-releases` pull-request flow is no longer used.

## Plugin details

| Field | Value |
| --- | --- |
| ID | `deepseek-vault-harness` |
| Name | `DeepSeek Vault Harness` |
| Repository | `https://github.com/leoxmrsh007/0bsidian-DeepSeek-harness` |
| Owner | `leoxmrsh007` |
| Description | 在 Obsidian 库中运行 DeepSeek Harness、Claude Code 和 Codex，支持文件编辑、搜索、Bash 与多步骤工作流. |

## Submission steps

1. Sign in to the Community directory with an Obsidian account.
2. Open **Profile** and connect the GitHub account `leoxmrsh007`.
3. Open **Plugins** and select **New plugin**.
4. Enter the repository URL above and select yourself as the owner.
5. Agree to the Developer Policies and submit.

## Release checklist

- [x] `manifest.json` has a unique ID and the required plugin metadata.
- [x] The plugin is desktop-only because it launches local CLIs and reads the local filesystem.
- [x] The GitHub Release contains `main.js`, `manifest.json`, and `styles.css`.
- [x] The release tag exactly matches `manifest.json` and `package.json`.
