import { readFileSync } from 'fs';
import { join } from 'path';

import type { ProviderUIOption } from '../../../core/providers/types';
import { resolveClaudeConfigDir } from '../config/ClaudeConfigDir';

interface ClaudeCliModelPickerOption {
  model?: unknown;
  label?: unknown;
  description?: unknown;
}

interface ClaudeCliSettingsFile {
  modelPicker?: {
    options?: ClaudeCliModelPickerOption[];
  };
}

let cachedOptions: ProviderUIOption[] | null = null;
let cacheLoadFailed = false;

/**
 * v0.3.0-patch1: merge the Claude Code CLI `modelPicker.options` (from
 * `~/.claude/settings.json`) into the plugin's Claude provider model list.
 *
 * The Claude Code CLI exposes custom-gateway models (e.g. `nairos/nairos-pro`
 * routed through magpie) via `modelPicker.options`. The plugin previously
 * ignored this file, so pill never offered those models. Reading them here
 * makes every CLI-visible gateway model selectable in a vault tab, including
 * switching mid-conversation.
 *
 * Read is cached: re-parses only on plugin reload (module state). Safe on
 * read failure — returns an empty list and memorizes the failure so a broken
 * `settings.json` doesn't degrade the default model list on every call.
 */
export function getClaudeCliModelPickerOptions(): ProviderUIOption[] {
  if (cachedOptions !== null) return cachedOptions;
  if (cacheLoadFailed) return [];

  try {
    const configDir = resolveClaudeConfigDir();
    const settingsPath = join(configDir, 'settings.json');
    const raw = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as ClaudeCliSettingsFile;
    const options = parsed?.modelPicker?.options;
    if (!Array.isArray(options)) {
      cachedOptions = [];
      return cachedOptions;
    }

    const seen = new Set<string>();
    const result: ProviderUIOption[] = [];
    for (const entry of options) {
      const model = typeof entry?.model === 'string' ? entry.model.trim() : '';
      if (!model || seen.has(model)) continue;
      seen.add(model);

      const label = typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : model;
      const description = typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : 'Claude CLI modelPicker option';

      result.push({ value: model, label, description });
    }

    cachedOptions = result;
    return cachedOptions;
  } catch {
    cacheLoadFailed = true;
    return [];
  }
}

/** Test hook: reset the in-memory cache (used by jest suites). */
export function resetClaudeCliModelPickerCache(): void {
  cachedOptions = null;
  cacheLoadFailed = false;
}
