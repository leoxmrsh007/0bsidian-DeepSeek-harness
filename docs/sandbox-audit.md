# Sandbox / permission-mode audit

Audited the three providers' permission and sandbox wiring. The headline
finding is that the DeepSeek provider's permission controls are **not wired
through to the harness** — the UI toggle and the `safeMode` setting have no
effect on what the agent is allowed to do.

## Per-provider status

### DeepSeek — not wired (high risk)

- `safeMode` (`acceptEdits` / `auto` / `default`, in
  `src/providers/deepseek/settings.ts`) is stored but never consumed.
- The chat permission toggle (Safe / YOLO / Plan) writes the top-level
  `permissionMode`, but the harness execution path never reads it:
  `HarnessRpcClient.createSession()` only sends `sessionId`, and `prompt()`
  only sends content + queue mode.
- Net effect: whatever the user selects, `dsh web` runs with its own default
  permission mode. This is neither fail-closed nor user-intent-honouring.

### Codex — wired, but no fail-closed check

- `resolvePolicy()` maps tool policy + `permissionMode` + `safeMode` to a
  concrete sandbox (`read-only` / `workspace-write` / `danger-full-access`)
  and sends the `sandboxPolicy` with each request.
- There is no "sandbox unavailable → abort" check. The `externalSandbox`
  variant of `SandboxPolicy` exists only as an app-server-side state type;
  the plugin does not react to it.

### Claude — wired

- `permissionMode` maps to the SDK (`bypassPermissions` / `plan` / `normal`)
  and is enforced by the Claude Code CLI.
- `safeMode` (`acceptEdits`) is stored but unused (a legacy field separate
  from `permissionMode`).

## Additional finding

- The global default is `permissionMode: 'yolo'`
  (`src/app/settings/defaultSettings.ts`) — "bypass permissions" full access.
  For the wired providers (Claude / Codex) this is a high-risk default and is
  not obvious to users unfamiliar with the YOLO semantics.

## Recommended fixes (priority order)

1. **Wire DeepSeek permissions.** Map `safeMode` to the harness process, e.g.
   inject `DSH_PERMISSION_MODE` into the `dsh web` launch environment (the
   approach the DeepHarness plugin uses — verify the env var against the
   target DSH version). Note: the current architecture launches a single
   shared `dsh web` server, so this is server-level rather than per-session;
   per-session enforcement would require launching per-session processes.
2. **Codex fail-closed.** When the app-server reports the sandbox as
   unavailable or delegates to an external sandbox, abort the session and
   surface an error instead of continuing.
3. **Reconsider the `yolo` default.** Either default to `normal`, or require
   an explicit second confirmation the first time a session is switched into
   YOLO mode.
