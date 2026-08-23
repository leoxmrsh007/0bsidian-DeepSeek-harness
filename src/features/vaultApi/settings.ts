/**
 * Vault API bridge settings: enable toggle, loopback port, per-install token.
 *
 * The token is generated once on first enable and persisted with the plugin
 * settings. A DSH-side client discovers it by reading this plugin's data.json
 * from the vault (`.obsidian/plugins/deepseek-vault-harness/data.json`), so
 * no token ever crosses the network unencrypted or needs manual copying.
 */

import { randomBytes } from 'crypto';

export interface VaultApiSettings {
  readonly enabled: boolean;
  readonly port: number;
  readonly token: string;
}

export const DEFAULT_VAULT_API_PORT = 3081;
export const MIN_VAULT_API_PORT = 1024;
export const MAX_VAULT_API_PORT = 65535;

export function generateVaultApiToken(): string {
  return randomBytes(32).toString('hex');
}

export function isSafeVaultApiPort(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_VAULT_API_PORT && value <= MAX_VAULT_API_PORT;
}

export function normalizeVaultApiPort(value: unknown): number {
  if (typeof value === 'number' && isSafeVaultApiPort(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (isSafeVaultApiPort(parsed)) {
      return parsed;
    }
  }
  return DEFAULT_VAULT_API_PORT;
}

export const DEFAULT_VAULT_API_SETTINGS: Readonly<VaultApiSettings> = Object.freeze({
  enabled: false,
  port: DEFAULT_VAULT_API_PORT,
  token: '',
});

export function normalizeVaultApiSettings(value: unknown): VaultApiSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_VAULT_API_SETTINGS };
  }
  const record = value as Record<string, unknown>;
  const enabled = record.enabled === true;
  const port = normalizeVaultApiPort(record.port);
  const token = typeof record.token === 'string' && record.token.length >= 32
    ? record.token
    : generateVaultApiToken();
  return { enabled, port, token };
}
