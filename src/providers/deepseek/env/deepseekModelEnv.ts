import { formatCustomModelLabel } from '../modelLabels';
import {
  DEEPSEEK_MODEL_TIER_DEFINITIONS,
  type DeepSeekModelEnvironmentType,
  type DeepSeekModelTierEnvironmentKey,
  getDeepSeekModelTierDefinition,
} from '../modelTiers';

export type DeepSeekModelEnvKey = 'ANTHROPIC_MODEL' | DeepSeekModelTierEnvironmentKey;
export type DeepSeekModelEnvType = DeepSeekModelEnvironmentType;

export const DEEPSEEK_MODEL_ENV_KEYS: readonly DeepSeekModelEnvKey[] = [
  'ANTHROPIC_MODEL',
  ...DEEPSEEK_MODEL_TIER_DEFINITIONS.map(definition => definition.environmentKey),
];

export interface DeepSeekEnvironmentModel {
  value: string;
  label: string;
  description: string;
  environmentTypes: DeepSeekModelEnvType[];
}

function getModelTypeFromEnvKey(envKey: DeepSeekModelEnvKey): DeepSeekModelEnvType {
  if (envKey === 'ANTHROPIC_MODEL') {
    return 'model';
  }
  return DEEPSEEK_MODEL_TIER_DEFINITIONS.find(definition => definition.environmentKey === envKey)!.id;
}

function getModelTypePriority(type: DeepSeekModelEnvType): number {
  return type === 'model'
    ? DEEPSEEK_MODEL_TIER_DEFINITIONS.length + 1
    : getDeepSeekModelTierDefinition(type).environmentPriority;
}

export function getModelsFromEnvironment(
  envVars: Record<string, string>,
  modelAliases: Record<string, string> = {},
): DeepSeekEnvironmentModel[] {
  const modelMap = new Map<string, { types: DeepSeekModelEnvType[]; label: string }>();

  for (const envKey of DEEPSEEK_MODEL_ENV_KEYS) {
    const type = getModelTypeFromEnvKey(envKey);
    const modelValue = envVars[envKey];
    if (modelValue) {
      const label = modelAliases[modelValue] ?? formatCustomModelLabel(modelValue);

      if (!modelMap.has(modelValue)) {
        modelMap.set(modelValue, { types: [type], label });
      } else {
        modelMap.get(modelValue)!.types.push(type);
      }
    }
  }

  const models: DeepSeekEnvironmentModel[] = [];

  const sortedEntries = Array.from(modelMap.entries()).sort(([, aInfo], [, bInfo]) => {
    const aPriority = Math.max(...aInfo.types.map(getModelTypePriority));
    const bPriority = Math.max(...bInfo.types.map(getModelTypePriority));
    return bPriority - aPriority;
  });

  for (const [modelValue, info] of sortedEntries) {
    const sortedTypes = info.types.sort((a, b) =>
      getModelTypePriority(b) - getModelTypePriority(a)
    );

    models.push({
      value: modelValue,
      label: info.label,
      description: `Custom model (${sortedTypes.join(', ')})`,
      environmentTypes: [...sortedTypes],
    });
  }

  return models;
}

export function getCurrentModelFromEnvironment(envVars: Record<string, string>): string | null {
  for (const envKey of DEEPSEEK_MODEL_ENV_KEYS) {
    const modelId = envVars[envKey];
    if (modelId) {
      return modelId;
    }
  }
  return null;
}

export function getCustomModelIds(envVars: Record<string, string>): Set<string> {
  const modelIds = new Set<string>();
  for (const envKey of DEEPSEEK_MODEL_ENV_KEYS) {
    const modelId = envVars[envKey];
    if (modelId) {
      modelIds.add(modelId);
    }
  }
  return modelIds;
}
