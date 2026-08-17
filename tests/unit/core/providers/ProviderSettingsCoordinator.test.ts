import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import { DEFAULT_DEEPSEEK_PROVIDER_SETTINGS } from '@/providers/deepseek/settings';

describe('ProviderSettingsCoordinator', () => {
  describe('normalizeProviderSelection', () => {
    it('falls back to deepseek for unknown providers', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mystery-provider',
        providerConfigs: {},
      };

      const changed = ProviderSettingsCoordinator.normalizeProviderSelection(settings);

      expect(changed).toBe(true);
      expect(settings.settingsProvider).toBe('deepseek');
    });

    it('returns false when already normalized (no-op)', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'deepseek',
        providerConfigs: {
          deepseek: { enabled: true },
        },
      };
      expect(ProviderSettingsCoordinator.normalizeProviderSelection(settings)).toBe(false);
    });
  });

  describe('applyProviderEnablement', () => {
    it('preflights the sole enabled provider without mutating settings', () => {
      const settings: Record<string, unknown> = {
        providerConfigs: {
          deepseek: { ...DEFAULT_DEEPSEEK_PROVIDER_SETTINGS, enabled: true },
        },
      };

      expect(ProviderSettingsCoordinator.canApplyProviderEnablement(
        settings,
        'deepseek',
        false,
      )).toBe(false);
      expect(ProviderSettingsCoordinator.canApplyProviderEnablement(
        settings,
        'deepseek',
        true,
      )).toBe(true);
      expect(ProviderRegistry.isEnabled('deepseek', settings)).toBe(true);
    });

    it('keeps the sole enabled provider enabled', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'deepseek',
        model: 'deepseek-v4-flash',
        titleGenerationModel: '',
        providerConfigs: {
          deepseek: { ...DEFAULT_DEEPSEEK_PROVIDER_SETTINGS, enabled: true },
        },
      };

      const accepted = ProviderSettingsCoordinator.applyProviderEnablement(
        settings,
        'deepseek',
        false,
      );

      expect(accepted).toBe(false);
      expect(ProviderRegistry.isEnabled('deepseek', settings)).toBe(true);
      expect(ProviderRegistry.getEnabledProviderIds(settings)).toEqual(['deepseek']);
      expect(settings.settingsProvider).toBe('deepseek');
    });
  });

  describe('projectActiveProviderState', () => {
    it('does not overwrite when no saved values exist', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'deepseek',
        model: 'deepseek-v4-flash',
        effortLevel: 'high',
        serviceTier: 'default',
        thinkingBudget: 'off',
        savedProviderModel: {},
        savedProviderEffort: {},
        savedProviderServiceTier: {},
        savedProviderThinkingBudget: {},
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('deepseek-v4-flash');
      expect(settings.effortLevel).toBe('high');
      expect(settings.thinkingBudget).toBe('off');
    });

    it('handles missing saved maps gracefully', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'deepseek',
        model: 'deepseek-v4-flash',
        effortLevel: 'high',
        serviceTier: 'default',
        thinkingBudget: 'off',
      };

      // Should not throw
      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('deepseek-v4-flash');
    });

    it('projects the saved provider model onto the active selection', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'deepseek',
        model: 'deepseek-v4-flash',
        effortLevel: 'low',
        serviceTier: 'default',
        thinkingBudget: '500',
        savedProviderModel: { deepseek: 'deepseek-v4-pro' },
        savedProviderEffort: { deepseek: 'high' },
        savedProviderServiceTier: { deepseek: 'default' },
        savedProviderThinkingBudget: { deepseek: 'off' },
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('deepseek-v4-pro');
      expect(settings.effortLevel).toBe('high');
    });
  });
});
