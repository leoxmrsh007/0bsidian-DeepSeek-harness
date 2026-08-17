import type { Plugin } from 'obsidian';
import { Notice } from 'obsidian';

import { ConversationPersistenceStore } from '../../core/bootstrap/ConversationPersistenceStore';
import { SessionStorage } from '../../core/bootstrap/SessionStorage';
import type { SharedAppStorage } from '../../core/bootstrap/storage';
import { normalizeTabManagerState } from '../../core/bootstrap/tabManagerState';
import type { AppTabManagerState } from '../../core/providers/types';
import { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { DeepSeekHarnessSettingsStorage, type StoredDeepSeekHarnessSettings } from '../settings/DeepSeekHarnessSettingsStorage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class SharedStorageService implements SharedAppStorage {
  readonly deepseekHarnessSettings: DeepSeekHarnessSettingsStorage;
  readonly sessions: SessionStorage;
  readonly conversationPersistence: ConversationPersistenceStore;

  private adapter: VaultFileAdapter;
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.adapter = new VaultFileAdapter(plugin.app);
    this.deepseekHarnessSettings = new DeepSeekHarnessSettingsStorage(this.adapter);
    this.sessions = new SessionStorage(this.adapter);
    this.conversationPersistence = new ConversationPersistenceStore(this.adapter);
  }

  async initialize(): Promise<{ storedSettings: Record<string, unknown> }> {
    const storedSettings = await this.deepseekHarnessSettings.load();
    return { storedSettings };
  }

  async saveDeepSeekHarnessSettings(settings: Record<string, unknown>): Promise<void> {
    await this.deepseekHarnessSettings.save(settings as StoredDeepSeekHarnessSettings);
  }

  async setTabManagerState(state: AppTabManagerState): Promise<void> {
    try {
      const loaded: unknown = await this.plugin.loadData();
      const data = isRecord(loaded) ? loaded : {};
      data.tabManagerState = state;
      await this.plugin.saveData(data);
    } catch (error) {
      new Notice('Failed to save tab layout');
      throw error;
    }
  }

  async getTabManagerState(): Promise<AppTabManagerState | null> {
    try {
      const data: unknown = await this.plugin.loadData();
      if (!isRecord(data) || !data.tabManagerState) {
        return null;
      }

      return normalizeTabManagerState(data.tabManagerState);
    } catch {
      return null;
    }
  }

  getAdapter(): VaultFileAdapter {
    return this.adapter;
  }
}
