import type { ProviderConfigMap } from '../core/types/settings';
import { DEFAULT_DEEPSEEK_PROVIDER_SETTINGS } from './deepseek/settings';

export function getBuiltInProviderDefaultConfigs(): ProviderConfigMap {
  return {
    deepseek: { ...DEFAULT_DEEPSEEK_PROVIDER_SETTINGS },
  };
}
