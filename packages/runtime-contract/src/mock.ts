import {
  runtimeAdapterError,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimeEvent,
  type RuntimeFailureStatus,
  type RuntimeMessage,
  type RuntimeSessionHandle,
  type RuntimeStatus,
  type StartSessionOptions,
  RuntimeSessionClosedError,
} from "./adapter.js";

type SessionState = {
  id: string;
  closed: boolean;
  interrupted: boolean;
  waiters: Array<() => void>;
};

export type MockFailurePoint = "status" | "start" | "send";

export type MockRuntimeOptions = {
  harnessKey?: string;
  status?: RuntimeStatus;
  fail?: { status: RuntimeFailureStatus; at: MockFailurePoint; message?: string };
  /** When true, send waits until interrupt or close instead of completing. */
  openEnded?: boolean;
};

const CAPABILITIES: RuntimeCapabilities = {
  streaming: true,
  interrupt: true,
  tools: true,
};

export class MockRuntimeAdapter implements RuntimeAdapter {
  readonly harnessKey: string;
  private readonly options: MockRuntimeOptions;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: MockRuntimeOptions = {}) {
    this.options = options;
    this.harnessKey = options.harnessKey ?? "mock";
  }

  capabilities(): RuntimeCapabilities {
    return CAPABILITIES;
  }

  async status(): Promise<RuntimeStatus> {
    this.throwIfPlanned("status");
    return this.options.status ?? "AVAILABLE";
  }

  async start(options: StartSessionOptions): Promise<RuntimeSessionHandle> {
    if (!options.role.trim()) {
      throw new Error("role is required");
    }
    this.throwIfPlanned("start");
    const id = crypto.randomUUID();
    this.sessions.set(id, { id, closed: false, interrupted: false, waiters: [] });
    return { adapterSessionId: id, harnessKey: this.harnessKey };
  }

  async *send(handle: RuntimeSessionHandle, message: RuntimeMessage): AsyncIterable<RuntimeEvent> {
    this.throwIfPlanned("send");
    const session = this.requireOpen(handle);
    yield { type: "output", text: message.text };

    if (this.options.openEnded) {
      await this.waitForSignal(session);
      if (session.interrupted || session.closed) {
        yield { type: "interrupted" };
        return;
      }
    }

    yield { type: "completed", text: message.text };
  }

  async interrupt(handle: RuntimeSessionHandle): Promise<void> {
    const session = this.requireOpen(handle);
    session.interrupted = true;
    this.release(session);
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
};

export function createMockConformanceHarness(harnessKey = "mock"): AdapterConformanceHarness {
  return {
    completing: () => new MockRuntimeAdapter({ harnessKey, status: "AVAILABLE" }),
    openEnded: () => new MockRuntimeAdapter({ harnessKey, status: "AVAILABLE", openEnded: true }),
    failing: (status, at) => new MockRuntimeAdapter({ harnessKey, fail: { status, at } }),
  };
}
