/**
 * Payload validation for vault bridge requests.
 *
 * The bridge trusts nothing from the wire: every payload field is type- and
 * size-checked before it reaches an Obsidian API. Validation failures throw a
 * `VaultApiErrorImpl` carrying a stable field name; the dispatch catch maps it
 * back onto the wire envelope.
 */

import { LIMITS, normalizeVaultPath, withinLimit } from './pathSafety';
import { VaultApiErrorImpl } from './types';

export function badRequest(field: string, message: string): VaultApiErrorImpl {
  return new VaultApiErrorImpl('bad-request', `${field}: ${message}`);
}

export function parsePath(payload: Record<string, unknown>): string {
  const raw = payload.path;
  if (typeof raw !== 'string' || !withinLimit(raw, LIMITS.path)) {
    throw badRequest('path', 'expected a non-empty string within the size limit');
  }
  const safe = normalizeVaultPath(raw);
  if (!safe.ok || !safe.path) {
    throw badRequest('path', safe.error ?? 'invalid path');
  }
  return safe.path;
}

export function parseOptionalDir(payload: Record<string, unknown>): string {
  const raw = payload.dir;
  if (raw === undefined || raw === null || raw === '') {
    return '';
  }
  if (typeof raw !== 'string' || !withinLimit(raw, LIMITS.dir)) {
    throw badRequest('dir', 'expected a string within the size limit');
  }
  const safe = normalizeVaultPath(raw);
  if (!safe.ok) {
    throw badRequest('dir', safe.error ?? 'invalid path');
  }
  return safe.path ?? '';
}

/** Returns -1 when the caller did not provide a limit. */
export function parseOptionalLimit(payload: Record<string, unknown>): number {
  const raw = payload.limit;
  if (raw === undefined || raw === null) {
    return -1;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw badRequest('limit', 'expected a positive integer');
  }
  return raw;
}

export function parseContent(payload: Record<string, unknown>): string {
  const raw = payload.content;
  if (typeof raw !== 'string') {
    throw badRequest('content', 'expected a string');
  }
  if (Buffer.byteLength(raw, 'utf8') > LIMITS.contentBytes) {
    throw badRequest('content', `exceeds ${LIMITS.contentBytes} bytes`);
  }
  return raw;
}

export function parseQuery(payload: Record<string, unknown>): string {
  const raw = payload.query;
  if (typeof raw !== 'string' || !withinLimit(raw, LIMITS.query) || raw.trim().length === 0) {
    throw badRequest('query', 'expected a non-empty string within the size limit');
  }
  return raw;
}

export function parseKey(payload: Record<string, unknown>): string {
  const raw = payload.key;
  if (typeof raw !== 'string' || !withinLimit(raw, LIMITS.key) || raw.trim().length === 0) {
    throw badRequest('key', 'expected a non-empty string within the size limit');
  }
  return raw.trim();
}

export function parseContext(payload: Record<string, unknown>): number {
  const raw = payload.context;
  if (raw === undefined || raw === null) {
    return 1;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 20) {
    throw badRequest('context', 'expected an integer between 0 and 20');
  }
  return raw;
}
