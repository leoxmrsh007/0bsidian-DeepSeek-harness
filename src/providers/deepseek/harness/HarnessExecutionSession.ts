import { randomUUID } from 'crypto';

import type { ProviderExecutionEvent } from '../../../core/execution/ProviderExecutionEvent';
import type { ProviderExecutionRequest } from '../../../core/execution/ProviderExecutionRequest';
import type {
  ProviderExecutionRun,
  ProviderExecutionSession,
} from '../../../core/execution/ProviderExecutionSession';
import type { ProviderInteractionPort } from '../../../core/execution/ProviderInteractionPort';
import type {
  ProviderSessionSnapshot,
  ProviderSessionStatus,
} from '../../../core/execution/ProviderSessionSnapshot';
import type { ProviderId } from '../../../core/types/provider';
import { HarnessAppLauncher, type HarnessLaunchConfig } from './HarnessAppLauncher';
import { HarnessEventMapper } from './HarnessEventMapper';
import type {
  HarnessMuxSocket} from './HarnessRpcClient';
import {
  discoverHarnessBaseUrl,
  type HarnessHistoryEvent,
  type HarnessMuxQuestion,
  HarnessRpcClient,
} from './HarnessRpcClient';

const POLL_INTERVAL_MS = 400;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface HarnessSessionOptions {
  readonly providerId: ProviderId;
  readonly sessionInstanceId: string;
  readonly baseUrl: string;
  readonly launchConfig: HarnessLaunchConfig;
  readonly providerSessionId?: string;
  readonly interactionPort: ProviderInteractionPort;
}

/**
 * A claudian execution session backed by a DeepSeek Harness RPC session.
 *
 * The harness is the engine: we submit prompts via session.prompt (queue
 * mode), poll session.history for new events (seq-filtered), and map them
 * onto claudian's provider-neutral event stream. ask_user_question tool
 * calls are surfaced through the interaction port and answered via
 * /api/respond using the rpcId observed on the events.mux socket.
 */
export class HarnessExecutionSession implements ProviderExecutionSession {
  readonly providerId: ProviderId;
  readonly sessionInstanceId: string;

  private readonly rpc: HarnessRpcClient;
  private readonly interactionPort: ProviderInteractionPort;
  private readonly mapper = new HarnessEventMapper();

  private providerSessionId: string | undefined;
  private status: ProviderSessionStatus = 'idle';
  private revision = 0;
  private disposed = false;
  private mux: HarnessMuxSocket | null = null;
  private activeRun: { executionId: string; controller: AbortController } | null = null;
  private readonly baseUrl: string;
  private readonly launchConfig: HarnessLaunchConfig;

  constructor(options: HarnessSessionOptions) {
    this.providerId = options.providerId;
    this.sessionInstanceId = options.sessionInstanceId;
    this.baseUrl = options.baseUrl;
    this.rpc = new HarnessRpcClient(options.baseUrl);
    this.interactionPort = options.interactionPort;
    this.launchConfig = options.launchConfig;
    this.providerSessionId = options.providerSessionId;
  }

  execute(request: ProviderExecutionRequest): ProviderExecutionRun {
    const executionId = randomUUID();
    const turnId = randomUUID();
    const controller = new AbortController();
    this.activeRun = { executionId, controller };
    this.status = 'executing';

    const abortFromRequest = () => {
      if (request.signal.aborted) controller.abort();
    };
    if (request.signal.aborted) {
      controller.abort();
    } else {
      request.signal.addEventListener('abort', abortFromRequest, { once: true });
    }

    const events = this.runLoop(request, executionId, turnId, controller);
    return {
      executionId,
      turnId,
      events,
      cancel: () => controller.abort(),
    };
  }

  cancel(): void {
    this.activeRun?.controller.abort();
  }

