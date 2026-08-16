import {
  encodeProviderModelSelectionId,
  isProviderModelSelectionId,
  toProviderRuntimeModelId,
} from '../../core/providers/modelSelection';

export function encodeClaudeModelSelectionId(modelId: string): string {
  return encodeProviderModelSelectionId('deepseek', modelId);
}

export function isClaudeModelSelectionId(modelId: string): boolean {
  return isProviderModelSelectionId('deepseek', modelId);
}

export function toClaudeRuntimeModelId(modelId: string): string {
  return toProviderRuntimeModelId('deepseek', modelId);
}
