# DeepSeek Harness for Obsidian

Embed a coding agent directly in your Obsidian vault — file reads/writes, search,
bash, and multi-step workflows all run from the chat sidebar, with your vault as
the agent's working directory.

The plugin ships with three selectable providers:

- **DeepSeek** — the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
  coding agent (`dsh`), driven over its local HTTP API (or auto-launched for you).
- **Claude** — [Claude Code](https://claude.com/claude-code), driven over the local CLI.
- **Codex** — OpenAI Codex, driven over the Codex app-server (sign in with ChatGPT,
  no API key required).

Streaming text, reasoning, and tool activity all render inside Obsidian.

> DeepSeek Harness is currently in **developer preview** and iterates quickly;
> its local HTTP surface may change between releases.

## Requirements

- Obsidian Desktop v1.7.2+ (desktop only)
- Per provider:
  - **DeepSeek**: a DeepSeek API key (`DEEPSEEK_API_KEY`) and the DeepSeek Harness CLI
    (`npm install -g @deepseek-ai/dsh`), or the DeepSeek Harness desktop app.
  - **Claude**: the Claude Code CLI (`claude`) on your `PATH`, authenticated with your
    Anthropic account or `ANTHROPIC_API_KEY`.
  - **Codex**: the Codex app / app-server, signed in with a ChatGPT Plus account.

## Install

### From GitHub Release (recommended)

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/leoxmrsh007/0bsidian-DeepSeek-harness/releases).
2. Create `<vault>/.obsidian/plugins/deepseek-harness/` and copy the three files in.
3. Reload Obsidian and enable **DeepSeek Harness** in Settings → Community plugins.

### From source

```sh
git clone https://github.com/leoxmrsh007/0bsidian-DeepSeek-harness.git
cd 0bsidian-DeepSeek-harness
npm ci
npm run build          # emits main.js + styles.css
```

## First start

1. In Settings, enable the provider you want (Claude / Codex / DeepSeek).
2. **DeepSeek** — set `DEEPSEEK_API_KEY` in your shell, then start the harness:
   ```sh
   dsh web        # serves http://127.0.0.1:3080
   ```
   Or leave it stopped — the plugin auto-launches it by default. Confirm the
   **DeepSeek Harness URL** is `http://127.0.0.1:3080`.
3. **Claude** — make sure the `claude` CLI is on your `PATH` and authenticated.
4. **Codex** — sign in to the Codex app / app-server.
5. Open the chat sidebar (ribbon icon or command) and send a test message.

If a harness/CLI is reachable in a terminal but not from Obsidian, set an explicit
path in the provider settings (GUI-launched Obsidian may not see npm global shims).

## Docs

- [DeepSeek Harness integration](docs/deepseek-harness-integration.md) —
  architecture, HTTP API, event mapping, and status.

## License

[MIT](LICENSE)
