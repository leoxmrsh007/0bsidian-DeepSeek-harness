import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type { TitleGenerationService } from '@/core/providers/types';

describe('ProviderRegistry', () => {
  beforeEach(() => {
    ProviderWorkspaceRegistry.clear();
    ProviderWorkspaceRegistry.setServices('deepseek', {
    } as any);
    jest.spyOn(ProviderWorkspaceRegistry, 'ensureInitialized')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns capabilities for the default provider', () => {
    const caps = ProviderRegistry.getCapabilities();
    expect(caps.providerId).toBe('deepseek');
    expect(caps).toHaveProperty('supportsPlanMode');
    expect(caps).toHaveProperty('supportsFork');
  });

  it('returns boundary services for the default provider', () => {
    const historyService = ProviderRegistry.getConversationHistoryService();
    expect(historyService).toHaveProperty('hydrateConversationHistory');

    const taskInterpreter = ProviderRegistry.getTaskResultInterpreter();
    expect(taskInterpreter).toHaveProperty('resolveTerminalStatus');
  });

  it('creates transcript-backed subagent history only for providers that own it', () => {
    const host = {} as any;

    expect(ProviderRegistry.createSubagentHistoryService(host, 'deepseek')).toMatchObject({
      loadFinalResult: expect.any(Function),
      loadToolCalls: expect.any(Function),
    });
  });

  it('returns a settings reconciler for the default provider', () => {
    const reconciler = ProviderRegistry.getSettingsReconciler();
    expect(reconciler).toHaveProperty('reconcileModelWithEnvironment');
    expect(reconciler).toHaveProperty('normalizeModelVariantSettings');
  });

  it('returns a chat UI config for the default provider', () => {
    const uiConfig = ProviderRegistry.getChatUIConfig();
    expect(uiConfig).toHaveProperty('getModelOptions');
    expect(uiConfig).toHaveProperty('getCustomModelIds');
  });

  it('throws when an unknown provider is requested', () => {
    expect(() => ProviderRegistry.getCapabilities(
      'nonexistent' as any,
    )).toThrow('Provider "nonexistent" is not registered.');
  });

  it('lists registered provider ids', () => {
    const ids = ProviderRegistry.getRegisteredProviderIds();
    expect(ids).toContain('deepseek');
  });

  it('filters enabled provider ids using registration metadata', () => {
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        deepseek: { enabled: false },
      },
    })).toEqual([]);
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
      },
    })).toEqual(['deepseek']);
  });

  it('exposes the blank-tab provider order from top to bottom', () => {
    expect(ProviderRegistry.getBlankTabProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
      },
    })).toEqual(['deepseek']);
  });

  it('returns the display name from provider registration metadata', () => {
    expect(ProviderRegistry.getProviderDisplayName('deepseek')).toBe('DeepSeek');
  });

  it('routes auto title generation to deepseek', async () => {
    const providerCalls: string[] = [];
    jest.spyOn(ProviderRegistry, 'createTitleGenerationService')
      .mockImplementation((_plugin: any, providerId?: string) => {
        providerCalls.push(providerId ?? 'deepseek');
        return createMockTitleService(providerId ?? 'deepseek');
      });

    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        titleGenerationModel: '',
        providerConfigs: {
          deepseek: { enabled: true },
        },
      },
    } as any);
    const callback = jest.fn();

    await service.generateTitle('conv-1', 'hello', callback);

    expect(providerCalls).toEqual(['deepseek']);
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'deepseek title',
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
