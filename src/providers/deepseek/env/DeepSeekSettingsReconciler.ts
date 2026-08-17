import {
  type CliPathFingerprintInputs,
  createCliPathFingerprintInputs,
  hasCliPathFingerprintInputs,
} from '../../../core/providers/cli/CliPathFingerprintInputs';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import {
  createRuntimeInputFingerprint,
  isVersionedRuntimeInputFingerprint,
} from '../../../core/providers/settings/RuntimeInputFingerprint';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { getHostnameKey, parseEnvironmentVariables } from '../../../utils/env';
import {
  findDeepSeekModelOptionForEnvironmentType,
  getDeepSeekModelOptions,
  resolveDeepSeekModelEnvironmentTypePreference,
  resolveDeepSeekModelSelection,
} from '../modelOptions';
import { toDeepSeekRuntimeModelId } from '../modelSelection';
import { isDeepSeekModelTier } from '../modelTiers';
import { getDeepSeekProviderSettings, updateDeepSeekProviderSettings } from '../settings';
import { normalizeLegacyDeepSeekModelAlias } from '../types/models';
import { clearDeepSeekResumeState } from '../types/providerState';
import { deepseekChatUIConfig } from '../ui/DeepSeekChatUIConfig';
import {
  DEEPSEEK_MODEL_ENV_KEYS,
  type DeepSeekModelEnvType,
  getModelsFromEnvironment,
} from './deepseekModelEnv';

const ENV_HASH_PROVIDER_KEYS = ['ANTHROPIC_BASE_URL', 'PATH'];
const ALL_FINGERPRINT_ENV_KEYS = [...DEEPSEEK_MODEL_ENV_KEYS, ...ENV_HASH_PROVIDER_KEYS];

function getConfiguredCliPathInputs(
  settings: Record<string, unknown>,
): CliPathFingerprintInputs {
  const claudeSettings = getDeepSeekProviderSettings(settings);
  return createCliPathFingerprintInputs(
    claudeSettings.cliPathsByHost[getHostnameKey()],
    claudeSettings.cliPath,
  );
}

function computeRuntimeFingerprint(
  settings: Record<string, unknown>,
  environmentText: string = getRuntimeEnvironmentText(settings, 'deepseek'),
): string {
  return createRuntimeInputFingerprint({
    additionalInputs: getConfiguredCliPathInputs(settings),
    environmentKeys: ALL_FINGERPRINT_ENV_KEYS,
    environmentText,
  });
}

function hasFingerprintInputs(settings: Record<string, unknown>, environmentText: string): boolean {
  if (hasCliPathFingerprintInputs(getConfiguredCliPathInputs(settings))) {
    return true;
  }

  const environment = parseEnvironmentVariables(environmentText);
  return ALL_FINGERPRINT_ENV_KEYS
    .some(key => Object.prototype.hasOwnProperty.call(environment, key));
}

function isCurrentLegacyFingerprint(
  settings: Record<string, unknown>,
  environmentText: string,
  savedFingerprint: string,
): boolean {
  if (
    !savedFingerprint
    || isVersionedRuntimeInputFingerprint(savedFingerprint)
    || hasCliPathFingerprintInputs(getConfiguredCliPathInputs(settings))
  ) {
    return false;
  }

  const environment = parseEnvironmentVariables(environmentText);
  const legacyFingerprint = ALL_FINGERPRINT_ENV_KEYS
    .filter(key => environment[key])
    .map(key => `${key}=${environment[key]}`)
    .sort()
    .join('|');
  return savedFingerprint === legacyFingerprint;
}

function getModelEnvironmentFromHash(environmentHash: string): Record<string, string> {
  if (isVersionedRuntimeInputFingerprint(environmentHash)) {
    return {};
  }

  const envVars: Record<string, string> = {};
  for (const key of DEEPSEEK_MODEL_ENV_KEYS) {
    const match = environmentHash.match(new RegExp(`(?:^|\\|)${key}=([^|]*)`));
    if (match?.[1]) {
      envVars[key] = match[1];
    }
  }
  return envVars;
}

