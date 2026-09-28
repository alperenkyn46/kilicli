import {
  runtimeAdapterError,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimeEvent,
  type EffectRequest,
  type EffectResolution,
  type RuntimeFailureStatus,
  type RuntimeMessage,
  type RuntimeSessionHandle,
  type RuntimeStatus,
  type RuntimeLifecycleSignal,
  type StartSessionOptions,
  RuntimeSessionClosedError,
} from "./adapter.js";

type SessionState = {
  id: string;
  bootstrap: StartSessionOptions["bootstrap"];
  tools: StartSessionOptions["tools"];
  closed: boolean;
  ready: boolean;
  interrupted: boolean;
  waiters: Array<() => void>;
  effectWaiters: Map<string, (resolution: EffectResolution) => void>;
  completedTurns: Set<string>;
};

export type MockFailurePoint = "status" | "start" | "ready" | "send";

export type MockRuntimeOptions = {
  harnessKey?: string;
  status?: RuntimeStatus;
  fail?: { status: RuntimeFailureStatus; at: MockFailurePoint; message?: string };
  /** When true, send waits until interrupt or close instead of completing. */
  openEnded?: boolean;
  effectRequest?: EffectRequest;
  terminalFailure?: RuntimeFailureStatus;
  lifecycleSignals?: RuntimeLifecycleSignal[];
  capabilities?: Partial<RuntimeCapabilities>;
};

const CAPABILITIES: RuntimeCapabilities = {
  supportsSessionResume: true,
  supportsTurnPauseResume: true,
  supportsToolInterception: true,
  supportsPreCompactionSignal: true,
  supportsSessionEndSignal: true,
  supportsStreaming: true,
  supportsInterrupt: true,
};

