import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type { TitleGenerationService } from '@/core/providers/types';

describe('ProviderRegistry', () => {
  beforeEach(() => {
    ProviderWorkspaceRegistry.clear();
    ProviderWorkspaceRegistry.setServices('claude', {} as any);
    ProviderWorkspaceRegistry.setServices('deepseek', {} as any);
    jest.spyOn(ProviderWorkspaceRegistry, 'ensureInitialized')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns capabilities for the default provider', () => {
    const caps = ProviderRegistry.getCapabilities();
    expect(caps.providerId).toBe('claude');
    expect(caps).toHaveProperty('supportsPlanMode');
  });

  it('returns boundary services for the default provider', () => {
    const historyService = ProviderRegistry.getConversationHistoryService();
    expect(historyService).toHaveProperty('hydrateConversationHistory');

    const taskInterpreter = ProviderRegistry.getTaskResultInterpreter();
    expect(taskInterpreter).toHaveProperty('resolveTerminalStatus');
  });

  it('returns a settings reconciler and chat UI config for the default provider', () => {
    const reconciler = ProviderRegistry.getSettingsReconciler();
    expect(reconciler).toHaveProperty('reconcileModelWithEnvironment');

    const uiConfig = ProviderRegistry.getChatUIConfig();
    expect(uiConfig).toHaveProperty('getModelOptions');
  });

  it('throws when an unknown provider is requested', () => {
    expect(() => ProviderRegistry.getCapabilities(
      'nonexistent' as any,
    )).toThrow('Provider "nonexistent" is not registered.');
  });

  it('lists registered provider ids', () => {
    expect(ProviderRegistry.getRegisteredProviderIds()).toEqual(
      expect.arrayContaining(['claude', 'deepseek']),
    );
  });

  it('filters enabled provider ids using registration metadata', () => {
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        deepseek: { enabled: false },
      },
    })).toEqual(['claude']);
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
      },
    })).toEqual(['deepseek', 'claude']);
  });

  it('exposes the blank-tab provider order from top to bottom', () => {
    expect(ProviderRegistry.getBlankTabProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
      },
    })).toEqual(['claude', 'deepseek']);
  });

  it('returns the display name from provider registration metadata', () => {
    expect(ProviderRegistry.getProviderDisplayName('claude')).toBe('Claude');
    expect(ProviderRegistry.getProviderDisplayName('deepseek')).toBe('DeepSeek');
  });

  it('routes auto title generation to claude by default', async () => {
    const providerCalls: string[] = [];
    jest.spyOn(ProviderRegistry, 'createTitleGenerationService')
      .mockImplementation((_plugin: any, providerId?: string) => {
        providerCalls.push(providerId ?? 'claude');
        return createMockTitleService(providerId ?? 'claude');
      });

    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        titleGenerationModel: '',
        providerConfigs: {
          claude: { enabled: true },
        },
      },
    } as any);
    const callback = jest.fn();

    await service.generateTitle('conv-1', 'hello', callback);

    expect(providerCalls).toEqual(['claude']);
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'claude title',
    });
  });
});

function createMockTitleService(providerId: string): TitleGenerationService {
  return {
    cancel: jest.fn(),
    generateTitle: jest.fn(async (_conversationId, _userMessage, callback) => {
      await callback(_conversationId, {
        success: true,
        title: `${providerId} title`,
      });
    }),
  };
}
