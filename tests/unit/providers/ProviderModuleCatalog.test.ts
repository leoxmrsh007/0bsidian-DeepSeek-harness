import { BUILT_IN_PROVIDER_MODULES } from '@/providers';
import {
  getDeepSeekProviderSettings,
  normalizeHarnessBaseUrl,
} from '@/providers/deepseek/settings';
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
      'claude',
      'codex',
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
        },
      ])),
    };
    Object.assign(getProviderConfig(malformedSettings, 'deepseek'), {
      autoLaunch: 'false',
      harnessBaseUrl: 123,
      safeMode: 'unknown',
    });

    const defaultEnabled: Record<string, boolean> = {
      claude: true,
      codex: false,
      deepseek: false,
    };

    for (const module of BUILT_IN_PROVIDER_MODULES) {
      expect(module.isEnabled(malformedSettings)).toBe(defaultEnabled[module.id]);
    }
    expect(getDeepSeekProviderSettings(malformedSettings).safeMode).toBe('default');

    const normalizedSettings: Record<string, unknown> = {};
    for (const module of BUILT_IN_PROVIDER_MODULES) {
      expect(module.settingsStorage.normalizeStored(
        normalizedSettings,
        malformedSettings,
      )).toBe(true);
      const config = getProviderConfig(normalizedSettings, module.id);
      expect(config.enabled).toBe(defaultEnabled[module.id]);
      expect(config.environmentHash).toEqual(expect.any(String));
      expect(config.environmentVariables).toEqual(expect.any(String));
    }

    expect(getProviderConfig(normalizedSettings, 'deepseek')).toMatchObject({
      autoLaunch: true,
      harnessBaseUrl: expect.any(String),
      safeMode: 'default',
    });
  });

  it('accepts only loopback DeepSeek Harness endpoints', () => {
    expect(normalizeHarnessBaseUrl('http://127.0.0.1:3080')).toBe('http://127.0.0.1:3080');
    expect(normalizeHarnessBaseUrl('http://localhost:3080/')).toBe('http://localhost:3080');
    expect(normalizeHarnessBaseUrl('https://example.com')).toBe('http://127.0.0.1:3080');
    expect(normalizeHarnessBaseUrl('http://192.168.1.10:3080')).toBe('http://127.0.0.1:3080');
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
