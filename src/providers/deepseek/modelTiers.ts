interface DeepSeekModelVersion {
  major: number;
  minor: number;
}

export const DEEPSEEK_MODEL_TIER_DEFINITIONS = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    agentLabel: 'Flash',
    description: 'Fast general-purpose model',
    environmentKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    environmentPriority: 4,
    agentOrder: 3,
    legacyAliases: [],
    supportsOneMillionSuffix: false,
    aliasHasOneMillionContext: false,
    versionedOneMillionContextFrom: null,
    aliasSupportsXHigh: false,
    versionedXHighFrom: null,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    agentLabel: 'Pro',
    description: 'Most capable model',
    environmentKey: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    environmentPriority: 2,
    agentOrder: 2,
    legacyAliases: [],
    supportsOneMillionSuffix: false,
    aliasHasOneMillionContext: false,
    versionedOneMillionContextFrom: null,
    aliasSupportsXHigh: false,
    versionedXHighFrom: null,
  },
] as const;

export type DeepSeekModelTier = typeof DEEPSEEK_MODEL_TIER_DEFINITIONS[number]['id'];
export type DeepSeekModelEnvironmentType = 'model' | DeepSeekModelTier;
export type DeepSeekModelTierDefinition = typeof DEEPSEEK_MODEL_TIER_DEFINITIONS[number];
export type DeepSeekModelTierEnvironmentKey = DeepSeekModelTierDefinition['environmentKey'];

export const DEEPSEEK_MODEL_TIER_PATTERN = DEEPSEEK_MODEL_TIER_DEFINITIONS
  .map(definition => definition.id)
  .join('|');

export function isDeepSeekModelTier(value: string): value is DeepSeekModelTier {
  return DEEPSEEK_MODEL_TIER_DEFINITIONS.some(definition => definition.id === value);
}

export function isDeepSeekModelEnvironmentType(value: string): value is DeepSeekModelEnvironmentType {
  return value === 'model' || isDeepSeekModelTier(value);
}

export function getDeepSeekModelTierDefinition(tier: DeepSeekModelTier): DeepSeekModelTierDefinition {
  return DEEPSEEK_MODEL_TIER_DEFINITIONS.find(definition => definition.id === tier)!;
}

export function resolveDeepSeekModelTierAlias(value: string): DeepSeekModelTier | null {
  const normalized = value.trim().toLowerCase();
  const definition = DEEPSEEK_MODEL_TIER_DEFINITIONS.find(candidate =>
    candidate.id === normalized
    || (candidate.legacyAliases as readonly string[]).includes(normalized)
  );
  return definition?.id ?? null;
}

export function isVersionAtLeast(
  major: number,
  minor: number,
  minimum: DeepSeekModelVersion | null,
): boolean {
  if (!minimum) {
    return false;
  }
  return major > minimum.major || (major === minimum.major && minor >= minimum.minor);
}
