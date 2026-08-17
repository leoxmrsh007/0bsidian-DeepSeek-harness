import { BUILT_IN_PROVIDER_MODULES } from '@/providers';
import { getClaudeProviderSettings } from '@/providers/deepseek/settings';
import { getBuiltInProviderDefaultConfigs } from '@/providers/defaultProviderConfigs';

function getProviderConfig(
  settings: Record<string, unknown>,
  providerId: string,
): Record<string, unknown> {
  const providerConfigs = settings.providerConfigs as Record<string, unknown>;
  return providerConfigs[providerId] as Record<string, unknown>;
}

describe('built-in ProviderModule catalog', () => {
  it('is the single ordered source for chat, workspace, and settings composition', () => {
    expect(BUILT_IN_PROVIDER_MODULES.map(module => module.id)).toEqual([
      'deepseek',
    ]);
    for (const module of BUILT_IN_PROVIDER_MODULES) {
      expect(module.workspace.initialize).toEqual(expect.any(Function));
      expect(module.settingsStorage.normalizeStored).toEqual(expect.any(Function));
    }
  });

  it('runtime-decodes malformed persisted scalar settings for every provider', () => {
    const malformedSettings: Record<string, unknown> = {
      providerConfigs: Object.fromEntries(BUILT_IN_PROVIDER_MODULES.map(module => [
        module.id,
        {
          cliPath: 7,
          enabled: 'false',
          environmentHash: false,
          environmentVariables: ['SECRET=not-a-string'],
          autoLaunch: 'false',
          harnessBaseUrl: 123,
        },
      ])),
    };
    Object.assign(getProviderConfig(malformedSettings, 'deepseek'), {
      customModels: {},
      defaultModel: {},
      enableBangBash: 1,
      enableChrome: 'true',
      lastModel: [],
      loadUserSettings: 'false',
      safeMode: 'unknown',
    });

    const defaultEnabled: Record<string, boolean> = {
      deepseek: false,
    };

    for (const module of BUILT_IN_PROVIDER_MODULES) {
      expect(module.isEnabled(malformedSettings)).toBe(defaultEnabled[module.id]);
    }
    expect(getClaudeProviderSettings(malformedSettings).safeMode).toBe('default');

    const normalizedSettings: Record<string, unknown> = {};
    for (const module of BUILT_IN_PROVIDER_MODULES) {
      expect(module.settingsStorage.normalizeStored(
        normalizedSettings,
        malformedSettings,
      )).toBe(true);
      const config = getProviderConfig(normalizedSettings, module.id);
      expect(config.enabled).toBe(defaultEnabled[module.id]);
      expect(config.cliPath).toEqual(expect.any(String));
      expect(config.environmentHash).toEqual(expect.any(String));
      expect(config.environmentVariables).toEqual(expect.any(String));
    }

    expect(getProviderConfig(normalizedSettings, 'deepseek')).toMatchObject({
      customModels: expect.any(String),
      defaultModel: expect.any(String),
      enableBangBash: false,
      enableChrome: false,
      lastModel: expect.any(String),
      loadUserSettings: true,
      safeMode: 'default',
      autoLaunch: true,
      harnessBaseUrl: expect.any(String),
    });
  });

  it('does not report canonical provider defaults as changed', () => {
    const storedSettings = {
      providerConfigs: getBuiltInProviderDefaultConfigs(),
    };
    const normalizedSettings: Record<string, unknown> = {};

    for (const module of BUILT_IN_PROVIDER_MODULES) {
      expect(module.settingsStorage.normalizeStored(
        normalizedSettings,
        storedSettings,
      )).toBe(false);
    }
  });
});
