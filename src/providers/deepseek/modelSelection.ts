import {
  encodeProviderModelSelectionId,
  isProviderModelSelectionId,
  toProviderRuntimeModelId,
} from '../../core/providers/modelSelection';

export function encodeDeepSeekModelSelectionId(modelId: string): string {
  return encodeProviderModelSelectionId('deepseek', modelId);
}

export function isDeepSeekModelSelectionId(modelId: string): boolean {
  return isProviderModelSelectionId('deepseek', modelId);
}

export function toDeepSeekRuntimeModelId(modelId: string): string {
  return toProviderRuntimeModelId('deepseek', modelId);
}
