import type { ProviderCapabilities } from '../../core/providers/types';

export const DEEPSEEK_PROVIDER_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  providerId: 'deepseek',
  // The harness session is stateful; claudian persists its own message
  // projection. Native-history replay is a no-op for now.
  supportsNativeHistory: false,
  supportsPlanMode: false,
  supportsRewind: false,
  supportsFork: true,
  supportsProviderCommands: true,
  supportsImageAttachments: false,
  supportsInstructionMode: true,
  supportsTurnSteer: false,
  reasoningControl: 'effort',
  planPathPrefix: '/.dsh/plans/',
});
