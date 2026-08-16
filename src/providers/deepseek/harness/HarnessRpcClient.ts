import { execFile } from 'child_process';
import { randomUUID } from 'crypto';

/**
 * Minimal RPC client for the DeepSeek Harness desktop app's local API.
 *
 * Protocol (verified 2026-08, see deepseek-harness skill):
 *   POST http://127.0.0.1:<port>/api/<method>
 *   {"type":"client-request","rpcId":"<uuid>","method":"...","payload":{...}}
 *   → {"type":"server-response","rpcId":...,"result":{"ok":true,"value":...}}
 *
 * The desktop app binds a RANDOM port per launch (web --port 0), so callers
 * must discover it (settings, lsof, or probing) and tolerate restarts.
 */

export interface HarnessSessionInfo {
  readonly sessionId: string;
  readonly running: boolean;
  readonly blank: boolean;
  readonly updatedAt: number;
  readonly title?: string;
}

export interface HarnessHistoryEvent {
  readonly seq: number;
  readonly type: string;
  readonly sessionId?: string;
  readonly data?: {
    readonly content?: ReadonlyArray<{
      readonly type?: string;
      readonly text?: string;
    }>;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface HarnessMuxQuestion {
  readonly rpcId: string;
  readonly sessionId: string;
  readonly questions: ReadonlyArray<{
    readonly id: string;
    readonly question: string;
    readonly options?: ReadonlyArray<{
      readonly label: string;
      readonly description?: string;
    }>;
  }>;
}

export interface HarnessMuxFrame {
  readonly type: string;
  readonly rpcId?: string;
  readonly sessionId?: string;
  readonly questions?: HarnessMuxQuestion['questions'];
  readonly [key: string]: unknown;
}

interface RpcResponse<T = unknown> {
  readonly type: 'server-response';
  readonly rpcId: string;
  readonly result: {
    readonly ok: boolean;
    readonly value?: T;
    readonly error?: {
      readonly code?: string;
      readonly message?: string;
    };
  };
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3080';

/**
 * Discover the DeepSeek Harness desktop app's live port.
 *
 * The desktop app launches its embedded server with `--port 0` (random port
 * per restart). On macOS the port is observable via lsof by matching the
 * process name "DeepSeek". `pgrep -f` is deliberately avoided (it matches the
 * invoking shell's own command line and returns a bogus PID).
 */
export function discoverHarnessBaseUrl(): Promise<string | null> {
  return new Promise(resolve => {
    execFile('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      for (const line of stdout.split('\n')) {
        const match = line.match(/^DeepSeek\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+TCP\s+127\.0\.0\.1:(\d+)/);
        if (match) {
          resolve(`http://127.0.0.1:${match[1]}`);
          return;
        }
      }
      // Fallback: any DeepSeek process listing a localhost LISTEN socket.
      for (const line of stdout.split('\n')) {
        if (!line.includes('DeepSeek')) continue;
        const match = line.match(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/);
        if (match) {
          resolve(`http://127.0.0.1:${match[1]}`);
          return;
        }
      }
      resolve(null);
    });
  });
}

export class HarnessRpcClient {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  get url(): string {
    return this.baseUrl;
  }

