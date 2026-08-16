import type {
  ProviderExecutionEvent,
  ProviderRequestedEventScope,
} from '../../../core/execution/ProviderExecutionEvent';
import type { HarnessHistoryEvent } from './HarnessRpcClient';

/**
 * Maps DeepSeek Harness history events onto claudian's provider-neutral
 * execution events.
 *
 * Verified harness event shapes (probed 2026-08):
 *   turn/start        {data:{turn}}
 *   assistant/chunk   {data:{turn,step,chunk:{type:'text-delta'|'reasoning-delta',text}}}
 *   tool/call         {data:{turn,step,callId,name,arguments(JSON string)}}
 *   tool/result       {data:{turn,step,message:{content:[{type:'tool-result',content:[{type:'text',text}]}]}}}
 *   turn/end          {data:{turn,reason:{kind:'completed'|'aborted'}}}
 *   agent/inbox/spliced {data:{inserted:[{role:'user',content:[{type:'text',text}]}]}}
 */
export class HarnessEventMapper {
  /**
   * Map a batch of harness events (already seq-filtered by the caller) into
   * claudian events. Text deltas are coalesced per message for efficiency.
   */
  map(
    events: readonly HarnessHistoryEvent[],
    scope: ProviderRequestedEventScope,
  ): ProviderExecutionEvent[] {
    const out: ProviderExecutionEvent[] = [];
    let textBuffer = '';
    let thinkingBuffer = '';

    const flushText = () => {
      if (textBuffer) {
        out.push({
          type: 'text_delta',
          scope,
          text: textBuffer,
        });
        textBuffer = '';
      }
    };
    const flushThinking = () => {
      if (thinkingBuffer) {
        out.push({
          type: 'thinking_delta',
          scope,
          text: thinkingBuffer,
        });
        thinkingBuffer = '';
      }
    };

    for (const raw of events) {
      const ev = raw && typeof raw === 'object' && 'event' in raw
        ? (raw as unknown as { event: HarnessHistoryEvent }).event
        : raw;
      if (!ev || typeof ev !== 'object') continue;
      const type = ev.type;
      const data = (ev.data ?? {}) as Record<string, unknown>;

      switch (type) {
        case 'turn/start': {
          flushText();
          flushThinking();
          out.push({
            type: 'turn_started',
            scope,
            accepted: true,
            nativeTurnId: String(data.turn ?? ''),
          });
          break;
        }
        case 'assistant/chunk': {
          const chunk = (data.chunk ?? {}) as {
            type?: string;
            text?: string;
          };
          if (chunk.type === 'text-delta' && chunk.text) {
            textBuffer += chunk.text;
          } else if (chunk.type === 'reasoning-delta' && chunk.text) {
            thinkingBuffer += chunk.text;
          }
          break;
        }
        case 'tool/call': {
          flushText();
          flushThinking();
          const callId = String(data.callId ?? '');
          const name = String(data.name ?? '');
          const rawArgs = typeof data.arguments === 'string'
            ? data.arguments
            : JSON.stringify(data.arguments ?? {});
          let input: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(rawArgs) as unknown;
            if (parsed && typeof parsed === 'object') {
              input = parsed as Record<string, unknown>;
            }
          } catch {
            input = { rawArguments: rawArgs };
          }
          out.push({
            type: 'tool_started',
            scope,
            toolCallId: callId,
            toolScope: { kind: 'main' },
            name,
            input,
          });
          break;
        }
        case 'tool/result': {
          flushText();
          flushThinking();
          const callId = this.extractToolCallId(data);
          const content = this.extractToolResultText(data);
          out.push({
            type: 'tool_output',
            scope,
            toolCallId: callId,
            toolScope: { kind: 'main' },
            content,
          });
          out.push({
            type: 'tool_completed',
            scope,
            toolCallId: callId,
            toolScope: { kind: 'main' },
            content,
            isError: false,
          });
          break;
        }
        case 'turn/end': {
          flushText();
          flushThinking();
          const reason = (data.reason ?? {}) as {
            kind?: string;
            error?: { message?: string; code?: string };
          };
          if (reason.kind === 'completed') {
            out.push({ type: 'turn_completed', scope, reason: 'completed' });
          } else if (reason.kind === 'error') {
            const code = reason.error?.code ?? '';
            const message = reason.error?.message ?? 'Harness reported a turn error.';
            out.push({
              type: 'execution_error',
              scope,
              category: code === 'MISSING_CREDENTIAL' ? 'authentication' : 'provider',
              message,
              recoverable: true,
            });
          } else {
            out.push({ type: 'cancelled', scope, reason: String(reason.kind ?? 'aborted') });
          }
          break;
        }
        default:
          break;
      }
    }

    flushText();
    flushThinking();
    return out;
  }

  /** Detect ask_user_question tool calls in a batch. */
  findAskUserQuestions(
    events: readonly HarnessHistoryEvent[],
  ): Array<{ callId: string; questions: unknown[] }> {
    const found: Array<{ callId: string; questions: unknown[] }> = [];
    for (const raw of events) {
      const ev = raw && typeof raw === 'object' && 'event' in raw
        ? (raw as unknown as { event: HarnessHistoryEvent }).event
        : raw;
      if (!ev || ev.type !== 'tool/call') continue;
      const data = (ev.data ?? {}) as Record<string, unknown>;
      if (String(data.name ?? '') !== 'ask_user_question') continue;
      const rawArgs = typeof data.arguments === 'string' ? data.arguments : '{}';
      let questions: unknown[] = [];
      try {
        const parsed = JSON.parse(rawArgs) as { questions?: unknown[] };
        if (Array.isArray(parsed.questions)) {
          questions = parsed.questions;
        }
      } catch {
        questions = [];
      }
      found.push({ callId: String(data.callId ?? ''), questions });
    }
    return found;
  }

  private extractToolCallId(data: Record<string, unknown>): string {
    const message = data.message as {
      source?: { callId?: string };
    } | undefined;
    return String(message?.source?.callId ?? data.callId ?? '');
  }

  private extractToolResultText(data: Record<string, unknown>): string {
    const message = data.message as {
      content?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
        text?: string;
      }>;
    } | undefined;
    const blocks = message?.content ?? [];
    const parts: string[] = [];
    for (const block of blocks) {
      if (block.type === 'tool-result' && Array.isArray(block.content)) {
        for (const inner of block.content) {
          if (inner.text) parts.push(inner.text);
        }
      } else if (block.text) {
        parts.push(block.text);
      }
    }
    return parts.join('\n');
  }
}
