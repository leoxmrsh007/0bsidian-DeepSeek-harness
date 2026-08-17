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
  /** Auto-launch `dsh web` when the endpoint is unreachable. */
  autoLaunch: boolean;
  /** Optional explicit path to the `dsh` binary (empty resolves via PATH). */
  dshPath: string;
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
  defaultModel: 'deepseek-v4-flash',
  lastModel: 'deepseek-v4-flash',
  modelEnvironmentType: '',
  titleModelEnvironmentType: '',
  environmentVariables: '',
  environmentHash: '',
  harnessBaseUrl: 'http://127.0.0.1:3080',
  autoLaunch: true,
  dshPath: '',
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
    autoLaunch: readStoredBoolean(
      config.autoLaunch,
      DEFAULT_CLAUDE_PROVIDER_SETTINGS.autoLaunch,
    ),
    dshPath: readStoredString(
      config.dshPath,
      DEFAULT_CLAUDE_PROVIDER_SETTINGS.dshPath,
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
