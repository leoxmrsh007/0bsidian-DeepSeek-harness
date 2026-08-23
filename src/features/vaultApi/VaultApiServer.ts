/**
 * Loopback HTTP server for the vault bridge.
 *
 * The server binds 127.0.0.1 only and rejects every request whose
 * `X-DSH-Vault-Token` header does not match the per-install token in constant
 * time. Request bodies are size-capped before parsing so a misbehaving or
 * hostile local process cannot exhaust memory.
 *
 *   POST /api/vault.read
 *   {"type":"client-request","rpcId":"<uuid>","method":"vault.read","payload":{...}}
 *   → {"type":"server-response","rpcId":...,"result":{"ok":true,"value":{...}}}
 */

import * as http from 'node:http';

import { randomUUID } from 'crypto';
import type { App } from 'obsidian';

import { DEFAULT_VAULT_API_PORT } from './settings';
import type { VaultApiRequest, VaultApiResponse } from './types';
import { VaultApiHandlers } from './VaultApiHandlers';

/** Maximum accepted request body (bytes). Mirrors the harness RPC body cap. */
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const TOKEN_HEADER = 'x-dsh-vault-token';

/** Write methods must pass the in-Obsidian confirmation gate. */
const MUTATION_METHODS = new Set([
  'vault.write',
  'vault.append',
  'vault.delete',
  'vault.move',
  'vault.frontmatter.set',
  'vault.frontmatter.delete',
]);

export interface PendingWriteRequest {
  readonly confirmId: string;
  readonly method: string;
  readonly path: string;
  readonly preview: string;
  readonly rpcId: string;
}

export interface VaultApiServerOptions {
  readonly port: number;
  readonly token: string;
  readonly app: App;
  /** When false, mutation methods are rejected before reaching the confirm gate. */
  readonly writesEnabled: boolean;
  /** Called once per mutation that reaches the confirmation gate. */
  onWriteRequest?: (request: PendingWriteRequest) => void;
}

export interface VaultApiServerHandle {
  readonly port: number;
  close(): Promise<void>;
  /** Approve or reject a pending write; resolves with the mutation result. */
  confirm(confirmId: string, approved: boolean): Promise<unknown>;
}

function summarizeMutation(method: string, payload: Record<string, unknown>): string {
  const path = typeof payload.path === 'string' ? payload.path : '';
  switch (method) {
    case 'vault.write':
    case 'vault.append': {
      const content = typeof payload.content === 'string' ? payload.content : '';
      const preview = content.length > 400 ? `${content.slice(0, 400)}…` : content;
      return `${path} (${content.length} chars)\n\n${preview}`;
    }
    case 'vault.move':
      return `${path} → ${String(payload.to ?? '')}`;
    case 'vault.frontmatter.set':
    case 'vault.frontmatter.delete':
      return `${path} frontmatter.${String(payload.key ?? '')}`;
    case 'vault.delete':
    default:
      return path;
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    // Burn comparable time before rejecting.
    Buffer.from(right).equals(Buffer.from(left));
    return false;
  }
  return Buffer.compare(a, b) === 0;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_REQUEST_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

/**
 * Start the vault bridge HTTP server on a loopback interface.
 *
 * `port` may be 0 to request an ephemeral port; the actual bound port is
 * returned so callers can persist it for the DSH-side client.
 */
export function startVaultApiServer(
  options: VaultApiServerOptions,
): Promise<VaultApiServerHandle> {
  const handlers = new VaultApiHandlers(options.app);
  const pendingWrites = new Map<string, { method: string; payload: Record<string, unknown> }>();
  const port = options.port === 0 ? 0 : options.port;

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function confirmPending(
    confirmId: string,
    approved: boolean,
  ): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> {
    const pending = pendingWrites.get(confirmId);
    if (!pending) {
      return {
        ok: false,
        error: { code: 'confirm-not-found', message: `unknown confirmation: ${confirmId}` },
      };
    }
    pendingWrites.delete(confirmId);
    if (!approved) {
      return { ok: true, value: { approved: false } };
    }
    const result = await handlers.dispatch(pending.method, pending.payload);
    return result.ok
      ? { ok: true, value: { approved: true, result: result.value } }
      : { ok: false, error: result.error };
  }

  async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' });
      return;
    }
    const providedToken = req.headers[TOKEN_HEADER];
    if (
      typeof providedToken !== 'string'
      || providedToken.length === 0
      || !timingSafeEqual(providedToken, options.token)
    ) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 413, { error: 'payload-too-large' });
      return;
    }

    let envelope: VaultApiRequest;
    try {
      const parsed = JSON.parse(body) as Partial<VaultApiRequest>;
      if (
        parsed.type !== 'client-request'
        || typeof parsed.rpcId !== 'string'
        || typeof parsed.method !== 'string'
        || !parsed.payload
        || typeof parsed.payload !== 'object'
        || Array.isArray(parsed.payload)
      ) {
        throw new Error('invalid envelope');
      }
      envelope = parsed as VaultApiRequest;
    } catch {
      sendJson(res, 400, { error: 'invalid-request' });
      return;
    }

    if (envelope.method === 'vault.confirm') {
      const confirmId = typeof envelope.payload.confirmId === 'string' ? envelope.payload.confirmId : '';
      const approved = envelope.payload.approved === true;
      const outcome = await confirmPending(confirmId, approved);
      sendJson(res, 200, {
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: outcome.ok
          ? { ok: true, value: outcome.value }
          : { ok: false, error: outcome.error ?? { code: 'unknown', message: 'unknown error' } },
      });
      return;
    }

    if (MUTATION_METHODS.has(envelope.method)) {
      if (!options.writesEnabled) {
        sendJson(res, 200, {
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: {
            ok: false,
            error: { code: 'writes-disabled', message: 'write bridge is disabled in plugin settings' },
          },
        });
        return;
      }
      const confirmId = randomUUID();
      const preview = summarizeMutation(envelope.method, envelope.payload);
      const vaultPath = typeof envelope.payload.path === 'string' ? envelope.payload.path : '';
      pendingWrites.set(confirmId, {
        method: envelope.method,
        payload: envelope.payload,
      });
      options.onWriteRequest?.({
        confirmId,
        method: envelope.method,
        path: vaultPath,
        preview,
        rpcId: envelope.rpcId,
      });
      sendJson(res, 200, {
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: {
          ok: false,
          error: {
            code: 'pending-confirmation',
            message: 'write requires confirmation in Obsidian',
            confirmId,
            preview,
          },
        },
      });
      return;
    }

    const result = await handlers.dispatch(envelope.method, envelope.payload);
    const response: VaultApiResponse = {
      type: 'server-response',
      rpcId: envelope.rpcId,
      result: result.ok
        ? { ok: true, value: result.value }
        : { ok: false, error: result.error ?? { code: 'unknown', message: 'unknown error' } },
    };
    sendJson(res, 200, response);
  }

  return new Promise((resolve, reject) => {
    const onStartupError = (error: Error): void => reject(error);
    server.once('error', onStartupError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onStartupError);
      // Post-listen errors (dropped connections) must not crash the process.
      server.on('error', () => {
        // ignore transient connection errors
      });
      const address = server.address();
      const boundPort = typeof address === 'object' && address
        ? address.port
        : port;
      resolve({
        port: boundPort,
        close: () => new Promise<void>((closeResolve) => server.close(() => closeResolve())),
        confirm: (confirmId, approved) => confirmPending(confirmId, approved),
      });
    });
  });
}

export function defaultVaultApiPort(): number {
  return DEFAULT_VAULT_API_PORT;
}
