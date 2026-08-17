import type { ProviderWorkspaceRegistration, ProviderWorkspaceServices } from '../../../core/providers/types';
import { HarnessAppLauncher } from '../harness/HarnessAppLauncher';
import { deepseekSettingsTabRenderer } from '../ui/DeepSeekSettingsTab';

export interface DeepSeekWorkspaceServices extends ProviderWorkspaceServices {
  dispose(): Promise<void>;
}

/**
 * Minimal workspace services for the DeepSeek Harness provider.
 *
 * The harness desktop app owns commands, skills, agents, and plugins; this
 * boundary only wires the settings-tab renderer and the `dsh web` subprocess
 * launcher that is reaped on plugin unload.
 */
export async function createDeepSeekWorkspaceServices(): Promise<DeepSeekWorkspaceServices> {
  return {
    settingsTabRenderer: deepseekSettingsTabRenderer,
    dispose() {
      HarnessAppLauncher.get().dispose();
      return Promise.resolve();
    },
  };
}

export const deepseekWorkspaceRegistration: ProviderWorkspaceRegistration<DeepSeekWorkspaceServices> = {
  initialize: async () => createDeepSeekWorkspaceServices(),
};