  getSnapshot(): ProviderSessionSnapshot {
    const base = {
      providerId: this.providerId,
      revision: this.revision,
      providerSessionId: this.providerSessionId,
    };
    if (this.status === 'invalidated') {
      return {
        ...base,
        status: 'invalidated',
        invalidation: {
          reason: 'provider-transition',
          recoverable: true,
          message: 'Harness session invalidated',
        },
      };
    }
    if (this.providerSessionId) {
      return {
        ...base,
        status: this.status,
        providerState: { harnessSessionId: this.providerSessionId },
      };
    }
    return { ...base, status: this.status };
  }

  getStatus(): ProviderSessionStatus {
    return this.status;
  }

  onEvent(_listener: (event: never) => void): () => void {
    return () => {};
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.cancel();
    this.mux?.dispose();
    this.mux = null;
    this.status = 'disposed';
  }

  // ---------------------------------------------------------------------------

  private async *runLoop(
    request: ProviderExecutionRequest,
    executionId: string,
    turnId: string,
    controller: AbortController,
  ): AsyncGenerator<ProviderExecutionEvent> {
    const scope = {
      kind: 'requested' as const,
      sessionInstanceId: this.sessionInstanceId,
      executionId,
      turnId,
      sequence: 0,
    };

    try {
      // 0. Ensure the harness endpoint is reachable; discover the live random
      //    port, then auto-launch `dsh web` as a last resort.
      const reachable = await this.ensureReachable(controller.signal);
      if (!reachable) {
        yield {
          type: 'execution_error',
          scope,
          category: 'transport',
          message: 'DeepSeek Harness is not reachable. Start it with `dsh web`, or enable auto-launch and make sure `dsh` is installed (`npm i -g @deepseek-ai/dsh`).',
          recoverable: true,
        };
        return;
      }

      // 1. Ensure a harness session exists.
      let sessionId = this.providerSessionId;
      if (!sessionId) {
        const created = await this.rpc.createSession({}, controller.signal);
        sessionId = created.sessionId;
        this.providerSessionId = sessionId;
        this.revision += 1;
      }

      // 2. Compose the prompt text from the request.
      const promptText = this.composePrompt(request);

      // 3. Submit (queue mode).
      await this.rpc.prompt(sessionId, promptText, controller.signal);

      // 4. Connect the mux to observe ask_user_question rpcIds.
      this.ensureMux();

      // 5. Poll history, mapping new events onto the claudian stream.
      let lastSeq = -1;
      const deadline = Date.now() + IDLE_TIMEOUT_MS;
      let turnEnded = false;

      while (!turnEnded && !controller.signal.aborted) {
        if (this.disposed) break;
        const history = await this.rpc.fetchHistory(sessionId, 1000, controller.signal);
        const fresh = history.filter(ev => {
          const seq = typeof ev.seq === 'number' ? ev.seq : -1;
          return seq > lastSeq;
        });
        if (fresh.length > 0) {
          lastSeq = Math.max(...fresh.map(ev => (typeof ev.seq === 'number' ? ev.seq : -1)));
          this.handleAskUserQuestions(fresh, sessionId, controller);
          const mapped = this.mapper.map(fresh, scope);
          for (const event of mapped) {
            scope.sequence += 1;
            yield { ...event, scope: { ...scope, sequence: scope.sequence } };
            if (
              event.type === 'turn_completed'
              || event.type === 'cancelled'
              || event.type === 'execution_error'
            ) {
              turnEnded = true;
            }
          }
        } else if (Date.now() > deadline) {
          yield {
            type: 'execution_error',
            scope,
            category: 'transport',
            message: 'Harness did not complete the turn within the idle timeout.',
            recoverable: true,
          };
          break;
        }
        await this.sleep(POLL_INTERVAL_MS, controller.signal);
      }

      if (controller.signal.aborted) {
        yield { type: 'cancelled', scope, reason: 'request-aborted' };
      }
    } catch (err) {
      yield {
        type: 'execution_error',
        scope,
        category: this.categorizeError(err),
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
      };
    } finally {
      this.status = 'idle';
      this.activeRun = null;
    }
  }

