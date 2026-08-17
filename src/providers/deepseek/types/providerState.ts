import type { Conversation } from '../../../core/types';
import type { ForkSource } from '../../../core/types/chat';
import type { SubagentInfo } from '../../../core/types/tools';

export interface DeepSeekProviderState {
  providerSessionId?: string;
  previousProviderSessionIds?: string[];
  historyReplayPending?: boolean;
  forkSource?: ForkSource;
  subagentData?: Record<string, SubagentInfo>;
}

/** Extracts typed Claude provider state from the opaque bag. */
export function getDeepSeekState(
  providerState: Record<string, unknown> | undefined,
): DeepSeekProviderState {
  return (providerState ?? {});
}

export function getDeepSeekConversationSessionIds(conversation: Conversation): string[] {
  const state = getDeepSeekState(conversation.providerState);
  const isPendingFork = !!state.forkSource
    && !state.providerSessionId
    && !conversation.sessionId;
  if (isPendingFork) {
    return [state.forkSource!.sessionId];
  }

  return [...new Set([
    ...(state.previousProviderSessionIds || []),
    state.providerSessionId ?? conversation.sessionId,
  ].filter((id): id is string => !!id))];
}

export function clearDeepSeekResumeState(conversation: Conversation): boolean {
  const providerState = { ...getDeepSeekState(conversation.providerState) };
  const isPendingFork = !!providerState.forkSource
    && !providerState.providerSessionId
    && !conversation.sessionId;
  const hadResumeState = conversation.sessionId != null
    || typeof providerState.providerSessionId === 'string'
    || providerState.forkSource !== undefined;
  if (!hadResumeState) {
    return false;
  }

  // Stop provider resume while retaining transcript segments for history replay.
  const preservedSessionIds = getDeepSeekConversationSessionIds(conversation);
  if (preservedSessionIds.length > 0) {
    providerState.previousProviderSessionIds = preservedSessionIds;
  } else {
    delete providerState.previousProviderSessionIds;
  }
  if (isPendingFork) {
    conversation.resumeAtMessageId = providerState.forkSource!.resumeAt;
  }

  conversation.sessionId = null;
  delete providerState.providerSessionId;
  delete providerState.forkSource;
  conversation.providerState = Object.keys(providerState).length > 0
    ? providerState
    : undefined;
  return true;
}
