import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import { normalizeHostnameStringMap } from '../../core/providers/settings/HostnameStringMap';
import {
  readStoredBoolean,
  readStoredString,
} from '../../core/providers/settings/storedSettings';
import type { HostnameCliPaths } from '../../core/types/settings';
import {
  type DeepSeekModelEnvironmentType,
  isDeepSeekModelEnvironmentType,
} from './modelTiers';

export const DEEPSEEK_SAFE_MODES = ['acceptEdits', 'auto', 'default'] as const;
export type DeepSeekSafeMode = typeof DEEPSEEK_SAFE_MODES[number];
export type DeepSeekSettingSource = 'user' | 'project' | 'local';

export interface DeepSeekProviderSettings {
  enabled: boolean;
  safeMode: DeepSeekSafeMode;
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  loadUserSettings: boolean;
  enableChrome: boolean;
  enableBangBash: boolean;
  customModels: string;
  defaultModel: string;
  lastModel: string;
  modelEnvironmentType: DeepSeekModelEnvironmentType | '';
  titleModelEnvironmentType: DeepSeekModelEnvironmentType | '';
  environmentVariables: string;
  environmentHash: string;
  /** Base URL of the DeepSeek Harness local RPC API. */
  harnessBaseUrl: string;
  /** Auto-launch `dsh web` when the endpoint is unreachable. */
  autoLaunch: boolean;
  /** Optional explicit path to the `dsh` binary (empty resolves via PATH). */
  dshPath: string;
}

export const DEFAULT_DEEPSEEK_PROVIDER_SETTINGS: Readonly<DeepSeekProviderSettings> = Object.freeze({
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

function normalizeDeepSeekSafeMode(value: unknown): DeepSeekSafeMode | undefined {
  return (DEEPSEEK_SAFE_MODES as readonly unknown[]).includes(value)
    ? value as DeepSeekSafeMode
    : undefined;
}

function readStoredDeepSeekSafeMode(
  value: unknown,
  fallback: DeepSeekSafeMode,
): DeepSeekSafeMode {
  if (value === undefined) {
    return fallback;
  }
  return normalizeDeepSeekSafeMode(value) ?? 'default';
}

function normalizeDeepSeekModelEnvironmentType(
  value: unknown,
): DeepSeekModelEnvironmentType | '' {
  return typeof value === 'string' && isDeepSeekModelEnvironmentType(value)
    ? value
    : '';
}

export function getDeepSeekProviderSettings(
  settings: Record<string, unknown>,
): DeepSeekProviderSettings {
  const config = getProviderConfig(settings, 'deepseek');
  const cliPathsByHost = normalizeHostnameStringMap(config.cliPathsByHost);

  return {
    enabled: readStoredBoolean(
      config.enabled,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.enabled,
    ),
    safeMode: readStoredDeepSeekSafeMode(
      config.safeMode,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.safeMode,
    ),
    cliPath: readStoredString(
      config.cliPath,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.cliPath,
    ),
    cliPathsByHost,
    loadUserSettings: readStoredBoolean(
      config.loadUserSettings,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.loadUserSettings,
    ),
    enableChrome: readStoredBoolean(
      config.enableChrome,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.enableChrome,
    ),
    enableBangBash: readStoredBoolean(
      config.enableBangBash,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.enableBangBash,
    ),
    customModels: readStoredString(
      config.customModels,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.customModels,
    ),
    defaultModel: readStoredString(
      config.defaultModel,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.defaultModel,
    ),
    lastModel: readStoredString(
      config.lastModel,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.lastModel,
    ),
    modelEnvironmentType: normalizeDeepSeekModelEnvironmentType(config.modelEnvironmentType),
    titleModelEnvironmentType: normalizeDeepSeekModelEnvironmentType(
      config.titleModelEnvironmentType,
    ),
    environmentVariables: readStoredString(
      config.environmentVariables,
      getProviderEnvironmentVariables(settings, 'deepseek')
        ?? DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.environmentVariables,
    ),
    environmentHash: readStoredString(
      config.environmentHash,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.environmentHash,
    ),
    harnessBaseUrl: readStoredString(
      config.harnessBaseUrl,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.harnessBaseUrl,
    ),
    autoLaunch: readStoredBoolean(
      config.autoLaunch,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.autoLaunch,
    ),
    dshPath: readStoredString(
      config.dshPath,
      DEFAULT_DEEPSEEK_PROVIDER_SETTINGS.dshPath,
    ),
  };
}

export function resolveDeepSeekSettingSources(
  loadUserSettings: boolean,
): DeepSeekSettingSource[] {
  return loadUserSettings
    ? ['user', 'project', 'local']
    : ['project', 'local'];
}

export function updateDeepSeekProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<DeepSeekProviderSettings>,
): DeepSeekProviderSettings {
  const current = getDeepSeekProviderSettings(settings);
  const next = {
    ...current,
    ...updates,
    safeMode: 'safeMode' in updates
      ? normalizeDeepSeekSafeMode(updates.safeMode) ?? current.safeMode
      : current.safeMode,
  };
  setProviderConfig(settings, 'deepseek', next);
  return next;
}
