import '@/providers';

import { getProviderForModel } from '@/core/providers/modelRouting';

describe('getProviderForModel', () => {
  it('routes Claude default models to claude', () => {
    expect(getProviderForModel('haiku')).toBe('claude');
    expect(getProviderForModel('sonnet')).toBe('claude');
    expect(getProviderForModel('opus')).toBe('claude');
  });

  it('routes DeepSeek models to deepseek', () => {
    expect(getProviderForModel('deepseek-v4-flash')).toBe('deepseek');
    expect(getProviderForModel('deepseek-v4-pro')).toBe('deepseek');
  });

  it('routes unknown models to claude (default)', () => {
    expect(getProviderForModel('some-unknown-model')).toBe('claude');
  });

  it('routes provider-qualified model ids to their owning provider', () => {
    expect(getProviderForModel('deepseek/deepseek-v4-flash')).toBe('deepseek');
    expect(getProviderForModel('claude-code/deepseek-v4-pro')).toBe('claude');
  });
});
