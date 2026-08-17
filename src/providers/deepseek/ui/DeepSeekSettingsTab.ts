import { Setting } from 'obsidian';

import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import { renderEnvironmentSettingsSection } from '../../../shared/settings/EnvironmentSettingsSection';
import { renderProviderEnablementSetting } from '../../../shared/settings/ProviderEnablementSetting';
import { renderLastEnabledProviderWarning } from '../../../shared/settings/ProviderModelEnablementWarning';
import {
  getDeepSeekProviderSettings,
  updateDeepSeekProviderSettings,
} from '../settings';

export const deepseekSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;

    // --- Setup ---

    new Setting(container).setName(t('settings.setup')).setHeading();

    renderProviderEnablementSetting({
      container,
      description: t('settings.providerEnablement.desc', { provider: 'DeepSeek' }),
      getValue: () => getDeepSeekProviderSettings(settingsBag).enabled,
      name: t('settings.providerEnablement.name', { provider: 'DeepSeek' }),
      onChange: async (value) => {
        if (!ProviderSettingsCoordinator.canApplyProviderEnablement(
          settingsBag,
          'deepseek',
          value,
        )) {
          lastProviderWarning.showFor();
          return;
        }

        let accepted = true;
        await context.plugin.runProviderExecutionTransition(['deepseek'], async () => {
          await context.plugin.mutateSettings((settings) => {
            accepted = ProviderSettingsCoordinator.applyProviderEnablement(
              settings,
              'deepseek',
              value,
            );
          });
        });
        if (accepted) {
          lastProviderWarning.hide();
        } else {
          lastProviderWarning.showFor();
        }
        context.notifyProviderModelOptionsChanged('deepseek');
      },
    });

    const lastProviderWarning = renderLastEnabledProviderWarning(container);

    new Setting(container)
      .setName('DeepSeek Harness URL')
      .setDesc('Local HTTP endpoint of the DeepSeek Harness desktop app (dsh web).')
      .addText((text) => {
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case -- URL placeholder
          .setPlaceholder('http://127.0.0.1:3080')
          .setValue(getDeepSeekProviderSettings(settingsBag).harnessBaseUrl)
          .onChange(async (value) => {
            const trimmed = value.trim();
            await context.plugin.applyProviderRuntimeSettings(
              ['deepseek'],
              (settings) => {
                updateDeepSeekProviderSettings(settings, {
                  harnessBaseUrl: trimmed || 'http://127.0.0.1:3080',
                });
              },
            );
          });
      });

    new Setting(container)
      .setName('Auto-launch harness')
      .setDesc('Start `dsh web` automatically when the harness is not reachable.')
      .addToggle((toggle) => {
        toggle
          .setValue(getDeepSeekProviderSettings(settingsBag).autoLaunch)
          .onChange(async (value) => {
            await context.plugin.applyProviderRuntimeSettings(
              ['deepseek'],
              (settings) => {
                updateDeepSeekProviderSettings(settings, { autoLaunch: value });
              },
            );
          });
      });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:deepseek',
      heading: t('settings.environment'),
      name: t('settings.customVariables.name'),
      desc: 'The DeepSeek Harness desktop app owns the API key and model route. Keep this empty unless you need to pass extra environment variables to the harness process.',
      placeholder: 'DSH_SESSION_ROOT=/path/to/sessions\nDSH_MAX_TOKENS_AS_SUCCESS=true',
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'deepseek'),
    });
  },
};
