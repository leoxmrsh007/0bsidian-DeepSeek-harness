/**
 * Vault API bridge orchestration.
 *
 * Owns the loopback HTTP server lifecycle, persists the bridge settings in
 * the plugin's data.json, writes the self-contained stdio MCP proxy that DSH
 * spawns, and renders the DSH `.cordis.yml` snippet that registers the proxy.
 *
 * Read-only surface only in this version: the proxy exposes
 * `vault_*` capabilities, list, read, search, backlinks, tags, and
 * frontmatter-get tools. Write, append, delete, move, and frontmatter-set
 * stay disabled until the 0.3.0 confirmation gate lands.
 */

import * as fs from 'fs';
import type { App } from 'obsidian';
import * as path from 'path';

import { MCP_BRIDGE_SCRIPT_SOURCE } from './mcpBridgeSource';
import {
  DEFAULT_VAULT_API_SETTINGS,
  generateVaultApiToken,
  normalizeVaultApiSettings,
  type VaultApiSettings,
} from './settings';
import { VaultApiConfirmModal } from './VaultApiConfirmModal';
import { startVaultApiServer, type VaultApiServerHandle } from './VaultApiServer';

const DATA_KEY = 'vaultApi';

export interface VaultApiBridgeStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly port: number;
  readonly token: string;
  readonly writesEnabled: boolean;
  readonly url: string | null;
  readonly error?: string;
}

export interface VaultApiBridgeOptions {
  readonly app: App;
  readonly pluginDir: string;
  readonly vaultBasePath: string;
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class VaultApiBridge {
  private settings: VaultApiSettings = { ...DEFAULT_VAULT_API_SETTINGS };
  private handle: VaultApiServerHandle | null = null;
  private error: string | null = null;

  constructor(private readonly options: VaultApiBridgeOptions) {}

  getStatus(): VaultApiBridgeStatus {
    return {
      enabled: this.settings.enabled,
      running: this.handle !== null,
      port: this.handle?.port ?? this.settings.port,
      token: this.settings.token,
      writesEnabled: this.settings.writesEnabled,
      url: this.handle ? `http://127.0.0.1:${this.handle.port}` : null,
      error: this.error ?? undefined,
    };
  }

  async load(): Promise<void> {
    try {
      const data = await this.options.loadData();
      this.settings = normalizeVaultApiSettings(
        isRecord(data) ? data[DATA_KEY] : undefined,
      );
    } catch {
      this.settings = { ...DEFAULT_VAULT_API_SETTINGS };
    }
    if (this.settings.token.length === 0) {
      this.settings = { ...this.settings, token: generateVaultApiToken() };
      await this.persist();
    }
  }

  async start(): Promise<void> {
    await this.load();
    if (!this.settings.enabled) {
      return;
    }
    await this.restart();
  }

  async stop(): Promise<void> {
    const handle = this.handle;
    this.handle = null;
    if (handle) {
      await handle.close();
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.settings = { ...this.settings, enabled };
    await this.persist();
    if (enabled) {
      await this.restart();
    } else {
      await this.stop();
    }
  }

  async setPort(port: number): Promise<void> {
    const normalized = normalizeVaultApiSettings({
      enabled: this.settings.enabled,
      port,
      token: this.settings.token,
      writesEnabled: this.settings.writesEnabled,
    });
    this.settings = { ...this.settings, port: normalized.port };
    await this.persist();
    if (this.settings.enabled) {
      await this.restart();
    }
  }

  async setWritesEnabled(writesEnabled: boolean): Promise<void> {
    this.settings = { ...this.settings, writesEnabled };
    await this.persist();
    if (this.settings.enabled) {
      await this.restart();
    }
  }

  /** Rotate the token; all existing DSH connections must be updated. */
  async rotateToken(): Promise<void> {
    this.settings = { ...this.settings, token: generateVaultApiToken() };
    await this.persist();
    if (this.settings.enabled) {
      await this.restart();
    }
  }

  /** Confirm (approve/reject) a pending bridge write. */
  async confirm(confirmId: string, approved: boolean): Promise<unknown> {
    return this.handle?.confirm(confirmId, approved) ?? {
      ok: false,
      error: { code: 'server-not-running', message: 'bridge server is not running' },
    };
  }

  /** Write the self-contained stdio proxy into the plugin directory. */
  writeBridgeScript(): string {
    const target = path.join(this.options.pluginDir, 'mcp-bridge.cjs');
    fs.mkdirSync(this.options.pluginDir, { recursive: true });
    fs.writeFileSync(target, MCP_BRIDGE_SCRIPT_SOURCE, 'utf8');
    return target;
  }

  /** Render the DSH `.cordis.yml` overlay that registers the proxy. */
  renderDshConfig(): string {
    const scriptPath = path.join(this.options.pluginDir, 'mcp-bridge.cjs');
    const port = this.handle?.port ?? this.settings.port;
    return [
      '# DeepSeek Vault Harness bridge (read-only).',
      '# Save as `<dsh-config-dir>/obsidian-vault-bridge.cordis.yml` and restart DSH.',
      '- insert:',
      '    - id: obsidian-vault-bridge',
      '      name: \'@deepseek-ai/dsh-mcp-client\'',
      '      config:',
      `        serverName: obsidian-vault-bridge`,
      '        transport: stdio',
      '        command: node',
      `        args: [${JSON.stringify(scriptPath)}, --vault, ${JSON.stringify(this.options.vaultBasePath)}, --port, ${JSON.stringify(String(port))}]`,
      `        cwd: !!js process.cwd()`,
      '',
    ].join('\n');
  }

  private async restart(): Promise<void> {
    await this.stop();
    this.error = null;
    try {
      const handle = await startVaultApiServer({
        app: this.options.app,
        port: this.settings.port,
        token: this.settings.token,
        writesEnabled: this.settings.writesEnabled,
        onWriteRequest: (request) => {
          const modal = new VaultApiConfirmModal(this.options.app, request, this);
          modal.open();
        },
      });
      this.handle = handle;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.handle = null;
    }
  }

  private async persist(): Promise<void> {
    const data = await this.options.loadData();
    await this.options.saveData({
      ...(isRecord(data) ? data : {}),
      [DATA_KEY]: this.settings,
    });
  }
}
