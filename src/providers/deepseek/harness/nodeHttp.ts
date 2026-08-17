import type { IncomingMessage } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Minimal Node http(s) request helper for the DeepSeek Harness local RPC API.
 *
 * Why not fetch(): Obsidian's Electron renderer enforces CORS on fetch(), and
 * dsh's local web server sends no Access-Control-Allow-Origin header (its own
 * frontend talks over an IPC bridge, not HTTP). Node's http module bypasses the
 * browser CORS layer entirely, and Obsidian's renderer exposes Node built-ins.
 */
export interface NodeHttpResponse {
  readonly status: number;
  readonly text: () => Promise<string>;
}

export interface NodeHttpOptions {
  readonly method?: 'GET' | 'POST';
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export function nodeHttpRequest(
  url: string,
  options: NodeHttpOptions = {},
): Promise<NodeHttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const method = options.method ?? 'GET';
    const lib = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const body = options.body ?? '';

    const req = lib(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers:
          method === 'POST'
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : undefined,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, text: () => Promise.resolve(text) });
        });
      },
    );

    req.on('error', reject);

    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(new Error('aborted'));
        return;
      }
      options.signal.addEventListener('abort', () => req.destroy(new Error('aborted')), {
        once: true,
      });
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      req.setTimeout(options.timeoutMs, () => req.destroy(new Error('timeout')));
    }

    if (method === 'POST') req.write(body);
    req.end();
  });
}
