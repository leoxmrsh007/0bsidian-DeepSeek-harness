import type { ProviderRequestedEventScope } from '../../../../src/core/execution/ProviderExecutionEvent';
import { HarnessEventMapper } from '../../../../src/providers/deepseek/harness/HarnessEventMapper';
import type { HarnessHistoryEvent } from '../../../../src/providers/deepseek/harness/HarnessRpcClient';

const SCOPE: ProviderRequestedEventScope = {
  kind: 'requested',
  sessionInstanceId: 'session-1',
  executionId: 'exec-1',
  turnId: 'turn-1',
  sequence: 0,
};

function historyEvent(type: string, data: Record<string, unknown>, seq = 1): HarnessHistoryEvent {
  return { seq, type, data };
}

describe('HarnessEventMapper', () => {
  const mapper = new HarnessEventMapper();

  it('maps turn/start to turn_started', () => {
    const out = mapper.map(
      [historyEvent('turn/start', { turn: 3 })],
      SCOPE,
    );
    expect(out).toEqual([
      { type: 'turn_started', scope: SCOPE, accepted: true, nativeTurnId: '3' },
    ]);
  });

  it('coalesces text-delta and reasoning-delta chunks into text/thinking deltas', () => {
    const out = mapper.map(
      [
        historyEvent('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Hel' } }),
        historyEvent('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'lo' } }),
        historyEvent('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 1, text: 'thi' } }),
        historyEvent('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 1, text: 'nking' } }),
      ],
      SCOPE,
    );
    expect(out).toEqual([
      { type: 'text_delta', scope: SCOPE, text: 'Hello' },
      { type: 'thinking_delta', scope: SCOPE, text: 'thinking' },
    ]);
  });

  it('maps tool/call to tool_started with parsed JSON arguments', () => {
    const out = mapper.map(
      [historyEvent('tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"command":"ls"}' })],
      SCOPE,
    );
    expect(out).toEqual([
      {
        type: 'tool_started',
        scope: SCOPE,
        toolCallId: 'call-1',
        toolScope: { kind: 'main' },
        name: 'bash',
        input: { command: 'ls' },
      },
    ]);
  });

  it('falls back to raw arguments when tool arguments are not valid JSON', () => {
    const out = mapper.map(
      [historyEvent('tool/call', { turn: 1, step: 1, callId: 'call-2', name: 'bash', arguments: 'not-json' })],
      SCOPE,
    );
    expect(out[0]).toMatchObject({
      type: 'tool_started',
      toolCallId: 'call-2',
      name: 'bash',
      input: { rawArguments: 'not-json' },
    });
  });

  it('maps tool/result to tool_output and tool_completed', () => {
    const out = mapper.map(
      [historyEvent('tool/result', {
        turn: 1,
        step: 1,
        message: {
          source: { kind: 'tool', callId: 'call-1' },
          content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'ok' }] }],
        },
      })],
      SCOPE,
    );
    expect(out).toEqual([
      {
        type: 'tool_output',
        scope: SCOPE,
        toolCallId: 'call-1',
        toolScope: { kind: 'main' },
        content: 'ok',
      },
      {
        type: 'tool_completed',
        scope: SCOPE,
        toolCallId: 'call-1',
        toolScope: { kind: 'main' },
        content: 'ok',
        isError: false,
      },
    ]);
  });

  it('maps turn/end completed to turn_completed', () => {
    const out = mapper.map(
      [historyEvent('turn/end', { turn: 1, reason: { kind: 'completed' } })],
      SCOPE,
    );
    expect(out).toEqual([{ type: 'turn_completed', scope: SCOPE, reason: 'completed' }]);
  });

  it('maps turn/end error to execution_error with authentication category for missing credentials', () => {
    const out = mapper.map(
      [historyEvent('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'MISSING_CREDENTIAL', message: 'no key' } } })],
      SCOPE,
    );
    expect(out).toEqual([{
      type: 'execution_error',
      scope: SCOPE,
      category: 'authentication',
      message: 'no key',
      recoverable: true,
    }]);
  });

  it('maps non-completed non-error turn/end to cancelled', () => {
    const out = mapper.map(
      [historyEvent('turn/end', { turn: 1, reason: { kind: 'aborted' } })],
      SCOPE,
    );
    expect(out).toEqual([{ type: 'cancelled', scope: SCOPE, reason: 'aborted' }]);
  });

  it('detects ask_user_question tool calls', () => {
    const found = mapper.findAskUserQuestions([
      historyEvent('tool/call', {
        turn: 1,
        step: 1,
        callId: 'call-q',
        name: 'ask_user_question',
        arguments: JSON.stringify({ questions: [{ id: 'q1', question: 'Pick one?' }] }),
      }),
    ]);
    expect(found).toEqual([{
      callId: 'call-q',
      questions: [{ id: 'q1', question: 'Pick one?' }],
    }]);
  });
});
