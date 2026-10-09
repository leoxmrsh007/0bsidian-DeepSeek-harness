import '@/providers';

import { ConversationRepository } from '@/app/conversations/ConversationRepository';
import type { Conversation } from '@/core/types';

function createRepository(conversation: Conversation): ConversationRepository {
  const repository = new ConversationRepository({
    getSettings: () => ({}),
    getVaultPath: () => '/vault',
    persistence: {} as never,
    onConversationDeleted: jest.fn(),
  });
  const internals = repository as unknown as {
    conversations: Conversation[];
    save: (value: Conversation) => Promise<void>;
  };
  internals.conversations = [conversation];
  internals.save = jest.fn(async () => undefined);
  return repository;
}

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    providerId: 'claude',
    title: 'Test',
    createdAt: 1,
    updatedAt: 1,
    sessionId: 'claude-native-session',
    providerState: { claude: 'state' },
    resumeAtMessageId: 'message-1',
    messages: [],
  } as unknown as Conversation;
}

describe('ConversationRepository provider switch (v0.3.1-patch1)', () => {
  it('rebinds the provider and drops the old provider session state', async () => {
    const conversation = createConversation();
    const repository = createRepository(conversation);

    await repository.update(conversation.id, { providerId: 'codex' });

    expect(conversation.providerId).toBe('codex');
    expect(conversation.sessionId).toBeNull();
    expect(conversation.providerState).toBeUndefined();
    expect(conversation.resumeAtMessageId).toBeUndefined();
  });

  it('keeps session state when the provider is unchanged', async () => {
    const conversation = createConversation();
    const repository = createRepository(conversation);

    await repository.update(conversation.id, { providerId: 'claude' });

    expect(conversation.providerId).toBe('claude');
    expect(conversation.sessionId).toBe('claude-native-session');
    expect(conversation.resumeAtMessageId).toBe('message-1');
  });
});
