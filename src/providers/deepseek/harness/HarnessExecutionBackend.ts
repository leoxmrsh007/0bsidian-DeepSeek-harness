import type { ProviderExecutionBackend, ProviderSessionConfig } from '../../../core/execution/ProviderExecutionBackend';
import type { ProviderExecutionSession } from '../../../core/execution/ProviderExecutionSession';
import { HarnessExecutionSession } from './HarnessExecutionSession';

/**
 * Execution backend that drives a DeepSeek Harness instance over its local
 * RPC API (http://127.0.0.1:<port>/api/...). The harness desktop app is the
 * agent engine; claudian is a remote front-end.
 */
export class HarnessExecutionBackend implements ProviderExecutionBackend {
  constructor(
    readonly providerId: 'deepseek',
    private readonly baseUrl: string,
  ) {}

  createSession(config: ProviderSessionConfig): ProviderExecutionSession {
    const providerSessionId =
      config.resumeSeed?.providerSessionId ??
      (config.resumeSeed?.providerState as { harnessSessionId?: string } | undefined)
        ?.harnessSessionId;

    return new HarnessExecutionSession({
      providerId: this.providerId,
      sessionInstanceId: config.resumeSeed?.providerSessionId
        ? `harness-${config.resumeSeed.providerSessionId}`
        : `harness-${Math.random().toString(36).slice(2, 10)}`,
      baseUrl: this.baseUrl,
      providerSessionId,
      interactionPort: config.interactionPort,
    });
  }
}
