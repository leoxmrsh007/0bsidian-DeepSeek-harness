/**
 * Vault API (DSH ↔ Obsidian bridge) protocol types.
 *
 * The bridge mirrors the DeepSeek Harness RPC envelope so a DSH-side client
 * can speak one uniform protocol to both the harness and the vault:
 *
 *   POST http://127.0.0.1:<port>/api/<method>
 *   {"type":"client-request","rpcId":"<uuid>","method":"vault.read","payload":{...}}
 *   → {"type":"server-response","rpcId":...,"result":{"ok":true,"value":{...}}}
 *
 * Auth: header `X-DSH-Vault-Token` must match the plugin's per-install token.
 * The server binds loopback only and rejects remote endpoints by construction.
 */

export const VAULT_API_VERSION = 1;
export const VAULT_API_PROTOCOL_VERSION = '0.1.6';

export interface VaultApiRequest {
  readonly type: 'client-request';
  readonly rpcId: string;
  readonly method: string;
  readonly payload: Record<string, unknown>;
}

export interface VaultApiError {
  readonly code: string;
  readonly message: string;
}

/** Thrown by handlers for expected vault-bridge failures. */
export class VaultApiErrorImpl extends Error implements VaultApiError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VaultApiError';
    this.code = code;
  }
}

export interface VaultApiResponse<T = unknown> {
  readonly type: 'server-response';
  readonly rpcId: string;
  readonly result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: VaultApiError };
}

export interface VaultFileInfo {
  readonly path: string;
  readonly basename: string;
  readonly extension: string;
  readonly size: number;
  readonly mtime: number;
}

export interface VaultListResult {
  readonly items: VaultFileInfo[];
  readonly total: number;
  readonly truncated: boolean;
}

export interface VaultReadResult {
  readonly path: string;
  readonly content: string;
  readonly bytes: number;
  readonly truncated: boolean;
  readonly mtime: number;
}

export interface VaultWriteResult {
  readonly path: string;
  readonly bytes: number;
  readonly existed: boolean;
  readonly mtime: number;
}

export interface VaultDeleteResult {
  readonly path: string;
  readonly trashed: boolean;
}

export interface VaultMoveResult {
  readonly from: string;
  readonly to: string;
  readonly updatedLinks: number;
}

export interface VaultSearchLine {
  readonly line: number;
  readonly text: string;
}

export interface VaultSearchMatch {
  readonly path: string;
  readonly lines: VaultSearchLine[];
}

export interface VaultSearchResult {
  readonly matches: VaultSearchMatch[];
  readonly total: number;
  readonly truncated: boolean;
}

export interface VaultBacklinksResult {
  readonly path: string;
  readonly links: Array<{
    readonly path: string;
    readonly count: number;
  }>;
}

export interface VaultTagsResult {
  readonly tags: Array<{ readonly tag: string; readonly count: number }>;
}

export interface VaultFrontmatterGetResult {
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface VaultFrontmatterSetResult {
  readonly path: string;
  readonly key: string;
}

export interface VaultFrontmatterDeleteResult {
  readonly path: string;
  readonly key: string;
  readonly removed: boolean;
}

export interface VaultCapabilitiesResult {
  readonly version: string;
  readonly apiVersion: number;
  readonly vaultName: string;
  readonly vaultPath: string;
  readonly features: string[];
}

/** Every method this bridge implements, for /api/vault.capabilities. */
export const VAULT_API_FEATURES = [
  'vault.list',
  'vault.read',
  'vault.write',
  'vault.append',
  'vault.delete',
  'vault.move',
  'vault.search',
  'vault.backlinks',
  'vault.tags',
  'vault.frontmatter.get',
  'vault.frontmatter.set',
  'vault.frontmatter.delete',
] as const;