  private composePrompt(request: ProviderExecutionRequest): string {
    const parts: string[] = [];

    const note = request.context?.currentNote;
    if (note?.path) {
      parts.push(`[当前笔记: ${note.path}]`);
      if (note.content && note.content.trim().length > 0) {
        const content = note.content.length > 30000
          ? note.content.slice(0, 30000) + '\n…(笔记过长，已截断)'
          : note.content;
        parts.push(`<note-content>\n${content}\n</note-content>`);
      }
    }

    const selection = request.context?.editorSelection;
    if (selection && typeof selection === 'object' && 'text' in selection && selection.text) {
      parts.push(`<selection>\n${selection.text}\n</selection>`);
    }

    const textBlocks = request.input
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .filter(t => t.trim().length > 0);

    parts.push(...textBlocks);

    if (parts.length === 0) {
      return '(空消息)';
    }
    return parts.join('\n\n');
  }

  private handleAskUserQuestions(
    events: readonly HarnessHistoryEvent[],
    sessionId: string,
    controller: AbortController,
  ): void {
    const calls = this.mapper.findAskUserQuestions(events);
    for (const call of calls) {
      void this.resolveAskUserQuestion(call.questions, sessionId, controller);
    }
  }

  private async resolveAskUserQuestion(
    questions: unknown[],
    sessionId: string,
    controller: AbortController,
  ): Promise<void> {
    if (!Array.isArray(questions) || questions.length === 0) return;
    const question = this.mux?.questions.values().next().value;
    const rpcId = question?.rpcId;
    if (!rpcId) {
      // No mux frame yet — retry shortly; if still missing, drop (the
      // harness turn will eventually abort and clear the queue).
      await this.sleep(800, controller.signal);
      const retry = this.mux?.questions.values().next().value;
      if (!retry?.rpcId) return;
    }

    const target = (this.mux?.questions.values().next().value ??
      question) as HarnessMuxQuestion;
    if (!target?.rpcId) return;

    const response = await this.interactionPort.askUserQuestion(
      {
        kind: 'question',
        interactionId: randomUUID(),
        sessionInstanceId: this.sessionInstanceId,
        turnId: 'ask-user',
        input: { questions: target.questions },
      },
      controller.signal,
    );

    const answers = response.answers;
    if (!answers) return;
    const answerList = target.questions
      .map(q => {
        const raw = answers[q.id];
        if (raw === undefined) return null;
        const selected = Array.isArray(raw) ? raw : [String(raw)];
        return { id: q.id, selected };
      })
      .filter((a): a is { id: string; selected: string[] } => a !== null);

    if (answerList.length > 0) {
      await this.rpc.respond(target.rpcId, sessionId, answerList, controller.signal);
      this.mux?.removeQuestion(target.rpcId);
    }
  }

  private ensureMux(): void {
    if (this.mux) return;
    this.mux = this.rpc.openMux();
    this.mux.connect();
  }

  /**
   * Probe the configured harness endpoint; if unreachable, discover the live
   * random port, then auto-launch `dsh web` when configured. Returns true when
   * the endpoint is reachable by the end of the attempt.
   */
  private async ensureReachable(_signal: AbortSignal): Promise<boolean> {
    if (await this.rpc.probe(1500)) return true;

    const discovered = await discoverHarnessBaseUrl();
    if (discovered) {
      this.rpc.updateBaseUrl(discovered);
      return true;
    }

    const launched = await HarnessAppLauncher.get().ensureRunning(
      this.baseUrl,
      this.launchConfig,
    );
    if (launched) {
      this.rpc.updateBaseUrl(this.baseUrl);
      return true;
    }
    return false;
  }

  private categorizeError(err: unknown): 'provider-session-missing' | 'transport' | 'provider' | 'unknown' {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('session-not-found') || message.includes('not found')) {
      return 'provider-session-missing';
    }
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('network')) {
      return 'transport';
    }
    return 'provider';
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        window.clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
