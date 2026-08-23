import * as http from 'node:http';

import { type App, TFile, type Vault } from 'obsidian';

import { startVaultApiServer } from '../../../../src/features/vaultApi/VaultApiServer';

function makeVault(): Vault {
  return {
    getName: () => 'test-vault',
    getRoot: () => ({ path: '/vault/' }),
    adapter: { getBasePath: () => '/vault' },
  } as unknown as Vault;
}

function makeFile(_vault: Vault, filePath: string, content: string): TFile {
  const file = new (TFile as unknown as new (path: string) => TFile)(filePath);
  (file as { stat?: unknown }).stat = {
    size: Buffer.byteLength(content, 'utf8'),
    mtime: Date.now(),
  };
  return file;
}

function makeApp(files: TFile[]): App {
  const contentByPath = new Map<string, string>();
  for (const file of files) {
    contentByPath.set(file.path, `# ${file.basename}\nbody`);
  }
  const vault = {
    ...makeVault(),
    getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
    getAllLoadedFiles: () => files,
    getFiles: () => files,
    read: async (file: TFile) => contentByPath.get(file.path) ?? '',
  };
  const metadataCache = {
    resolvedLinks: {},
    getFileCache: () => ({ frontmatter: {}, tags: [] }),
    getTags: () => ({}),
  };
  return {
    vault,
    metadataCache,
    fileManager: {
      renameFile: async () => undefined,
      processFrontMatter: async (_file: TFile, cb: (fm: Record<string, unknown>) => void) => {
        cb({});
      },
    },
  } as unknown as App;
}

function post(
  port: number,
  token: string,
  method: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      type: 'client-request',
      rpcId: 'test-1',
      method,
      payload,
    });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/api/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-DSH-Vault-Token': token,
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: any = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            // leave null
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('VaultApiServer', () => {
  it('serves vault.capabilities with a valid token', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.capabilities', {});
      expect(res.status).toBe(200);
      expect(res.body.result.ok).toBe(true);
      expect(res.body.result.value.vaultName).toBe('test-vault');
      expect(res.body.result.value.features).toContain('vault.read');
    } finally {
      await handle.close();
    }
  });

  it('rejects requests without a token', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, '', 'vault.capabilities', {});
      expect(res.status).toBe(401);
    } finally {
      await handle.close();
    }
  });

  it('rejects requests with the wrong token', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, 'b'.repeat(32), 'vault.capabilities', {});
      expect(res.status).toBe(401);
    } finally {
      await handle.close();
    }
  });

  it('rejects non-POST requests', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port: handle.port, path: '/api/x' }, (r) => {
          r.resume();
          r.on('end', () => resolve({ status: r.statusCode ?? 0 }));
        }).on('error', reject);
      });
      expect(res.status).toBe(405);
    } finally {
      await handle.close();
    }
  });

  it('rejects malformed envelopes', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.read', {} as never, {
        'Content-Type': 'application/json',
      });
      expect(res.status).toBe(200);
      expect(res.body.result.ok).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('routes vault.read and returns note content', async () => {
    const vault = makeVault();
    const file = makeFile(vault, 'notes/a.md', '# A\nbody');
    const app = makeApp([file]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.read', { path: 'notes/a.md' });
      expect(res.status).toBe(200);
      expect(res.body.result.ok).toBe(true);
      expect(res.body.result.value.content).toContain('body');
    } finally {
      await handle.close();
    }
  });

  it('returns a vault error for missing files', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.read', { path: 'missing.md' });
      expect(res.body.result.ok).toBe(false);
      expect(res.body.result.error.code).toBe('file-not-found');
    } finally {
      await handle.close();
    }
  });

  it('rejects path traversal', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32) });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.read', {
        path: '../outside.md',
      });
      expect(res.body.result.ok).toBe(false);
      expect(res.body.result.error.code).toBe('bad-request');
    } finally {
      await handle.close();
    }
  });
});
