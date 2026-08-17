# DeepSeek Harness integration

This provider (`src/providers/deepseek/`) embeds the **DeepSeek Harness**
(`deepseek-ai/deepseek-harness`, the `dsh` agent) into Obsidian, mirroring how
Claudian embeds Claude Code / Codex / Grok / OpenCode / Pi.

## Architecture

The DeepSeek Harness desktop app (`dsh web`) is the **agent engine**; Claudian
is a remote front-end. The provider drives the harness over its local HTTP API:

```
Obsidian (Claudian)                      DeepSeek Harness (dsh web)
  HarnessExecutionBackend ── POST /api/session.create ──▶ desktop app
  HarnessExecutionSession ── POST /api/session.prompt  ──▶ (queue mode)
                            ◀── POST /api/session.history ── polled events
                            ◀── WS /api/events.mux ───────── ask_user_question
```

### HTTP API (verified live 2026-08)

All methods are `POST http://127.0.0.1:<port>/api/<method>` with a JSON-RPC-ish
envelope:

```json
{ "type": "client-request", "rpcId": "<uuid>", "method": "<method>", "payload": { ... } }
```

Response:

```json
{ "type": "server-response", "rpcId": "<uuid>", "result": { "ok": true, "value": { ... } } }
```

| Method | Payload | Returns |
|---|---|---|
| `session.list` | `{}` | `{ items: [{ sessionId, running, blank, updatedAt, title?, ... }] }` |
| `session.create` | `{ sessionId? }` | `{ sessionId, agentPreset? }` |
| `session.history` | `{ sessionId, maxMessages }` | `{ events: [{ event: SessionEvent }, ...] }` |
| `session.prompt` | `{ sessionId, content: [{ type: 'text', text }], mode: 'queue' }` | `{ accepted: boolean }` |
| `respond` | `{ rpcId, result: { ok, value: { sessionId, answer: { answers } } } }` | `{ accepted, reason? }` |
| `events.mux` (WS) | — | `question/requested` frames for `ask_user_question` |

### Session events (harness session log)

The harness session log uses the same `SessionEvent` vocabulary whether read
via `session.history` polling or the SDK's `session.event` stream:

- `turn/start`, `step/start`, `step/end`, `turn/end` — lifecycle
- `assistant/chunk` — streamed deltas: `text-delta`, `reasoning-delta`,
  `tool-call-delta`, `block-start`, `block-end`, `usage`, `finish`
- `assistant/message` — committed message (with `usage`)
- `tool/call` / `tool/result` — tool invocation + result
- `session/title`, `agent/inbox/spliced`, `user/message`, `request/header`,
  `request/context` — metadata

`HarnessEventMapper` maps these onto Claudian's provider-neutral execution
events (`turn_started`, `text_delta`, `thinking_delta`, `tool_started`,
`tool_output`, `tool_completed`, `turn_completed`, `cancelled`,
`execution_error`).

## Models

The DeepSeek Harness ships two models:

- `deepseek-v4-flash` — fast general-purpose (SDK default)
- `deepseek-v4-pro` — most capable

The desktop app owns the actual model route and agent preset; the provider's
`modelTiers.ts` only drives the in-Obsidian model selector.

## Setup

1. Install Node.js (>= 22.19) and the harness CLI:
   ```sh
   npm install -g @deepseek-ai/dsh
   ```
2. Set `DEEPSEEK_API_KEY` and start the desktop app:
   ```sh
   DEEPSEEK_API_KEY=sk-... dsh web        # serves http://127.0.0.1:3080
   ```
3. In Obsidian → Settings → Claudian → DeepSeek, set **DeepSeek Harness URL**
   (defaults to `http://127.0.0.1:3080`) and enable the provider.

Auto-launch is enabled by default: when the endpoint is unreachable, the
plugin resolves `dsh` on PATH and starts `dsh web --port <port>` in the
background, reaping it on plugin unload. Disable **Auto-launch harness** to
require a separately-running desktop app instead.

## Status / remaining work

Implemented and validated:

- [x] `HarnessRpcClient` (HTTP API + `events.mux` + port discovery)
- [x] `HarnessEventMapper` (session-log → execution-event mapping, unit tested)
- [x] `HarnessExecutionBackend` / `HarnessExecutionSession` (prompt → poll → map)
- [x] Provider registration, settings (`harnessBaseUrl`), capabilities, icon
- [x] `HarnessConversationHistoryService`

Remaining:

- [x] Auto-launch `dsh web` when the endpoint is unreachable (spawn the `dsh`
      bin, wait for readiness, reap on unload) — `HarnessAppLauncher`
- [ ] Replace the Claude-copy settings-tab sections (safe mode, custom models,
      Chrome/Bang-Bash toggles) with harness-appropriate controls
- [ ] Replace `app/ClaudeWorkspaceServices` (Claude CLI probing) with a
      harness workspace that owns commands/skills/agents or no-ops them
- [ ] Cross-platform port discovery (current `lsof` path is macOS/Linux only)
- [ ] End-to-end integration test against a live `dsh web` instance

## Alternative: SDK subprocess (not used)

The harness also ships a first-party TypeScript SDK
(`@deepseek-ai/dsh-sdk-client`) that spawns a **headless** `dsh-jsonrpc-agent`
subprocess and streams `session.event` notifications over stdio JSON-RPC
(`initialize` / `session/prompt` / `shutdown`, notifications
`session.event` / `session.status` / `subagent.*`). It is lighter and
self-contained but exposes **no session list/load/resume** and no permission
channel. A proof-of-concept was validated in `~/dsh-obsidian-poc` (spawn +
stream + tool calls). This remains a fallback if the desktop-app dependency
becomes undesirable.
