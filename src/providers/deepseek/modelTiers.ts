interface ClaudeModelVersion {
  major: number;
  minor: number;
}

export const CLAUDE_MODEL_TIER_DEFINITIONS = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    agentLabel: 'Chat',
    description: 'Fast general-purpose model (DeepSeek-V3)',
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
    id: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    agentLabel: 'Reasoner',
    description: 'Reasoning model (DeepSeek-R1)',
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

export type ClaudeModelTier = typeof CLAUDE_MODEL_TIER_DEFINITIONS[number]['id'];
export type ClaudeModelEnvironmentType = 'model' | ClaudeModelTier;
export type ClaudeModelTierDefinition = typeof CLAUDE_MODEL_TIER_DEFINITIONS[number];
export type ClaudeModelTierEnvironmentKey = ClaudeModelTierDefinition['environmentKey'];

export const CLAUDE_MODEL_TIER_PATTERN = CLAUDE_MODEL_TIER_DEFINITIONS
  .map(definition => definition.id)
  .join('|');

export function isClaudeModelTier(value: string): value is ClaudeModelTier {
  return CLAUDE_MODEL_TIER_DEFINITIONS.some(definition => definition.id === value);
}

export function isClaudeModelEnvironmentType(value: string): value is ClaudeModelEnvironmentType {
  return value === 'model' || isClaudeModelTier(value);
}

export function getClaudeModelTierDefinition(tier: ClaudeModelTier): ClaudeModelTierDefinition {
  return CLAUDE_MODEL_TIER_DEFINITIONS.find(definition => definition.id === tier)!;
}

export function resolveClaudeModelTierAlias(value: string): ClaudeModelTier | null {
  const normalized = value.trim().toLowerCase();
  const definition = CLAUDE_MODEL_TIER_DEFINITIONS.find(candidate =>
    candidate.id === normalized
    || (candidate.legacyAliases as readonly string[]).includes(normalized)
  );
  return definition?.id ?? null;
}

export function isVersionAtLeast(
  major: number,
  minor: number,
  minimum: ClaudeModelVersion | null,
): boolean {
  if (!minimum) {
    return false;
  }
  return major > minimum.major || (major === minimum.major && minor >= minimum.minor);
}
