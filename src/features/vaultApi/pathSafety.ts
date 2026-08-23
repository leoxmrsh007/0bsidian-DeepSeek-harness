/**
 * Path safety for the vault bridge.
 *
 * Every user-supplied vault path must be resolved inside the vault root:
 * absolute paths are rejected, `..` segments are rejected, and NUL bytes are
 * rejected. Fail-closed by design — a malformed path never reaches the vault.
 */

export interface PathSafetyResult {
  readonly ok: boolean;
  readonly path?: string;
  readonly error?: string;
}

const INVALID_SEGMENT = /(^|\/)\.\.(\/|$)/;

/**
 * Normalize and validate a vault-relative path.
 *
 * Returns the normalized forward-slash path (no leading slash, no trailing
 * slash) when safe; otherwise an error description. Empty paths are valid for
 * operations that accept the vault root (e.g. listing).
 */
export function normalizeVaultPath(raw: unknown): PathSafetyResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'path must be a string' };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, path: '' };
  }
  if (trimmed.includes('\u0000')) {
    return { ok: false, error: 'path contains NUL byte' };
  }
  if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: 'path must be vault-relative (no leading slash or drive)' };
  }
  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (INVALID_SEGMENT.test(normalized)) {
    return { ok: false, error: 'path must not contain ".." segments' };
  }
  const cleaned = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  return { ok: true, path: cleaned };
}

/** True when `child` equals `parent` or lives under it (both vault-relative). */
export function isWithinDir(child: string, parent: string): boolean {
  if (!parent) return true;
  return child === parent || child.startsWith(parent.replace(/\/+$/, '') + '/');
}

/**
 * Cap string length for payload fields (paths, keys, queries).
 * Oversized values are rejected, never silently truncated, to keep the
 * request surface bounded.
 */
export function withinLimit(value: string, max: number): boolean {
  return value.length <= max;
}

export const LIMITS = {
  path: 1024,
  key: 256,
  query: 512,
  dir: 1024,
  contentBytes: 8 * 1024 * 1024,
  readBytes: 1024 * 1024,
  searchFileBytes: 256 * 1024,
  searchMatches: 200,
  listFiles: 2000,
} as const;
