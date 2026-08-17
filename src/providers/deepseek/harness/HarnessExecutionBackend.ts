import type { ProviderExecutionBackend, ProviderSessionConfig } from '../../../core/execution/ProviderExecutionBackend';
import type { ProviderExecutionSession } from '../../../core/execution/ProviderExecutionSession';
import type { HarnessLaunchConfig } from './HarnessAppLauncher';
import { HarnessExecutionSession } from './HarnessExecutionSession';

export interface HarnessExecutionBackendOptions {
  readonly baseUrl: string;
  readonly launchConfig: HarnessLaunchConfig;
}

/**
 * Execution backend that drives a DeepSeek Harness instance over its local
 * RPC API (http://127.0.0.1:<port>/api/...). The harness desktop app is the
 * agent engine; claudian is a remote front-end. When the app is not running,
 * the backend can auto-launch `dsh web` via {@link HarnessLaunchConfig.autoLaunch}.
 */
export class HarnessExecutionBackend implements ProviderExecutionBackend {
  readonly providerId = 'deepseek' as const;

  constructor(private readonly options: HarnessExecutionBackendOptions) {}

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
      baseUrl: this.options.baseUrl,
      launchConfig: this.options.launchConfig,
      providerSessionId,
      interactionPort: config.interactionPort,
    });
  }
}
