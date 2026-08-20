import { type ChildProcess, spawn } from 'child_process';

import { findCliBinaryPath } from '../../../utils/cliBinaryLocator';
import { parseEnvironmentVariables } from '../../../utils/env';
import { nodeHttpRequest } from './nodeHttp';

/** Configuration for launching the DeepSeek Harness desktop app on demand. */
export interface HarnessLaunchConfig {
  /** Whether to auto-launch `dsh web` when the endpoint is unreachable. */
  readonly autoLaunch: boolean;
  /** Optional explicit path to the `dsh` binary; empty resolves via PATH. */
  readonly dshPath?: string;
  /** Provider-scoped environment variables merged into the child process. */
  readonly environmentText?: string;
  /** DeepSeek Harness permission mode (`acceptEdits` / `auto` / `default`). */
  readonly safeMode?: string;
}

/** Machine-readable reason a harness launch (or readiness wait) failed. */
export type HarnessFailureReason =
  | 'dsh-not-found'
  | 'spawn-failed'
  | 'exited-early'
  | 'timeout';

/** Observable state of the owned `dsh web` subprocess. */
export type HarnessStatus =
  | { kind: 'online' }
  | { kind: 'starting' }
  | { kind: 'offline' }
  | { kind: 'failed'; reason: HarnessFailureReason; detail?: string };

const READINESS_POLL_INTERVAL_MS = 500;
const READINESS_TIMEOUT_MS = 20_000;
const STDERR_TAIL_MAX = 2000;

/**
 * Lazily starts and owns the `dsh web` desktop app subprocess.
 *
 * The harness desktop app is the agent engine for the deepseek provider.
 * It is a long-lived server shared by every session, so the launcher is a
 * module-level singleton that reuses one child across the plugin lifetime and
 * reaps it on plugin unload (through the workspace dispose path).
 *
 * The launcher also records a human-consumable {@link HarnessFailureReason}
 * whenever startup fails, so the settings UI can explain *why* (missing `dsh`,
 * exited early, timed out) instead of only reporting a boolean.
 */
export class HarnessAppLauncher {
  private static instance: HarnessAppLauncher | null = null;

  static get(): HarnessAppLauncher {
    this.instance ??= new HarnessAppLauncher();
    return this.instance;
  }

  private child: ChildProcess | null = null;
  private launching: Promise<boolean> | null = null;
  private disposed = false;
  private lastFailure: HarnessFailureReason | null = null;
  private lastFailureDetail: string | null = null;
  private lastProbeOk = false;

  /** Probe the endpoint and record reachability without launching anything. */
  async check(baseUrl: string): Promise<boolean> {
    if (this.disposed) return false;
    const ok = await probeHarness(baseUrl);
    this.lastProbeOk = ok;
    if (ok) {
      this.lastFailure = null;
      this.lastFailureDetail = null;
    }
    return ok;
  }

  /** Resolve the `dsh` binary path: explicit setting first, then PATH lookup. */
  detectDshPath(config: HarnessLaunchConfig): string | null {
    const explicit = (config.dshPath ?? '').trim();
    if (explicit) {
      return explicit;
    }
    return findCliBinaryPath('dsh');
  }

  /** Current observable status of the harness subprocess. */
  getStatus(): HarnessStatus {
    if (this.disposed) {
      return { kind: 'offline' };
    }
    if (this.launching) {
      return { kind: 'starting' };
    }
    if (this.lastFailure) {
      return {
        kind: 'failed',
        reason: this.lastFailure,
        ...(this.lastFailureDetail ? { detail: this.lastFailureDetail } : {}),
      };
    }
    if (this.lastProbeOk || (this.child !== null && this.child.exitCode === null)) {
      return { kind: 'online' };
    }
    return { kind: 'offline' };
  }

  /**
   * Ensure the harness endpoint is reachable, launching `dsh web` when it is
   * not already running and {@link HarnessLaunchConfig.autoLaunch} is enabled.
   */
  async ensureRunning(baseUrl: string, config: HarnessLaunchConfig): Promise<boolean> {
    if (this.disposed) return false;
    if (await probeHarness(baseUrl)) {
      this.lastProbeOk = true;
      this.lastFailure = null;
      this.lastFailureDetail = null;
      return true;
    }
    this.lastProbeOk = false;
    if (!config.autoLaunch) {
      return false;
    }

    this.launching ??= this.launch(baseUrl, config);
    const running = await this.launching;
    this.launching = null;
    return running;
  }

  /** Kill the owned subprocess (if any) and launch it again. */
  async restart(baseUrl: string, config: HarnessLaunchConfig): Promise<boolean> {
    this.killChild();
    this.lastFailure = null;
    this.lastFailureDetail = null;
    this.lastProbeOk = false;
    return this.ensureRunning(baseUrl, config);
  }

  /** Reap the owned subprocess. Idempotent and terminal. */
  dispose(): void {
    this.disposed = true;
    this.killChild();
  }

  private killChild(): void {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.pid) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Process already exited; nothing to reap.
      }
    }
  }

  private fail(reason: HarnessFailureReason, detail?: string): void {
    this.lastFailure = reason;
    this.lastFailureDetail = detail ?? null;
  }

  private async launch(baseUrl: string, config: HarnessLaunchConfig): Promise<boolean> {
    const dshPath = this.detectDshPath(config);
    if (!dshPath) {
      this.fail('dsh-not-found');
      return false;
    }

    const port = extractPort(baseUrl) ?? 3080;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ...parseEnvironmentVariables(config.environmentText ?? ''),
    };
    // Surface the plugin's safe-mode as DSH's own permission mode. When DSH
    // lacks a sandbox for the requested mode it fails closed itself; this just
    // stops us from silently running with DSH's default.
    if (config.safeMode) {
      environment.DSH_PERMISSION_MODE = config.safeMode;
    }

    let child: ChildProcess;
    try {
      child = spawn(dshPath, ['web', '--port', String(port)], {
        env: environment,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      this.fail('spawn-failed', err instanceof Error ? err.message : String(err));
      return false;
    }

    this.child = child;
    let stderrTail = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_MAX);
      });
    }
    child.once('error', (err) => {
      if (this.child === child) {
        this.child = null;
      }
      this.fail('spawn-failed', err instanceof Error ? err.message : String(err));
    });
    child.once('exit', () => {
      if (this.child === child) {
        this.child = null;
      }
      // Only record a reason if startup hasn't already been flagged.
      if (!this.lastFailure) {
        this.fail('exited-early', stderrTail.trim() || undefined);
      }
    });

    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        if (!this.lastFailure) {
          this.fail('exited-early', stderrTail.trim() || undefined);
        }
        return false;
      }
      if (await probeHarness(baseUrl)) {
        this.lastProbeOk = true;
        this.lastFailure = null;
        this.lastFailureDetail = null;
        return true;
      }
      await sleep(READINESS_POLL_INTERVAL_MS);
    }

    // Timed out waiting; keep the process running but surface the wait failure.
    this.fail('timeout', stderrTail.trim() || undefined);
    return false;
  }
}

function extractPort(baseUrl: string): number | null {
  try {
    const url = new URL(baseUrl);
    if (url.port) return Number(url.port);
    if (url.protocol === 'http:') return 80;
    if (url.protocol === 'https:') return 443;
    return null;
  } catch {
    return null;
  }
}

async function probeHarness(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const { status } = await nodeHttpRequest(baseUrl.replace(/\/+$/, '') + '/', { timeoutMs });
    return status === 200;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
