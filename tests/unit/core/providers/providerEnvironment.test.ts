import '@/providers';

import {
  classifyEnvironmentVariablesByOwnership,
  getEnvironmentReviewKeysForScope,
  getEnvironmentScopeUpdates,
  getProviderEnvironmentVariables,
  getRuntimeEnvironmentText,
  getSharedEnvironmentVariables,
  inferEnvironmentSnippetScope,
  resolveEnvironmentSnippetScope,
  setProviderEnvironmentVariables,
  setSharedEnvironmentVariables,
} from '@/core/providers/providerEnvironment';

describe('providerEnvironment', () => {
  describe('classifyEnvironmentVariablesByOwnership', () => {
    it('splits shared and DeepSeek-owned vars by ownership', () => {
      const result = classifyEnvironmentVariablesByOwnership([
        'PATH=/usr/local/bin',
        'DEEPSEEK_API_KEY=deepseek-key',
        'DSH_SESSION_ROOT=/tmp/sessions',
        'CUSTOM_FLAG=1',
      ].join('\n'));

      expect(result.shared).toBe(['PATH=/usr/local/bin', 'CUSTOM_FLAG=1'].join('\n'));
      expect(result.providers.deepseek).toBe([
        'DEEPSEEK_API_KEY=deepseek-key',
        'DSH_SESSION_ROOT=/tmp/sessions',
      ].join('\n'));
      expect(result.reviewKeys).toEqual(['CUSTOM_FLAG']);
    });

    it('keeps comments attached to the next owned variable when migrating', () => {
      const result = classifyEnvironmentVariablesByOwnership([
        '# shared comment',
        'PATH=/usr/local/bin',
        '',
        '# deepseek comment',
        'DEEPSEEK_API_KEY=deepseek-key',
      ].join('\n'));

      expect(result.shared).toBe(['# shared comment', 'PATH=/usr/local/bin'].join('\n'));
      expect(result.providers.deepseek).toBe(['', '# deepseek comment', 'DEEPSEEK_API_KEY=deepseek-key'].join('\n'));
    });
  });

  describe('runtime env accessors', () => {
    it('reads split shared/provider env from settings', () => {
      const settings: Record<string, unknown> = {
        sharedEnvironmentVariables: 'PATH=/usr/local/bin',
        providerConfigs: {
          deepseek: { environmentVariables: 'DEEPSEEK_API_KEY=test-key' },
        },
      };

      expect(getSharedEnvironmentVariables(settings)).toBe('PATH=/usr/local/bin');
      expect(getProviderEnvironmentVariables(settings, 'deepseek')).toBe('DEEPSEEK_API_KEY=test-key');
      expect(getRuntimeEnvironmentText(settings, 'deepseek')).toBe([
        'PATH=/usr/local/bin',
        'DEEPSEEK_API_KEY=test-key',
      ].join('\n'));
    });

    it('falls back to classifying legacy single-bag env settings', () => {
      const settings: Record<string, unknown> = {
        environmentVariables: [
          'PATH=/usr/local/bin',
          'DEEPSEEK_API_KEY=deepseek-key',
          'CUSTOM_FLAG=1',
        ].join('\n'),
      };

      expect(getSharedEnvironmentVariables(settings)).toBe(['PATH=/usr/local/bin', 'CUSTOM_FLAG=1'].join('\n'));
      expect(getProviderEnvironmentVariables(settings, 'deepseek')).toBe('DEEPSEEK_API_KEY=deepseek-key');
    });

    it('updates split env settings through scoped setters', () => {
      const settings: Record<string, unknown> = {};

      setSharedEnvironmentVariables(settings, 'PATH=/usr/local/bin');
      setProviderEnvironmentVariables(settings, 'deepseek', 'DEEPSEEK_API_KEY=test-key');

      expect(settings.sharedEnvironmentVariables).toBe('PATH=/usr/local/bin');
      expect(settings.providerConfigs).toEqual({
        deepseek: { environmentVariables: 'DEEPSEEK_API_KEY=test-key' },
      });
    });
  });

  describe('getEnvironmentReviewKeysForScope', () => {
    it('flags unknown keys left in shared env for manual review', () => {
      const reviewKeys = getEnvironmentReviewKeysForScope([
        'PATH=/usr/local/bin',
        'CUSTOM_FLAG=1',
      ].join('\n'), 'shared');

      expect(reviewKeys).toEqual(['CUSTOM_FLAG']);
    });

    it('flags shared and foreign-provider keys in provider env sections', () => {
      const reviewKeys = getEnvironmentReviewKeysForScope([
        'PATH=/usr/local/bin',
        'CUSTOM_FLAG=1',
      ].join('\n'), 'provider:deepseek');

      expect(reviewKeys).toEqual(['PATH', 'CUSTOM_FLAG']);
    });
  });

  describe('inferEnvironmentSnippetScope', () => {
    it('returns shared for neutral-only snippets', () => {
      expect(inferEnvironmentSnippetScope('PATH=/usr/local/bin')).toBe('shared');
    });

    it('returns provider scope for single-provider snippets', () => {
      expect(inferEnvironmentSnippetScope('DEEPSEEK_API_KEY=deepseek-key')).toBe('provider:deepseek');
    });

    it('keeps mixed-ownership legacy snippets unscoped', () => {
      expect(inferEnvironmentSnippetScope([
        'PATH=/usr/local/bin',
        'DEEPSEEK_API_KEY=deepseek-key',
      ].join('\n'))).toBeUndefined();
    });
  });

  describe('resolveEnvironmentSnippetScope', () => {
    it('normalizes mixed snippets back to unscoped even if a stale scope was saved', () => {
      expect(resolveEnvironmentSnippetScope([
        'PATH=/usr/local/bin',
        'DEEPSEEK_API_KEY=deepseek-key',
      ].join('\n'), 'shared')).toBeUndefined();
    });

    it('keeps the fallback scope only for empty snippets', () => {
      expect(resolveEnvironmentSnippetScope('', 'provider:deepseek')).toBe('provider:deepseek');
    });
  });

  describe('getEnvironmentScopeUpdates', () => {
    it('reclassifies mixed snippets into separate scope updates', () => {
      expect(getEnvironmentScopeUpdates([
        'PATH=/usr/local/bin',
        'DEEPSEEK_API_KEY=deepseek-key',
      ].join('\n'), 'shared')).toEqual([
        { scope: 'shared', envText: 'PATH=/usr/local/bin' },
        { scope: 'provider:deepseek', envText: 'DEEPSEEK_API_KEY=deepseek-key' },
      ]);
    });

    it('uses the fallback scope only when there is no inferable content', () => {
      expect(getEnvironmentScopeUpdates('', 'provider:deepseek')).toEqual([
        { scope: 'provider:deepseek', envText: '' },
      ]);
    });
  });
});
