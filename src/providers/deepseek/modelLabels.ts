import {
  DEEPSEEK_MODEL_TIER_PATTERN,
  type DeepSeekModelTier,
  getDeepSeekModelTierDefinition,
} from './modelTiers';

function getFamilyDisplayName(family: DeepSeekModelTier): string {
  return getDeepSeekModelTierDefinition(family).agentLabel;
}

function formatDeepSeekModelDateTag(date: string | undefined): string | null {
  if (!date || date.length < 6) {
    return null;
  }

  return `(${date.slice(2, 6)})`;
}

function getCustomModelLabelSource(modelId: string): string {
  if (!modelId.includes('/')) {
    return modelId;
  }

  return modelId.split('/').pop() || modelId;
}

function formatGenericCustomModelLabel(labelSource: string): string {
  return labelSource
    .replace(/-/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

/**
 * Formats a custom model ID for display. Prefers the Claude-aware label
 * (e.g. `Sonnet 4.5`); falls back to the slug tail for namespaced IDs
 * (`vendor/model`) or a Title Cased version of the raw ID.
 */
export function formatCustomModelLabel(modelId: string): string {
  const labelSource = getCustomModelLabelSource(modelId);
  const claudeLabel = formatDeepSeekCustomModelLabel(labelSource);
  if (claudeLabel) {
    return claudeLabel;
  }
  return modelId.includes('/') ? labelSource : formatGenericCustomModelLabel(labelSource);
}

function formatDeepSeekCustomModelLabel(labelSource: string): string | null {
  const trimmed = labelSource.trim();
  if (!trimmed) {
    return null;
  }

  const is1M = trimmed.toLowerCase().endsWith('[1m]');
  const without1M = is1M ? trimmed.slice(0, -4) : trimmed;
  const claudePrefixIndex = without1M.toLowerCase().indexOf('claude-');
  const candidate = claudePrefixIndex >= 0 ? without1M.slice(claudePrefixIndex) : without1M;

  const versionedMatch = candidate.match(new RegExp(
    `^claude-(${DEEPSEEK_MODEL_TIER_PATTERN})-(\\d+)-(\\d+)`
    + '(?:-(\\d{8}))?(?:-v\\d+:\\d+)?$',
    'i',
  ));
  if (versionedMatch) {
    const [, family, major, minor, date] = versionedMatch;
    const suffixes = [
      formatDeepSeekModelDateTag(date),
      is1M ? '(1M)' : null,
    ].filter(Boolean).join(' ');
    return `${getFamilyDisplayName(family as DeepSeekModelTier)} ${major}.${minor}${suffixes ? ` ${suffixes}` : ''}`;
  }

  const majorOnlyMatch = candidate.match(new RegExp(
    `^claude-(${DEEPSEEK_MODEL_TIER_PATTERN})-(\\d+)(?:-(\\d{8}))?(?:-v\\d+:\\d+)?$`,
    'i',
  ));
  if (majorOnlyMatch) {
    const [, family, major, date] = majorOnlyMatch;
    const suffixes = [
      formatDeepSeekModelDateTag(date),
      is1M ? '(1M)' : null,
    ].filter(Boolean).join(' ');
    return `${getFamilyDisplayName(family as DeepSeekModelTier)} ${major}${suffixes ? ` ${suffixes}` : ''}`;
  }

  return null;
}
