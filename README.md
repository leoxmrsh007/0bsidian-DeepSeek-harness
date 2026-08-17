# DeepSeek Harness for Obsidian

Embed the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
coding agent (`dsh`) directly in your Obsidian vault. Your vault becomes the
agent's working directory — file reads/writes, search, bash, and multi-step
workflows all work from the chat sidebar.

This plugin is a **DeepSeek Harness–only** client: it drives a running
`dsh web` desktop app over its local HTTP API (or auto-launches it for you),
then renders the agent's streaming text, reasoning, and tool activity inside
Obsidian.

> DeepSeek Harness is currently in **developer preview** and iterates quickly;
> its local HTTP surface may change between releases.

## Requirements

- Obsidian Desktop v1.7.2+
- Node.js 22.19+ (only if you use the auto-launch fallback that spawns `dsh web`)
- A DeepSeek API key (`DEEPSEEK_API_KEY`)
- The DeepSeek Harness CLI, or the DeepSeek Harness desktop app:
  ```sh
  npm install -g @deepseek-ai/dsh
  ```

## Install

### From GitHub Release (recommended)

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/leoxmrsh007/deepseek-harness-obsidian/releases).
2. Create `<vault>/.obsidian/plugins/deepseek-harness/` and copy the three files in.
3. Reload Obsidian and enable **DeepSeek Harness** in Settings → Community plugins.

### From source

```sh
git clone https://github.com/leoxmrsh007/deepseek-harness-obsidian.git
cd deepseek-harness-obsidian
npm ci
npm run build          # emits main.js + styles.css
```

## First-start acceptance

1. Set `DEEPSEEK_API_KEY` in your shell, then start the harness:
   ```sh
   dsh web        # serves http://127.0.0.1:3080
   ```
   (Or leave it stopped — the plugin auto-launches it by default.)
2. In Obsidian → Settings → DeepSeek Harness, confirm the
   **DeepSeek Harness URL** is `http://127.0.0.1:3080` and the provider is enabled.
3. Open the chat sidebar (ribbon icon or command `DeepSeek Harness: Open chat`).
4. Send: `只回复 OK，不要读写任何文件。`
5. Open a note and send: `只读取当前笔记并概括三点，不要修改文件。` and confirm
   the streamed reply and tool cards render.

If the harness is reachable in a terminal but not from Obsidian, set an explicit
path in the provider settings (GUI-launched Obsidian may not see npm global shims).

## Docs

- [DeepSeek Harness integration](docs/deepseek-harness-integration.md) —
  architecture, HTTP API, event mapping, and status.

## License

[MIT](LICENSE)
