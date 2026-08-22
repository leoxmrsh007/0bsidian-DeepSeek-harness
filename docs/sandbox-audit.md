# Sandbox / permission-mode audit

## DeepSeek Harness

- The plugin auto-launch path passes the selected safe mode to `dsh web` as
  `DSH_PERMISSION_MODE`. DSH is responsible for enforcing that mode and must
  fail closed if its sandbox cannot support it.
- The mode applies only when the plugin launches or restarts DSH. A manually
  started harness keeps its existing process-level mode until restarted.
- The Harness RPC endpoint is loopback-only (`127.0.0.1`, `localhost`, or
  `::1`) and uses HTTP. Remote endpoints are rejected to prevent vault prompts
  and agent requests from being sent to an untrusted host.

## Codex

- Codex maps the permission setting to a concrete app-server sandbox policy.
- The app should abort a session if the requested sandbox is unavailable rather
  than silently continuing with broader permissions.

## Claude

- Claude maps `permissionMode` to the native SDK permission mode.

## Follow-up work

1. Add a DSH capability/version handshake so unsupported RPC methods produce a
   specific compatibility error.
2. Add an explicit restart notice when DeepSeek safe mode changes while an
   externally managed harness is running.
3. Reconsider the global `yolo` default and require a first-use confirmation.
