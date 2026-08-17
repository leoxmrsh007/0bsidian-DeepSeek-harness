import '@/providers';

import { getProviderForModel } from '@/core/providers/modelRouting';

describe('getProviderForModel', () => {
  it('routes DeepSeek default models to deepseek', () => {
    expect(getProviderForModel('deepseek-v4-flash')).toBe('deepseek');
    expect(getProviderForModel('deepseek-v4-pro')).toBe('deepseek');
  });

  it('routes unknown models to deepseek (default)', () => {
    expect(getProviderForModel('some-unknown-model')).toBe('deepseek');
  });

  it('routes provider-qualified deepseek model ids to deepseek', () => {
    expect(getProviderForModel('deepseek/deepseek-v4-flash')).toBe('deepseek');
    expect(getProviderForModel('deepseek/deepseek-v4-pro')).toBe('deepseek');
  });

  it('routes settings-defined custom models to deepseek', () => {
    const settings = {
      providerConfigs: {
        deepseek: {
          enabled: true,
          customModels: 'my-custom-model',
        },
      },
    };

    expect(getProviderForModel('my-custom-model', settings)).toBe('deepseek');
  });
});
