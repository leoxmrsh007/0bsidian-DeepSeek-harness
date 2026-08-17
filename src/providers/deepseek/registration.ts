import { getProviderConfig } from '../../core/providers/providerConfig';
import { hasStoredConfigNormalization } from '../../core/providers/settings/storedSettings';
import type { ProviderModule } from '../../core/providers/types';
import { parseEnvironmentVariables } from '../../utils/env';
import {
  claudeWorkspaceRegistration,
} from './app/ClaudeWorkspaceServices';
import { CLAUDE_PROVIDER_CAPABILITIES } from './capabilities';
import { claudeSettingsReconciler } from './env/ClaudeSettingsReconciler';
import { HarnessExecutionBackend } from './harness/HarnessExecutionBackend';
import { ClaudeSubagentHistoryService } from './history/ClaudeSubagentHistoryService';
import { HarnessConversationHistoryService } from './history/HarnessConversationHistoryService';
import { toClaudeRuntimeModelId } from './modelSelection';
import { ClaudeTaskResultInterpreter } from './runtime/ClaudeTaskResultInterpreter';
import { getClaudeProviderSettings, updateClaudeProviderSettings } from './settings';
import { claudeSubagentAdapter } from './subagentAdapter';
import { claudeChatUIConfig } from './ui/ClaudeChatUIConfig';

const LEGACY_CLAUDE_1M_SETTINGS = ['enableOpus1M', 'enableSonnet1M'] as const;

export const deepseekProviderRegistration: ProviderModule = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  blankTabOrder: 19,
  isEnabled: settings => getClaudeProviderSettings(settings).enabled,
  setEnabled: (settings, enabled) => updateClaudeProviderSettings(settings, { enabled }),
  capabilities: CLAUDE_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^DEEPSEEK_/i, /^DSH_/i],
  chatUIConfig: claudeChatUIConfig,
  settingsReconciler: claudeSettingsReconciler,
  settingsStorage: {
    hostScopedFields: ['cliPathsByHost'],
    legacyTopLevelFields: [
      'claudeSafeMode',
      'claudeCliPath',
      'claudeCliPathsByHost',
      'loadUserClaudeSettings',
      'lastClaudeModel',
      'enableChrome',
      'enableBangBash',
      ...LEGACY_CLAUDE_1M_SETTINGS,
      'environmentVariables',
      'lastEnvHash',
      'harnessBaseUrl',
    ],
    normalizeStored(target, stored) {
      const storedConfig = getProviderConfig(stored, 'deepseek');
      const removedLegacy1MSettings = LEGACY_CLAUDE_1M_SETTINGS.some(key => key in storedConfig);
      updateClaudeProviderSettings(target, getClaudeProviderSettings(stored));
      return removedLegacy1MSettings || hasStoredConfigNormalization(
        storedConfig,
        getProviderConfig(target, 'deepseek'),
      );
    },
  },
  createExecutionBackend: (plugin) => {
    const settings = getClaudeProviderSettings(plugin.settings);
    return new HarnessExecutionBackend({
      baseUrl: settings.harnessBaseUrl,
      launchConfig: {
        autoLaunch: settings.autoLaunch,
        dshPath: settings.dshPath,
        environmentText: plugin.getActiveEnvironmentVariables('deepseek'),
      },
    });
  },
  createSubagentHistoryService: plugin => new ClaudeSubagentHistoryService(plugin),
  resolveTitleGenerationModel: (plugin) => {
    const titleModel = plugin.settings.titleGenerationModel;
    if (titleModel && claudeChatUIConfig.ownsModel(titleModel, plugin.settings)) {
      return toClaudeRuntimeModelId(titleModel);
    }
    const envVars = parseEnvironmentVariables(
      plugin.getActiveEnvironmentVariables('deepseek'),
    );
    return envVars.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'deepseek-v4-flash';
  },
  historyService: new HarnessConversationHistoryService(),
  taskResultInterpreter: new ClaudeTaskResultInterpreter(),
  subagentAdapter: claudeSubagentAdapter,
  workspace: claudeWorkspaceRegistration,
};
