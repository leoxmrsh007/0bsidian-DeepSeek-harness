import { getRuntimeEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { ProviderUIOption } from '../../core/providers/types';
import {
  type DeepSeekModelEnvType,
  getModelsFromEnvironment,
} from './env/deepseekModelEnv';
import { formatCustomModelLabel } from './modelLabels';
import { encodeDeepSeekModelSelectionId, toDeepSeekRuntimeModelId } from './modelSelection';
import { isDeepSeekModelTier } from './modelTiers';
import { getDeepSeekProviderSettings } from './settings';
import { DEFAULT_DEEPSEEK_MODELS, normalizeLegacyDeepSeekModelAlias } from './types/models';

export interface DeepSeekModelOption extends ProviderUIOption {
  environmentTypes?: readonly DeepSeekModelEnvType[];
}

function parseConfiguredCustomModelIds(value: string): string[] {
  const modelIds: string[] = [];
  const seen = new Set<string>();

  for (const line of value.split(/\r?\n/)) {
    const modelId = line.trim();
    if (!modelId || seen.has(modelId)) {
      continue;
    }
    seen.add(modelId);
    modelIds.push(modelId);
  }

  return modelIds;
}

function normalizeCustomModelAliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const aliases: Record<string, string> = {};
  for (const [rawModelId, rawAlias] of Object.entries(value)) {
    if (typeof rawAlias !== 'string') {
      continue;
    }

    const modelId = rawModelId.trim();
    const alias = rawAlias.trim();
    if (modelId && alias) {
      aliases[modelId] = alias;
    }
  }

  return aliases;
}

export function getDeepSeekModelOptions(settings: Record<string, unknown>): DeepSeekModelOption[] {
  const customModelAliases = normalizeCustomModelAliases(settings.customModelAliases);
  const customModels = getModelsFromEnvironment(
    getRuntimeEnvironmentVariables(settings, 'deepseek'),
    customModelAliases,
  );
  if (customModels.length > 0) {
    return customModels.map((model) => ({
      ...model,
      value: encodeDeepSeekModelSelectionId(model.value),
    }));
  }

  const claudeSettings = getDeepSeekProviderSettings(settings);
  const models = [...DEFAULT_DEEPSEEK_MODELS];

  const seenModelIds = new Set(models.map(model =>
    normalizeLegacyDeepSeekModelAlias(toDeepSeekRuntimeModelId(model.value))
  ));
  for (const configuredModelId of parseConfiguredCustomModelIds(claudeSettings.customModels)) {
    const modelId = toDeepSeekRuntimeModelId(configuredModelId);
    const normalizedModelId = normalizeLegacyDeepSeekModelAlias(modelId);
    if (seenModelIds.has(normalizedModelId)) {
      continue;
    }

    seenModelIds.add(normalizedModelId);
    models.push({
      value: encodeDeepSeekModelSelectionId(modelId),
      label: customModelAliases[modelId] ?? formatCustomModelLabel(modelId),
      description: 'Custom model',
    });
  }

  return models;
}

export function findDeepSeekModelOption(
  modelOptions: readonly DeepSeekModelOption[],
  model: string,
): DeepSeekModelOption | undefined {
  const runtimeModel = toDeepSeekRuntimeModelId(model);
  const exactOption = modelOptions.find(option =>
    option.value === model || toDeepSeekRuntimeModelId(option.value) === runtimeModel
  );
  if (exactOption) {
    return exactOption;
  }

  const normalizedRuntimeModel = normalizeLegacyDeepSeekModelAlias(toDeepSeekRuntimeModelId(model));
  if (isDeepSeekModelTier(normalizedRuntimeModel)) {
    const tierOption = modelOptions.find(option =>
      option.environmentTypes?.includes(normalizedRuntimeModel)
    );
    if (tierOption) {
      return tierOption;
    }
  }

  return modelOptions.find(option =>
    normalizeLegacyDeepSeekModelAlias(toDeepSeekRuntimeModelId(option.value)) === normalizedRuntimeModel
  );
}

export function findDeepSeekModelOptionForEnvironmentType(
  modelOptions: readonly DeepSeekModelOption[],
  environmentType: DeepSeekModelEnvType,
): DeepSeekModelOption | undefined {
  const environmentOption = modelOptions.find(option =>
    option.environmentTypes?.includes(environmentType)
  );
  if (environmentOption || environmentType === 'model') {
    return environmentOption;
  }

  return modelOptions.find(option =>
    !option.environmentTypes
    && normalizeLegacyDeepSeekModelAlias(toDeepSeekRuntimeModelId(option.value)) === environmentType
  );
}

export function resolveDeepSeekModelEnvironmentTypePreference(
  modelOptions: readonly DeepSeekModelOption[],
  model: string,
  previousEnvironmentType: DeepSeekModelEnvType | '' = '',
): DeepSeekModelEnvType | null {
  const exactEnvironmentTypes = modelOptions.find(option => option.value === model)
    ?.environmentTypes;
  if (exactEnvironmentTypes) {
    if (
      previousEnvironmentType
      && exactEnvironmentTypes.includes(previousEnvironmentType)
    ) {
      return previousEnvironmentType;
    }
    return exactEnvironmentTypes.length === 1 ? exactEnvironmentTypes[0] : null;
  }

  const runtimeModel = toDeepSeekRuntimeModelId(model);
  const runtimeEnvironmentTypes = modelOptions.find(option =>
    toDeepSeekRuntimeModelId(option.value) === runtimeModel
  )?.environmentTypes;
  if (runtimeEnvironmentTypes) {
    if (
      previousEnvironmentType
      && runtimeEnvironmentTypes.includes(previousEnvironmentType)
    ) {
      return previousEnvironmentType;
    }
    return runtimeEnvironmentTypes.length === 1 ? runtimeEnvironmentTypes[0] : null;
  }

  const normalizedModel = normalizeLegacyDeepSeekModelAlias(runtimeModel);
  if (isDeepSeekModelTier(normalizedModel)) {
    return normalizedModel;
  }

  const environmentTypes = findDeepSeekModelOption(modelOptions, model)?.environmentTypes;
  if (!environmentTypes) {
    return null;
  }

  if (
    previousEnvironmentType
    && environmentTypes.includes(previousEnvironmentType)
  ) {
    return previousEnvironmentType;
  }

  return environmentTypes.length === 1 ? environmentTypes[0] : null;
}

export function resolveDeepSeekModelSelection(
  settings: Record<string, unknown>,
  currentModel: string,
  preferredEnvironmentType?: DeepSeekModelEnvType,
): string | null {
  const modelOptions = getDeepSeekModelOptions(settings);
  if (preferredEnvironmentType) {
    const preferredOption = findDeepSeekModelOptionForEnvironmentType(
      modelOptions,
      preferredEnvironmentType,
    );
    if (preferredOption) {
      return preferredOption.value;
    }
  }

  if (currentModel) {
    const currentOption = findDeepSeekModelOption(modelOptions, currentModel);
    if (currentOption) {
      return currentOption.value;
    }
  }

  const lastModel = getDeepSeekProviderSettings(settings).lastModel;
  if (lastModel) {
    const lastOption = findDeepSeekModelOption(modelOptions, lastModel);
    if (lastOption) {
      return lastOption.value;
    }
  }

  return modelOptions[0]?.value ?? null;
}
