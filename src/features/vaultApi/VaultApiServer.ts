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

import type { App } from 'obsidian';

import { DEFAULT_VAULT_API_PORT } from './settings';
import type { VaultApiRequest, VaultApiResponse } from './types';
import { VaultApiHandlers } from './VaultApiHandlers';

/** Maximum accepted request body (bytes). Mirrors the harness RPC body cap. */
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const TOKEN_HEADER = 'x-dsh-vault-token';

export interface VaultApiServerOptions {
  readonly port: number;
  readonly token: string;
  readonly app: App;
}

export interface VaultApiServerHandle {
  readonly port: number;
  close(): Promise<void>;
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
  const port = options.port === 0 ? 0 : options.port;

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

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
      });
    });
  });
}

export function defaultVaultApiPort(): number {
  return DEFAULT_VAULT_API_PORT;
}
