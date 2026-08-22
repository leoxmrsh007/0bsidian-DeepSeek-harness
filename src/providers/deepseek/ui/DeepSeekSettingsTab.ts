import { execFileSync } from 'child_process';
import { Notice, Setting } from 'obsidian';

import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import { renderEnvironmentSettingsSection } from '../../../shared/settings/EnvironmentSettingsSection';
import { renderProviderEnablementSetting } from '../../../shared/settings/ProviderEnablementSetting';
import { renderLastEnabledProviderWarning } from '../../../shared/settings/ProviderModelEnablementWarning';
import { findNodeExecutable, getEnhancedPath } from '../../../utils/env';
import {
  HarnessAppLauncher,
  type HarnessFailureReason,
  type HarnessLaunchConfig,
} from '../harness/HarnessAppLauncher';
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
      .setDesc('Loopback-only HTTP endpoint of the DeepSeek Harness desktop app (dsh web). Remote endpoints are blocked.')
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

    new Setting(container)
      .setName('DeepSeek Harness binary path')
      .setDesc('Optional explicit path to the `dsh` executable. Leave empty to resolve via PATH.')
      .addText((text) => {
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case -- binary command placeholder
          .setPlaceholder('dsh')
          .setValue(getDeepSeekProviderSettings(settingsBag).dshPath)
          .onChange(async (value) => {
            await context.plugin.applyProviderRuntimeSettings(
              ['deepseek'],
              (settings) => {
                updateDeepSeekProviderSettings(settings, { dshPath: value.trim() });
              },
            );
          });
      });

    // --- Harness status ---

    const harnessBaseUrl = () => getDeepSeekProviderSettings(settingsBag).harnessBaseUrl;
    const harnessLaunchConfig = (): HarnessLaunchConfig => {
      const settings = getDeepSeekProviderSettings(settingsBag);
      return {
        autoLaunch: settings.autoLaunch,
        dshPath: settings.dshPath,
        safeMode: settings.safeMode,
        environmentText: context.plugin.getActiveEnvironmentVariables('deepseek'),
      };
    };

    const statusSetting = new Setting(container)
      .setName(t('settings.deepseekHarness.status'))
      .setDesc('');

    const detectNodeInfo = (): { path: string; version: string } | null => {
      const nodePath = findNodeExecutable(getEnhancedPath());
      if (!nodePath) {
        return null;
      }
      try {
        const version = execFileSync(nodePath, ['--version'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
        }).trim();
        return { path: nodePath, version };
      } catch {
        return null;
      }
    };

    const renderHarnessStatus = (): void => {
      const status = HarnessAppLauncher.get().getStatus();
      let text: string;
      switch (status.kind) {
        case 'online':
          text = t('settings.deepseekHarness.online');
          break;
        case 'starting':
          text = t('settings.deepseekHarness.starting');
          break;
        case 'offline':
          text = t('settings.deepseekHarness.offline');
          break;
        case 'failed': {
          const reasonText: Record<HarnessFailureReason, string> = {
            'dsh-not-found': t('settings.deepseekHarness.notFound'),
            'spawn-failed': t('settings.deepseekHarness.spawnFailed'),
            'exited-early': t('settings.deepseekHarness.exitedEarly'),
            timeout: t('settings.deepseekHarness.timeout'),
          };
          text = reasonText[status.reason];
          if (status.detail) {
            text += `\n${status.detail}`;
          }
          break;
        }
      }

      const nodeInfo = detectNodeInfo();
      text += nodeInfo
        ? `\n${t('settings.deepseekHarness.nodeFound', { version: nodeInfo.version, path: nodeInfo.path })}`
        : `\n${t('settings.deepseekHarness.nodeNotFound')}`;
      statusSetting.descEl.setText(text);
    };
    renderHarnessStatus();

    new Setting(container)
      .setDesc(t('settings.deepseekHarness.statusDesc'))
      .addButton((button) => button
        .setButtonText(t('settings.deepseekHarness.check'))
        .onClick(async () => {
          const url = harnessBaseUrl();
          const ok = await HarnessAppLauncher.get().ensureRunning(url, harnessLaunchConfig());
          new Notice(ok
            ? t('settings.deepseekHarness.connectOk', { url })
            : t('settings.deepseekHarness.connectFailed', { url }));
          renderHarnessStatus();
        }))
      .addButton((button) => button
        .setButtonText(t('settings.deepseekHarness.restart'))
        .onClick(async () => {
          const url = harnessBaseUrl();
          const ok = await HarnessAppLauncher.get().restart(url, harnessLaunchConfig());
          new Notice(ok
            ? t('settings.deepseekHarness.connectOk', { url })
            : t('settings.deepseekHarness.connectFailed', { url }));
          renderHarnessStatus();
        }));

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