export class MockRuntimeAdapter implements RuntimeAdapter {
  readonly harnessKey: string;
  lastStartOptions: StartSessionOptions | null = null;
  providerSideEffectCount = 0;
  turnStartCount = 0;
  private readonly options: MockRuntimeOptions;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: MockRuntimeOptions = {}) {
    this.options = options;
    this.harnessKey = options.harnessKey ?? "mock";
  }

  capabilities(): RuntimeCapabilities {
    return { ...CAPABILITIES, ...this.options.capabilities };
  }

  async status(): Promise<RuntimeStatus> {
    this.throwIfPlanned("status");
    return this.options.status ?? "AVAILABLE";
  }

  async sessionHealth(handle: RuntimeSessionHandle): Promise<"alive" | "dead" | "unknown"> {
    return this.sessions.get(handle.adapterSessionId)?.closed ? "dead" : this.sessions.has(handle.adapterSessionId) ? "alive" : "unknown";
  }

  async start(options: StartSessionOptions): Promise<RuntimeSessionHandle> {
    if (!options.role.trim()) {
      throw new Error("role is required");
    }
    if (!options.bootstrap?.identity.orchestratorId || !options.bootstrap.doctrineText?.trim() || options.tools?.effectExecution !== "brokered_only") {
      throw new Error("bootstrap identity and tool surface are required");
    }
    this.throwIfPlanned("start");
    this.lastStartOptions = options;
    const id = crypto.randomUUID();
    this.sessions.set(id, { id, bootstrap: options.bootstrap, tools: options.tools, closed: false, ready: false, interrupted: false,
      waiters: [], effectWaiters: new Map(), completedTurns: new Set() });
    return { adapterSessionId: id, harnessKey: this.harnessKey };
  }

  async *send(handle: RuntimeSessionHandle, message: RuntimeMessage): AsyncIterable<RuntimeEvent> {
    this.throwIfPlanned("send");
    const session = this.requireOpen(handle);
    if (!session.ready) throw new Error("Runtime bootstrap is not ready");
    const turnKey = `${message.executionId}:${message.idempotencyKey}`;
    if (session.completedTurns.has(turnKey)) {
      yield { type: "completed", text: message.text };
      return;
    }
    this.turnStartCount += 1;
    yield { type: "started" };
    yield { type: "output", text: message.text };

    if (this.options.effectRequest) {
      const request = this.options.effectRequest;
      const resolution = new Promise<EffectResolution>((resolve) => session.effectWaiters.set(request.idempotencyKey, resolve));
      yield { type: "effect_requested", request };
      const result = await resolution;
      if (result.decision !== "allow") {
        yield { type: "failed", status: "FAILED", message: "Effect was not authorized" };
        return;
      }
    }

    for (const signal of this.options.lifecycleSignals ?? []) {
      yield { type: "lifecycle", signal, checkpointState: { phase: signal, completed: [], remaining: [], importantFiles: [], risks: [], notes: null },
        digest: { sourceCursor: `${turnKey}:${signal}`, sourceBytes: message.text, summary: `Runtime ${signal}`,
          observedDecisions: [], observedFindings: [], touchedArtifacts: [], verificationResult: null, openQuestions: [] } };
    }

    if (this.options.terminalFailure) {
      yield { type: "failed", status: this.options.terminalFailure, message: this.options.terminalFailure };
      return;
    }

    if (this.options.openEnded) {
      await this.waitForSignal(session);
      if (session.interrupted || session.closed) {
        yield { type: "interrupted" };
        return;
      }
    }

    session.completedTurns.add(turnKey);
    yield { type: "completed", text: message.text };
  }

  async ready(handle: RuntimeSessionHandle): Promise<void> {
    this.requireOpen(handle);
    this.throwIfPlanned("ready");
    this.requireOpen(handle).ready = true;
  }

  async resumeSession(handle: RuntimeSessionHandle): Promise<RuntimeSessionHandle> {
    if (!this.capabilities().supportsSessionResume) throw new Error("Session resume is unsupported");
    const session = this.requireOpen(handle);
    if (!session.ready) throw new Error("Runtime bootstrap is not ready");
    return handle;
  }

  async interrupt(handle: RuntimeSessionHandle): Promise<void> {
    const session = this.requireOpen(handle);
    session.interrupted = true;
    this.release(session);
  }

  async resolveEffect(handle: RuntimeSessionHandle, requestKey: string, resolution: EffectResolution): Promise<void> {
    const session = this.requireOpen(handle);
    const resolve = session.effectWaiters.get(requestKey);
    if (!resolve) throw new Error("Effect request is not pending");
    if (resolution.decision === "require_approval" && this.capabilities().supportsTurnPauseResume) return;
    session.effectWaiters.delete(requestKey);
    resolve(resolution.decision === "require_approval" ? { decision: "deny", reason: "Approval requires a retry" } : resolution);
  }

  async close(handle: RuntimeSessionHandle): Promise<void> {
    const session = this.sessions.get(handle.adapterSessionId);
    if (!session || session.closed) return;
    session.closed = true;
    this.release(session);
  }

  private throwIfPlanned(point: MockFailurePoint): void {
    const failure = this.options.fail;
    if (!failure || failure.at !== point) return;
    throw runtimeAdapterError(failure.status, failure.message ?? failure.status);
  }

  private requireOpen(handle: RuntimeSessionHandle): SessionState {
    if (handle.harnessKey !== this.harnessKey) {
      throw new Error(`Session belongs to harness ${handle.harnessKey}`);
    }
    const session = this.sessions.get(handle.adapterSessionId);
    if (!session || session.closed) {
      throw new RuntimeSessionClosedError(handle.adapterSessionId);
    }
    return session;
  }

  private waitForSignal(session: SessionState): Promise<void> {
    if (session.interrupted || session.closed) return Promise.resolve();
    return new Promise((resolve) => {
      session.waiters.push(resolve);
    });
  }

  private release(session: SessionState): void {
    const waiters = session.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}

export type AdapterConformanceHarness = {
  completing(): RuntimeAdapter;
  openEnded(): RuntimeAdapter;
  failing(status: RuntimeFailureStatus, at: MockFailurePoint): RuntimeAdapter;
  requestingEffect(): RuntimeAdapter;
  terminalFailure(status: RuntimeFailureStatus): RuntimeAdapter;
  withLifecycleSignals(): RuntimeAdapter;
  effectCount(adapter: RuntimeAdapter): number;
};

export function createMockConformanceHarness(harnessKey = "mock"): AdapterConformanceHarness {
  return {
    completing: () => new MockRuntimeAdapter({ harnessKey, status: "AVAILABLE" }),
    openEnded: () => new MockRuntimeAdapter({ harnessKey, status: "AVAILABLE", openEnded: true }),
    failing: (status, at) => new MockRuntimeAdapter({ harnessKey, fail: { status, at } }),
    requestingEffect: () => new MockRuntimeAdapter({ harnessKey, effectRequest: { idempotencyKey: "effect-1", action: "force_push", resource: "repo/main", description: "Force push" } }),
    terminalFailure: (status) => new MockRuntimeAdapter({ harnessKey, terminalFailure: status }),
    withLifecycleSignals: () => new MockRuntimeAdapter({ harnessKey, lifecycleSignals: ["pre_compaction", "session_ending"] }),
    effectCount: (adapter) => (adapter as MockRuntimeAdapter).providerSideEffectCount,
  };
}
