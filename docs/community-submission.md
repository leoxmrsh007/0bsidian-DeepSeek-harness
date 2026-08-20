# Obsidian community plugin submission

Files for the PR to [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases).

## 1. `community-plugins.json` entry

Append this object to the end of the array in `community-plugins.json`:

```json
{
  "id": "deepseek-harness",
  "name": "DeepSeek Harness",
  "author": "leoxmrsh007",
  "description": "Embeds the DeepSeek Harness coding agent in your vault. Your vault becomes its working directory — file reads/writes, search, bash, and multi-step workflows all work out of the box.",
  "repo": "leoxmrsh007/0bsidian-DeepSeek-harness"
}
```

The `id` must exactly match `manifest.json`. The marketplace reads the plugin's
`manifest.json` and `versions.json` from the latest GitHub Release of `repo`.

## 2. PR description template

**Title**

```
Add DeepSeek Harness plugin
```

**Body**

```markdown
# Add DeepSeek Harness plugin

- **Plugin ID**: `deepseek-harness`
- **Repo**: https://github.com/leoxmrsh007/0bsidian-DeepSeek-harness
- **Latest release**: v0.1.2

DeepSeek Harness embeds the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
coding agent (`dsh`) in Obsidian. It drives a running `dsh web` desktop app over
its local HTTP API (or auto-launches it), then renders the agent's streaming
text, reasoning, and tool activity in the chat sidebar. It also keeps the
upstream Claude Code provider alongside DeepSeek, so both can be selected from
the provider picker.

## Checklist

- [x] `manifest.json` published in a GitHub Release (v0.1.2)
- [x] `manifest.json` fields: id, name, author, description, minAppVersion
- [x] Release contains `main.js`, `manifest.json`, `styles.css`
- [x] No `.obsidian` config, `node_modules`, or build artifacts in the repo
```

## 3. Notes for review

- The plugin is desktop-only (`isDesktopOnly: true`) because it spawns the
  `dsh` Node CLI and reads the local filesystem.
- `minAppVersion` is `1.7.2`.
- The upstream license is MIT (see `LICENSE`).
