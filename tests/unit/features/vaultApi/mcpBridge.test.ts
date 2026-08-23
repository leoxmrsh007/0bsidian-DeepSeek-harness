import { execFileSync } from 'child_process';
import * as fs from 'fs';
import type { App } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import {
  MCP_BRIDGE_SCRIPT_FILENAME,
  MCP_BRIDGE_SCRIPT_SOURCE,
} from '../../../../src/features/vaultApi/mcpBridgeSource';
import { generateVaultApiToken } from '../../../../src/features/vaultApi/settings';
import { VaultApiBridge } from '../../../../src/features/vaultApi/VaultApiBridge';

function makeApp(): App {
  return {
    vault: {
      getName: () => 'test-vault',
      getRoot: () => ({ path: '/vault/' }),
      getAllLoadedFiles: () => [],
      read: async () => '',
      adapter: {},
    },
    metadataCache: { resolvedLinks: {}, getFileCache: () => null, getTags: () => ({}) },
  } as unknown as App;
}

describe('MCP bridge script source', () => {
  it('is syntactically valid JavaScript', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-bridge-'));
    try {
      const target = path.join(dir, MCP_BRIDGE_SCRIPT_FILENAME);
      fs.writeFileSync(target, MCP_BRIDGE_SCRIPT_SOURCE, 'utf8');
      // node --check exits 0 only when the file parses cleanly.
      expect(() => execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }))
        .not.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes only read-only tools in 0.2.0', () => {
    expect(MCP_BRIDGE_SCRIPT_SOURCE).toContain('vault_read');
    expect(MCP_BRIDGE_SCRIPT_SOURCE).toContain('vault_frontmatter_get');
    // Write tools must not appear in the read-only bridge surface.
    expect(MCP_BRIDGE_SCRIPT_SOURCE).not.toContain('vault_write');
    expect(MCP_BRIDGE_SCRIPT_SOURCE).not.toContain('vault_delete');
  });
});

describe('VaultApiBridge', () => {
  it('renders a DSH .cordis.yml snippet pointing at the generated proxy', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-bridge-cfg-'));
    try {
      const token = generateVaultApiToken();
      const bridge = new VaultApiBridge({
        app: makeApp(),
        pluginDir: path.join(dir, 'plugin'),
        vaultBasePath: path.join(dir, 'vault'),
        loadData: async () => ({ vaultApi: { enabled: true, port: 3081, token } }),
        saveData: async () => undefined,
      });
      await bridge.load();
      const scriptPath = bridge.writeBridgeScript();
      expect(fs.existsSync(scriptPath)).toBe(true);
      expect(fs.readFileSync(scriptPath, 'utf8')).toContain('vault_read');

      const snippet = bridge.renderDshConfig();
      expect(snippet).toContain('obsidian-vault-bridge');
      expect(snippet).toContain('@deepseek-ai/dsh-mcp-client');
      expect(snippet).toContain('mcp-bridge.cjs');
      expect(snippet).toContain('--vault');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists a generated token when none is stored', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const bridge = new VaultApiBridge({
      app: makeApp(),
      pluginDir: '/tmp/plugin',
      vaultBasePath: '/tmp/vault',
      loadData: async () => ({}),
      saveData: async (data) => { saved.push(data as Record<string, unknown>); },
    });
    await bridge.load();
    expect(saved.length).toBe(1);
    const persisted = saved[0]?.vaultApi as { token?: string; enabled?: boolean };
    expect(persisted.token).toBeDefined();
    expect((persisted.token ?? '').length).toBeGreaterThanOrEqual(32);
  });
});