function inferPreviousModelEnvironmentType(
  environmentHash: string,
  currentModel: string,
  lastModel: string = '',
): DeepSeekModelEnvType | undefined {
  const runtimeModel = toDeepSeekRuntimeModelId(currentModel);
  const previousOption = getModelsFromEnvironment(
    getModelEnvironmentFromHash(environmentHash),
  ).find(option => option.value === runtimeModel);
  if (!previousOption) {
    return undefined;
  }

  const normalizedLastModel = normalizeLegacyDeepSeekModelAlias(toDeepSeekRuntimeModelId(lastModel));
  if (
    isDeepSeekModelTier(normalizedLastModel)
    && previousOption.environmentTypes.includes(normalizedLastModel)
  ) {
    return normalizedLastModel;
  }

  return previousOption.environmentTypes[0];
}

function invalidateDeepSeekConversationSessions(conversations: Conversation[]): Conversation[] {
  return conversations.filter(conv => (
    conv.providerId === 'deepseek' && clearDeepSeekResumeState(conv)
  ));
}

export const deepseekSettingsReconciler: ProviderSettingsReconciler = {
  invalidateConversationSessions: invalidateDeepSeekConversationSessions,

  reconcileModelWithEnvironment(
    settings: Record<string, unknown>,
    conversations: Conversation[],
  ): { changed: boolean; invalidatedConversations: Conversation[] } {
    const envText = getRuntimeEnvironmentText(settings, 'deepseek');
    const currentHash = computeRuntimeFingerprint(settings, envText);
    const savedHash = getDeepSeekProviderSettings(settings).environmentHash;

    if (!savedHash && !hasFingerprintInputs(settings, envText)) {
      return { changed: false, invalidatedConversations: [] };
    }
    if (isCurrentLegacyFingerprint(settings, envText, savedHash)) {
      return { changed: false, invalidatedConversations: [] };
    }
    if (currentHash === savedHash) {
      return { changed: false, invalidatedConversations: [] };
    }

    const invalidatedConversations = invalidateDeepSeekConversationSessions(conversations);

    const currentModel = typeof settings.model === 'string' ? settings.model : '';
    const claudeSettings = getDeepSeekProviderSettings(settings);
    const modelOptions = getDeepSeekModelOptions(settings);
    const savedProviderModel = settings.savedProviderModel as Record<string, unknown> | undefined;
    const historicalModel = settings.settingsProvider !== 'deepseek'
      && typeof savedProviderModel?.claude === 'string'
      ? savedProviderModel.claude
      : currentModel;
    const previousEnvironmentType = claudeSettings.modelEnvironmentType
      || inferPreviousModelEnvironmentType(
        savedHash,
        historicalModel,
        claudeSettings.lastModel,
      );
    const nextModel = resolveDeepSeekModelSelection(
      settings,
      currentModel,
      previousEnvironmentType,
    );
    if (nextModel) {
      settings.model = nextModel;
    }

    const derivedEnvironmentType = nextModel
      ? resolveDeepSeekModelEnvironmentTypePreference(
        modelOptions,
        nextModel,
        previousEnvironmentType ?? '',
      )
      : null;
    const selectedEnvironmentType = previousEnvironmentType ?? derivedEnvironmentType;
    const selectedTier = selectedEnvironmentType && isDeepSeekModelTier(selectedEnvironmentType)
      ? selectedEnvironmentType
      : undefined;

    const titleModel = typeof settings.titleGenerationModel === 'string'
      ? settings.titleGenerationModel
      : '';
    const previousTitleEnvironmentType = claudeSettings.titleModelEnvironmentType
      || (titleModel
        ? inferPreviousModelEnvironmentType(savedHash, titleModel)
        : undefined);
    if (previousTitleEnvironmentType) {
      const titleOption = findDeepSeekModelOptionForEnvironmentType(
        modelOptions,
        previousTitleEnvironmentType,
      );
      if (titleOption) {
        settings.titleGenerationModel = titleOption.value;
      }
    }
    const derivedTitleEnvironmentType = titleModel
      ? resolveDeepSeekModelEnvironmentTypePreference(
        modelOptions,
        titleModel,
        previousTitleEnvironmentType ?? '',
      )
      : null;
    const selectedTitleEnvironmentType = previousTitleEnvironmentType
      ?? derivedTitleEnvironmentType;

    updateDeepSeekProviderSettings(settings, {
      environmentHash: currentHash,
      modelEnvironmentType: selectedEnvironmentType ?? '',
      titleModelEnvironmentType: selectedTitleEnvironmentType ?? '',
      ...(selectedTier ? { lastModel: selectedTier } : {}),
    });
    return { changed: true, invalidatedConversations };
  },

  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    let changed = false;

    const normalize = (model: string): string => deepseekChatUIConfig.normalizeModelVariant(model, settings);
    const claudeSettings = getDeepSeekProviderSettings(settings);
    const modelOptions = getDeepSeekModelOptions(settings);
    const environmentText = getRuntimeEnvironmentText(settings, 'deepseek');
    const shouldMigrateLegacyFingerprint = isCurrentLegacyFingerprint(
      settings,
      environmentText,
      claudeSettings.environmentHash,
    );
    const environmentChanged = (
      Boolean(claudeSettings.environmentHash)
      || hasFingerprintInputs(settings, environmentText)
    )
      && !shouldMigrateLegacyFingerprint
      && computeRuntimeFingerprint(settings, environmentText) !== claudeSettings.environmentHash;
    const hasEnvironmentModelOptions = modelOptions.some(option => option.environmentTypes);

    const model = settings.model as string;
    const shouldInferPrimaryEnvironmentType = settings.settingsProvider === undefined
      || settings.settingsProvider === 'deepseek';
    const historicalModelEnvironmentType = environmentChanged
      ? inferPreviousModelEnvironmentType(
        claudeSettings.environmentHash,
        model,
        claudeSettings.lastModel,
      )
      : undefined;
    const modelEnvironmentType = claudeSettings.modelEnvironmentType
      || (shouldInferPrimaryEnvironmentType
        ? historicalModelEnvironmentType
          || (hasEnvironmentModelOptions
            ? resolveDeepSeekModelEnvironmentTypePreference(modelOptions, model)
            : null)
        : null);
    const normalizedModel = (
      modelEnvironmentType
        ? findDeepSeekModelOptionForEnvironmentType(modelOptions, modelEnvironmentType)?.value
        : undefined
    ) ?? normalize(model);
    if (model !== normalizedModel) {
      settings.model = normalizedModel;
      changed = true;
    }

    const titleModel = typeof settings.titleGenerationModel === 'string'
      ? settings.titleGenerationModel
      : '';
    const historicalTitleModelEnvironmentType = environmentChanged && titleModel
      ? inferPreviousModelEnvironmentType(claudeSettings.environmentHash, titleModel)
      : undefined;
    const titleModelEnvironmentType = claudeSettings.titleModelEnvironmentType
      || (titleModel
        ? historicalTitleModelEnvironmentType
          || (hasEnvironmentModelOptions
            ? resolveDeepSeekModelEnvironmentTypePreference(modelOptions, titleModel)
            : null)
        : null);
    const normalizedTitleModel = (
      titleModelEnvironmentType
        ? findDeepSeekModelOptionForEnvironmentType(
          modelOptions,
          titleModelEnvironmentType,
        )?.value
        : undefined
    ) ?? (titleModel ? normalize(titleModel) : '');
    if (titleModel !== normalizedTitleModel) {
      settings.titleGenerationModel = normalizedTitleModel;
      changed = true;
    }

    const lastClaudeModel = claudeSettings.lastModel;
    if (lastClaudeModel) {
      const normalizedLastDeepSeekModel = normalizeLegacyDeepSeekModelAlias(
        toDeepSeekRuntimeModelId(lastClaudeModel),
      );
      if (lastClaudeModel !== normalizedLastDeepSeekModel) {
        updateDeepSeekProviderSettings(settings, { lastModel: normalizedLastDeepSeekModel });
        changed = true;
      }
    }

    if (
      claudeSettings.modelEnvironmentType !== (modelEnvironmentType ?? '')
      || claudeSettings.titleModelEnvironmentType !== (titleModelEnvironmentType ?? '')
      || shouldMigrateLegacyFingerprint
    ) {
      updateDeepSeekProviderSettings(settings, {
        ...(shouldMigrateLegacyFingerprint
          ? { environmentHash: computeRuntimeFingerprint(settings, environmentText) }
          : {}),
        modelEnvironmentType: modelEnvironmentType ?? '',
        titleModelEnvironmentType: titleModelEnvironmentType ?? '',
      });
      changed = true;
    }

    return changed;
  },
};
