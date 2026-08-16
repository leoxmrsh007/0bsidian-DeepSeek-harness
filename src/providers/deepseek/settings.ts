import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import { normalizeHostnameStringMap } from '../../core/providers/settings/HostnameStringMap';
import {
  readStoredBoolean,
  readStoredString,
} from '../../core/providers/settings/storedSettings';
import type { HostnameCliPaths } from '../../core/types/settings';
import {
  type ClaudeModelEnvironmentType,
  isClaudeModelEnvironmentType,
} from './modelTiers';

export const CLAUDE_SAFE_MODES = ['acceptEdits', 'auto', 'default'] as const;
export type ClaudeSafeMode = typeof CLAUDE_SAFE_MODES[number];
export type ClaudeSettingSource = 'user' | 'project' | 'local';

export interface ClaudeProviderSettings {
  enabled: boolean;
  safeMode: ClaudeSafeMode;
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  loadUserSettings: boolean;
  enableChrome: boolean;
  enableBangBash: boolean;
  customModels: string;
  defaultModel: string;
  lastModel: string;
  modelEnvironmentType: ClaudeModelEnvironmentType | '';
  titleModelEnvironmentType: ClaudeModelEnvironmentType | '';
  environmentVariables: string;
  environmentHash: string;
  /** Base URL of the DeepSeek Harness local RPC API. */
  harnessBaseUrl: string;
}

export const DEFAULT_CLAUDE_PROVIDER_SETTINGS: Readonly<ClaudeProviderSettings> = Object.freeze({
  enabled: false,
  safeMode: 'acceptEdits',
  cliPath: '',
  cliPathsByHost: {},
  loadUserSettings: true,
  enableChrome: false,
  enableBangBash: false,
  customModels: '',
  defaultModel: 'deepseek-chat',
  lastModel: 'deepseek-chat',
  modelEnvironmentType: '',
  titleModelEnvironmentType: '',
  // Point the Claude Code CLI at DeepSeek's Anthropic-compatible endpoint.
  // Users only need to add their key, e.g.:
  //   ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
  //   ANTHROPIC_AUTH_TOKEN=sk-...
  //   ANTHROPIC_MODEL=deepseek-chat
  //   ANTHROPIC_SMALL_FAST_MODEL=deepseek-chat
  //   ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat
  //   ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat
  //   ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-reasoner
  environmentVariables: '',
  environmentHash: '',
  harnessBaseUrl: 'http://127.0.0.1:3080',
});

function normalizeClaudeSafeMode(value: unknown): ClaudeSafeMode | undefined {
  return (CLAUDE_SAFE_MODES as readonly unknown[]).includes(value)
    ? value as ClaudeSafeMode
    : undefined;
}

function readStoredClaudeSafeMode(
  value: unknown,
  fallback: ClaudeSafeMode,
): ClaudeSafeMode {
  if (value === undefined) {
    return fallback;
  }
  return normalizeClaudeSafeMode(value) ?? 'default';
}

function normalizeClaudeModelEnvironmentType(
  value: unknown,
): ClaudeModelEnvironmentType | '' {
  return typeof value === 'string' && isClaudeModelEnvironmentType(value)
    ? value
    : '';
}

export function getClaudeProviderSettings(
  settings: Record<string, unknown>,
): ClaudeProviderSettings {
  const config = getProviderConfig(settings, 'deepseek');
  const cliPathsByHost = normalizeHostnameStringMap(
    config.cliPathsByHost ?? settings.claudeCliPathsByHost,
  );

  return {
    enabled: readStoredBoolean(
      config.enabled,
      DEFAULT_CLAUDE_PROVIDER_SETTINGS.enabled,
    ),
    safeMode: readStoredClaudeSafeMode(
      config.safeMode,
      readStoredClaudeSafeMode(
        settings.claudeSafeMode,
        DEFAULT_CLAUDE_PROVIDER_SETTINGS.safeMode,
      ),
    ),
    cliPath: readStoredString(
      config.cliPath,
      readStoredString(settings.claudeCliPath, DEFAULT_CLAUDE_PROVIDER_SETTINGS.cliPath),
    ),
    cliPathsByHost,
    loadUserSettings: readStoredBoolean(
      config.loadUserSettings,
      readStoredBoolean(
        settings.loadUserClaudeSettings,
        DEFAULT_CLAUDE_PROVIDER_SETTINGS.loadUserSettings,
      ),
    ),
    enableChrome: readStoredBoolean(
      config.enableChrome,
      readStoredBoolean(settings.enableChrome, DEFAULT_CLAUDE_PROVIDER_SETTINGS.enableChrome),
    ),
    enableBangBash: readStoredBoolean(
      config.enableBangBash,
      readStoredBoolean(settings.enableBangBash, DEFAULT_CLAUDE_PROVIDER_SETTINGS.enableBangBash),
    ),
    customModels: readStoredString(
      config.customModels,
      DEFAULT_CLAUDE_PROVIDER_SETTINGS.customModels,
    ),
    defaultModel: readStoredString(
      config.defaultModel,
      DEFAULT_CLAUDE_PROVIDER_SETTINGS.defaultModel,
    ),
    lastModel: readStoredString(
      config.lastModel,
      readStoredString(settings.lastClaudeModel, DEFAULT_CLAUDE_PROVIDER_SETTINGS.lastModel),
    ),
    modelEnvironmentType: normalizeClaudeModelEnvironmentType(config.modelEnvironmentType),
    titleModelEnvironmentType: normalizeClaudeModelEnvironmentType(
      config.titleModelEnvironmentType,
    ),
    environmentVariables: readStoredString(
      config.environmentVariables,
      getProviderEnvironmentVariables(settings, 'deepseek')
        ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.environmentVariables,
    ),
    environmentHash: readStoredString(
      config.environmentHash,
      readStoredString(settings.lastEnvHash, DEFAULT_CLAUDE_PROVIDER_SETTINGS.environmentHash),
    ),
    harnessBaseUrl: readStoredString(
      config.harnessBaseUrl,
      DEFAULT_CLAUDE_PROVIDER_SETTINGS.harnessBaseUrl,
    ),
  };
}

export function resolveClaudeSettingSources(
  loadUserSettings: boolean,
): ClaudeSettingSource[] {
  return loadUserSettings
    ? ['user', 'project', 'local']
    : ['project', 'local'];
}

export function updateClaudeProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<ClaudeProviderSettings>,
): ClaudeProviderSettings {
  const current = getClaudeProviderSettings(settings);
  const next = {
    ...current,
    ...updates,
    safeMode: 'safeMode' in updates
      ? normalizeClaudeSafeMode(updates.safeMode) ?? current.safeMode
      : current.safeMode,
  };
  setProviderConfig(settings, 'deepseek', next);
  return next;
}
