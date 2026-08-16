import type {
  ProviderConversationHistoryService,
  ProviderHistoryPathContext,
} from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { getClaudeProviderSettings } from '../settings';

/**
 * Harness-backed conversation history service.
 *
 * The DeepSeek Harness session is stateful (prompting the same sessionId
 * continues the conversation), so claudian's own persisted message projection
 * is the durable record and native-history replay is best-effort. The service
 * resolves the provider session reference from Conversation.sessionId (which
 * claudian syncs from the execution snapshot's providerSessionId), and returns
 * a harness sessionId for forks.
 */
export class HarnessConversationHistoryService
implements ProviderConversationHistoryService {
  private readonly hydratedKeys = new Map<string, string>();

  async hydrateConversationHistory(
    conversation: Conversation,
    _vaultPath: string | null,
    _pathContext?: ProviderHistoryPathContext,
  ): Promise<void> {
    // Messages are persisted by claudian itself; the harness session is
    // stateful, so there is no separate native transcript to replay here.
    // A no-op keeps a fresh conversation empty until the next turn appends.
    this.hydratedKeys.set(conversation.id, conversation.sessionId ?? 'blank');
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return conversation?.sessionId ?? null;
  }

  isPendingForkConversation(conversation: Conversation): boolean {
    const state = conversation.providerState as
      | { forkSource?: { sessionId?: string } }
      | undefined;
    return Boolean(state?.forkSource && !conversation.sessionId);
  }

  buildForkProviderState(
    sourceSessionId: string,
    resumeAt: string,
    sourceProviderState?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      forkSource: { sessionId: sourceSessionId, resumeAt },
      ...(sourceProviderState?.harnessSessionId
        ? { harnessSessionId: sourceProviderState.harnessSessionId }
        : {}),
    };
  }

  buildPersistedProviderState(
    conversation: Conversation,
  ): Record<string, unknown> | undefined {
    const state = conversation.providerState;
    if (!state) return undefined;
    const persisted: Record<string, unknown> = {};
    if (typeof state.harnessSessionId === 'string') {
      persisted.harnessSessionId = state.harnessSessionId;
    }
    if (state.forkSource) {
      persisted.forkSource = state.forkSource;
    }
    return Object.keys(persisted).length > 0 ? persisted : undefined;
  }
}

/** Resolve the harness base URL from provider settings in a path context. */
export function resolveHarnessBaseUrl(
  pathContext?: ProviderHistoryPathContext,
  fallback = 'http://127.0.0.1:3080',
): string {
  const settings = pathContext?.settings;
  if (!settings) return fallback;
  try {
    return getClaudeProviderSettings(settings).harnessBaseUrl || fallback;
  } catch {
    return fallback;
  }
}