  /** Update the endpoint (e.g. after discovering a new random port). */
  updateBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /** Probe the endpoint; returns true when the harness web UI is reachable. */
  async probe(timeoutMs = 2000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(this.baseUrl + '/', {
          signal: controller.signal,
          cache: 'no-store',
        });
        return res.status === 200;
      } finally {
        window.clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  private async request<T>(
    method: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const rpcId = randomUUID();
    const res = await fetch(this.baseUrl + '/api/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method,
        payload,
      }),
      signal,
      cache: 'no-store',
    });
    if (res.status === 404) {
      throw new Error(`RPC method not found: ${method}`);
    }
    if (!res.ok) {
      throw new Error(`RPC HTTP ${res.status} for ${method}`);
    }
    const body = (await res.json()) as RpcResponse<T>;
    if (!body.result.ok) {
      const err = body.result.error;
      throw new Error(
        `RPC ${method} failed: ${err?.message ?? 'unknown'} (${err?.code ?? 'no-code'})`,
      );
    }
    return body.result.value as T;
  }

  /** List sessions on the harness. */
  async listSessions(signal?: AbortSignal): Promise<HarnessSessionInfo[]> {
    const value = await this.request<{ items: HarnessSessionInfo[] }>(
      'session.list',
      {},
      signal,
    );
    return value.items ?? [];
  }

  /**
   * Create a new harness session. Verified: session.create accepts an
   * optional explicit sessionId and returns {sessionId, agentPreset}.
   */
  async createSession(
    options: { sessionId?: string } = {},
    signal?: AbortSignal,
  ): Promise<{ sessionId: string; agentPreset?: string }> {
    const payload: Record<string, unknown> = {};
    if (options.sessionId) payload.sessionId = options.sessionId;
    return this.request<{ sessionId: string; agentPreset?: string }>(
      'session.create',
      payload,
      signal,
    );
  }

  /** Fetch session history events. maxMessages is NOT a hard limit. */
  async fetchHistory(
    sessionId: string,
    maxMessages = 500,
    signal?: AbortSignal,
  ): Promise<HarnessHistoryEvent[]> {
    const value = await this.request<{ events: unknown[] }>(
      'session.history',
      { sessionId, maxMessages },
      signal,
    );
    return (value.events ?? []).map(raw => {
      const unwrapped =
        raw && typeof raw === 'object' && 'event' in raw
          ? (raw).event
          : raw;
      return unwrapped as HarnessHistoryEvent;
    });
  }

  /** Submit a user message to the agent inbox (queue mode). */
  async prompt(
    sessionId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<{ accepted: boolean }> {
    return this.request<{ accepted: boolean }>(
      'session.prompt',
      { sessionId, content: [{ type: 'text', text }], mode: 'queue' },
      signal,
    );
  }

  /** Answer a pending ask_user_question (rpcId observed via events.mux). */
  async respond(
    rpcId: string,
    sessionId: string,
    answers: ReadonlyArray<{ id: string; selected: string[] }>,
    signal?: AbortSignal,
  ): Promise<{ accepted: boolean; reason?: string }> {
    return this.request<{ accepted: boolean; reason?: string }>(
      'respond',
      {
        rpcId,
        result: {
          ok: true,
          value: {
            sessionId,
            answer: { answers },
          },
        },
      },
      signal,
    );
  }

  /**
   * Open the events mux socket. On connect the server replays pending
   * question/requested and approval/requested frames — this is the ONLY way
   * to observe ask_user_question rpcIds.
   */
  openMux(): HarnessMuxSocket {
    const wsUrl = this.baseUrl
      .replace(/^http/, 'ws')
      .replace(/\/+$/, '');
    return new HarnessMuxSocket(wsUrl + '/api/events.mux');
  }
}

export class HarnessMuxSocket {
  private ws: WebSocket | null = null;
  private pendingQuestions = new Map<string, HarnessMuxQuestion>();
  private reconnectTimer: number | null = null;
  private disposed = false;

  /** (question) => void listeners; called for replayed + live questions. */
  onQuestion: ((question: HarnessMuxQuestion) => void) | null = null;
  onOpen: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly reconnectDelayMs = 5000,
  ) {}

  get questions(): ReadonlyMap<string, HarnessMuxQuestion> {
    return this.pendingQuestions;
  }

  /** Remove a resolved question from the pending map. */
  removeQuestion(rpcId: string): void {
    this.pendingQuestions.delete(rpcId);
  }

  connect(): void {
    if (this.disposed || this.ws) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.onError?.(`WebSocket connect failed: ${String(err)}`);
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.onOpen?.();
    };
    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const frame = JSON.parse(String(ev.data)) as HarnessMuxFrame;
        this.handleFrame(frame);
      } catch {
        // Ignore malformed frames.
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (!this.disposed) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.onError?.('events.mux socket error');
    };
  }

  private handleFrame(frame: HarnessMuxFrame): void {
    if (frame.type === 'question/requested' && frame.rpcId && frame.sessionId) {
      const question: HarnessMuxQuestion = {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        questions: frame.questions ?? [],
      };
      this.pendingQuestions.set(frame.rpcId, question);
      this.onQuestion?.(question);
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) this.connect();
    }, this.reconnectDelayMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.pendingQuestions.clear();
  }
}
