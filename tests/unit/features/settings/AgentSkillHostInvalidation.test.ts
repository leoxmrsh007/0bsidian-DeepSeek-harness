import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { DeepSeekHarnessSettingTab } from '@/features/settings/DeepSeekHarnessSettings';
import DeepSeekHarnessPlugin from '@/main';

describe('agent skill host invalidation', () => {
  afterEach(() => {
    ProviderWorkspaceRegistry.setServices('codex', undefined);
  });

  it('publishes the new generation synchronously before Codex refresh settles', async () => {
    let finishRefresh!: () => void;
    const refresh = jest.fn().mockReturnValue(new Promise<void>(resolve => {
      finishRefresh = resolve;
    }));
    ProviderWorkspaceRegistry.setServices('codex', {
      commandCatalog: { refresh } as any,
    });
    const invalidateProviderResources = jest.fn();
    const plugin = {
      agentSkillResourceGeneration: 0,
      getAllViews: jest.fn().mockReturnValue([{ invalidateProviderResources }]),
    };

    const pending = DeepSeekHarnessPlugin.prototype.notifyAgentSkillsChanged.call(plugin as any);

    expect(plugin.agentSkillResourceGeneration).toBe(1);
    expect(invalidateProviderResources).toHaveBeenCalledWith(
      ['codex', 'grok', 'pi', 'opencode'],
      1,
    );
    expect(refresh).toHaveBeenCalledTimes(1);

    finishRefresh();
    await expect(pending).resolves.toBeUndefined();
  });

  it('constructs one settings-owned shared repository coordinator', () => {
    const adapter = {};
    const getAdapter = jest.fn().mockReturnValue(adapter);
    const plugin = {
      storage: { getAdapter },
      notifyAgentSkillsChanged: jest.fn(),
    };

    const tab = new DeepSeekHarnessSettingTab({} as any, plugin as any);

    expect(getAdapter).toHaveBeenCalledTimes(1);
    expect((tab as any).agentSkillCoordinator).toBeDefined();
  });
});
