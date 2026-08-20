import { getProviderConfig } from '../../core/providers/providerConfig';
import { hasStoredConfigNormalization } from '../../core/providers/settings/storedSettings';
import type { ProviderModule } from '../../core/providers/types';
import { parseEnvironmentVariables } from '../../utils/env';
import {
  deepseekWorkspaceRegistration,
} from './app/DeepSeekWorkspaceServices';
import { DEEPSEEK_PROVIDER_CAPABILITIES } from './capabilities';
import { deepseekSettingsReconciler } from './env/DeepSeekSettingsReconciler';
import { HarnessExecutionBackend } from './harness/HarnessExecutionBackend';
import { DeepSeekSubagentHistoryService } from './history/DeepSeekSubagentHistoryService';
import { HarnessConversationHistoryService } from './history/HarnessConversationHistoryService';
import { toDeepSeekRuntimeModelId } from './modelSelection';
import { DeepSeekTaskResultInterpreter } from './runtime/DeepSeekTaskResultInterpreter';
import { getDeepSeekProviderSettings, updateDeepSeekProviderSettings } from './settings';
import { deepseekSubagentAdapter } from './subagentAdapter';
import { deepseekChatUIConfig } from './ui/DeepSeekChatUIConfig';

export const deepseekProviderRegistration: ProviderModule = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  blankTabOrder: 19,
  isEnabled: settings => getDeepSeekProviderSettings(settings).enabled,
  setEnabled: (settings, enabled) => updateDeepSeekProviderSettings(settings, { enabled }),
  capabilities: DEEPSEEK_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^DEEPSEEK_/i, /^DSH_/i],
  chatUIConfig: deepseekChatUIConfig,
  settingsReconciler: deepseekSettingsReconciler,
  settingsStorage: {
    hostScopedFields: ['cliPathsByHost'],
    legacyTopLevelFields: [],
    normalizeStored(target, stored) {
      const storedConfig = getProviderConfig(stored, 'deepseek');
      updateDeepSeekProviderSettings(target, getDeepSeekProviderSettings(stored));
      return hasStoredConfigNormalization(
        storedConfig,
        getProviderConfig(target, 'deepseek'),
      );
    },
  },
  createExecutionBackend: (plugin) => {
    const settings = getDeepSeekProviderSettings(plugin.settings);
    return new HarnessExecutionBackend({
      baseUrl: settings.harnessBaseUrl,
      launchConfig: {
        autoLaunch: settings.autoLaunch,
        dshPath: settings.dshPath,
        safeMode: settings.safeMode,
        environmentText: plugin.getActiveEnvironmentVariables('deepseek'),
      },
    });
  },
  createSubagentHistoryService: plugin => new DeepSeekSubagentHistoryService(plugin),
  resolveTitleGenerationModel: (plugin) => {
    const titleModel = plugin.settings.titleGenerationModel;
    if (titleModel && deepseekChatUIConfig.ownsModel(titleModel, plugin.settings)) {
      return toDeepSeekRuntimeModelId(titleModel);
    }
    const envVars = parseEnvironmentVariables(
      plugin.getActiveEnvironmentVariables('deepseek'),
    );
    return envVars.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'deepseek-v4-flash';
  },
  historyService: new HarnessConversationHistoryService(),
  taskResultInterpreter: new DeepSeekTaskResultInterpreter(),
  subagentAdapter: deepseekSubagentAdapter,
  workspace: deepseekWorkspaceRegistration,
};
