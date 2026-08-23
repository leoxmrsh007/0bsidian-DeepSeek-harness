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
    modify: async (file: TFile, content: string) => {
      contentByPath.set(file.path, content);
    },
    create: async (vaultPath: string, content: string) => {
      contentByPath.set(vaultPath, content);
    },
    createFolder: async () => undefined,
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
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
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
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
    try {
      const res = await post(handle.port, '', 'vault.capabilities', {});
      expect(res.status).toBe(401);
    } finally {
      await handle.close();
    }
  });

  it('rejects requests with the wrong token', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
    try {
      const res = await post(handle.port, 'b'.repeat(32), 'vault.capabilities', {});
      expect(res.status).toBe(401);
    } finally {
      await handle.close();
    }
  });

  it('rejects non-POST requests', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
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
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
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
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
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
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
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
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
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

describe('VaultApiServer write confirmation gate', () => {
  it('rejects mutations when writes are disabled', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: false });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.write', { path: 'x.md', content: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.result.ok).toBe(false);
      expect(res.body.result.error.code).toBe('writes-disabled');
    } finally {
      await handle.close();
    }
  });

  it('queues mutations behind a pending-confirmation and executes on approve', async () => {
    const vault = makeVault();
    const file = makeFile(vault, 'target.md', '# old');
    const app = makeApp([file]);
    let requested: any = null;
    const handle = await startVaultApiServer({
      app,
      port: 0,
      token: 'a'.repeat(32),
      writesEnabled: true,
      onWriteRequest: (req) => { requested = req; },
    });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.write', {
        path: 'target.md',
        content: '# new content',
      });
      expect(res.body.result.ok).toBe(false);
      expect(res.body.result.error.code).toBe('pending-confirmation');
      const confirmId = res.body.result.error.confirmId;
      expect(requested.confirmId).toBe(confirmId);
      expect(requested.method).toBe('vault.write');

      // Approving via the server handle runs the mutation.
      const outcome = await handle.confirm(confirmId, true);
      expect((outcome as any).ok).toBe(true);
      expect((outcome as any).value.approved).toBe(true);
      // The pending entry is now consumed.
      const second = await handle.confirm(confirmId, true);
      expect((second as any).ok).toBe(false);
      expect((second as any).error.code).toBe('confirm-not-found');
    } finally {
      await handle.close();
    }
  });

  it('discards the write when confirmation is rejected', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: true });
    try {
      const res = await post(handle.port, 'a'.repeat(32), 'vault.write', {
        path: 'never.md',
        content: 'should not be written',
      });
      const confirmId = res.body.result.error.confirmId;
      const outcome = await handle.confirm(confirmId, false);
      expect((outcome as any).ok).toBe(true);
      expect((outcome as any).value.approved).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('supports vault.confirm over the wire', async () => {
    const app = makeApp([]);
    const handle = await startVaultApiServer({ app, port: 0, token: 'a'.repeat(32), writesEnabled: true });
    try {
      const write = await post(handle.port, 'a'.repeat(32), 'vault.append', {
        path: 'log.md',
        content: 'line1',
      });
      const confirmId = write.body.result.error.confirmId;
      const confirmed = await post(handle.port, 'a'.repeat(32), 'vault.confirm', {
        confirmId,
        approved: false,
      });
      expect(confirmed.body.result.ok).toBe(true);
      expect(confirmed.body.result.value.approved).toBe(false);
    } finally {
      await handle.close();
    }
  });
});
});
