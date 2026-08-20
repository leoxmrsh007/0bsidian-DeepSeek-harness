import { assertCodexSandboxApplied } from '../../../../../src/providers/codex/execution/CodexExecutionSession';

describe('assertCodexSandboxApplied', () => {
  it('accepts concrete sandbox policies', () => {
    expect(() => assertCodexSandboxApplied({
      type: 'readOnly',
      access: { type: 'fullAccess' },
      networkAccess: false,
    })).not.toThrow();
    expect(() => assertCodexSandboxApplied({ type: 'dangerFullAccess' })).not.toThrow();
    expect(() => assertCodexSandboxApplied(undefined)).not.toThrow();
  });

  it('fails closed when the app-server delegates to an external sandbox', () => {
    expect(() => assertCodexSandboxApplied({
      type: 'externalSandbox',
      networkAccess: 'host',
    })).toThrow(/external backend/);
  });
});
