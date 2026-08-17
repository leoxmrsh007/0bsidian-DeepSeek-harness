import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';

describe('ProviderSettingsCoordinator', () => {
  describe('normalizeProviderSelection', () => {
    it('falls back to claude for unknown providers', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mystery-provider',
        providerConfigs: {},
      };

      const changed = ProviderSettingsCoordinator.normalizeProviderSelection(settings);

      expect(changed).toBe(true);
      expect(settings.settingsProvider).toBe('claude');
    });

    it('returns false when already normalized (no-op)', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'claude',
        providerConfigs: {
          claude: { enabled: true },
        },
      };
      expect(ProviderSettingsCoordinator.normalizeProviderSelection(settings)).toBe(false);
    });
  });

  describe('applyProviderEnablement', () => {
    it('preflights the sole enabled provider without mutating settings', () => {
      const settings: Record<string, unknown> = {
        providerConfigs: {
          claude: { enabled: true },
          deepseek: { enabled: false },
        },
      };

      expect(ProviderSettingsCoordinator.canApplyProviderEnablement(
        settings,
        'claude',
        false,
      )).toBe(false);
      expect(ProviderSettingsCoordinator.canApplyProviderEnablement(
        settings,
        'claude',
        true,
      )).toBe(true);
      expect(ProviderRegistry.isEnabled('claude', settings)).toBe(true);
    });

    it('keeps the sole enabled provider enabled', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'claude',
        model: 'sonnet',
        titleGenerationModel: '',
        providerConfigs: {
          claude: { enabled: true },
          deepseek: { enabled: false },
        },
      };

      const accepted = ProviderSettingsCoordinator.applyProviderEnablement(
        settings,
        'claude',
        false,
      );

      expect(accepted).toBe(false);
      expect(ProviderRegistry.isEnabled('claude', settings)).toBe(true);
      expect(settings.settingsProvider).toBe('claude');
    });
  });

  describe('projectActiveProviderState', () => {
    it('does not overwrite when no saved values exist', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'claude',
        model: 'sonnet',
        effortLevel: 'high',
        serviceTier: 'default',
        thinkingBudget: 'off',
        savedProviderModel: {},
        savedProviderEffort: {},
        savedProviderServiceTier: {},
        savedProviderThinkingBudget: {},
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('sonnet');
      expect(settings.effortLevel).toBe('high');
    });

    it('projects the saved provider model onto the active selection', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'claude',
        model: 'sonnet',
        effortLevel: 'low',
        serviceTier: 'default',
        thinkingBudget: '500',
        savedProviderModel: { claude: 'opus' },
        savedProviderEffort: { claude: 'high' },
        savedProviderServiceTier: { claude: 'default' },
        savedProviderThinkingBudget: { claude: 'off' },
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('opus');
      expect(settings.effortLevel).toBe('high');
    });
  });
});
