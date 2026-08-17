import { type ChildProcess,spawn } from 'child_process';

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
}

const READINESS_POLL_INTERVAL_MS = 500;
const READINESS_TIMEOUT_MS = 20_000;

/**
 * Lazily starts and owns the `dsh web` desktop app subprocess.
 *
 * The harness desktop app is the agent engine for the deepseek provider.
 * It is a long-lived server shared by every session, so the launcher is a
 * module-level singleton that reuses one child across the plugin lifetime and
 * reaps it on plugin unload (through the workspace dispose path).
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

  /**
   * Ensure the harness endpoint is reachable, launching `dsh web` when it is
   * not already running and {@link HarnessLaunchConfig.autoLaunch} is enabled.
   */
  async ensureRunning(baseUrl: string, config: HarnessLaunchConfig): Promise<boolean> {
    if (this.disposed) return false;
    if (await probeHarness(baseUrl)) return true;
    if (!config.autoLaunch) return false;

    this.launching ??= this.launch(baseUrl, config);
    const running = await this.launching;
    this.launching = null;
    return running;
  }

  /** Reap the owned subprocess. Idempotent and terminal. */
  dispose(): void {
    this.disposed = true;
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

  private resolveDshPath(config: HarnessLaunchConfig): string | null {
    const explicit = (config.dshPath ?? '').trim();
    if (explicit) return explicit;
    return findCliBinaryPath('dsh');
  }

  private async launch(baseUrl: string, config: HarnessLaunchConfig): Promise<boolean> {
    const dshPath = this.resolveDshPath(config);
    if (!dshPath) return false;

    const port = extractPort(baseUrl) ?? 3080;
    const environment = {
      ...process.env,
      ...parseEnvironmentVariables(config.environmentText ?? ''),
    };

    try {
      this.child = spawn(dshPath, ['web', '--port', String(port)], {
        env: environment,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
    } catch {
      return false;
    }

    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.child.exitCode !== null) {
        // The app exited before becoming ready (bad port, missing key, etc.).
        return false;
      }
      if (await probeHarness(baseUrl)) return true;
      await sleep(READINESS_POLL_INTERVAL_MS);
    }
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
