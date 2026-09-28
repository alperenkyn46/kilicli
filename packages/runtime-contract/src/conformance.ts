import { describe, expect, it } from "vitest";
import { RuntimeAdapterError, RuntimeSessionClosedError } from "./adapter.js";
import type { AdapterConformanceHarness } from "./mock.js";
import type { RuntimeAdapter, RuntimeFailureStatus } from "./adapter.js";

const startRequest = {
  role: "worker",
  bootstrap: {
    doctrinePath: "identity/AGENTS.md",
    doctrineText: "Persistent Kılıç identity doctrine",
    identity: { orchestratorId: "orchestrator", kind: "project" as const, displayName: "Project Kılıç" },
    workspace: { id: "workspace", name: "Workspace", slug: "workspace" },
    project: { id: "project", name: "Project", slug: "project" },
    operation: null,
    task: null,
    checkpoint: null,
    policies: [],
    memories: [],
    runtime: { purpose: "worker" as const, role: "worker", executionNodeId: "node", correlationId: "correlation" },
  },
  tools: { memory: false, workforce: false, effectExecution: "brokered_only" as const },
};

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

async function startReady(adapter: RuntimeAdapter) {
  const handle = await adapter.start(startRequest);
  await adapter.ready(handle);
  return handle;
}

/**
 * Behavioral suite every runtime adapter must pass.
 * Provider harnesses supply the fixtures; the assertions stay here.
 */
export function defineRuntimeAdapterConformance(
  name: string,
  create: () => AdapterConformanceHarness,
): void {
  describe(`${name} runtime adapter conformance`, () => {
    it("starts a session", async () => {
      const adapter = create().completing();
      const handle = await adapter.start(startRequest);
      expect(handle.adapterSessionId).toBeTruthy();
      expect(handle.harnessKey).toBe(adapter.harnessKey);
    });

    it("requires bootstrap readiness before actual execution", async () => {
      const adapter = create().completing();
      const handle = await adapter.start(startRequest);
      await expect(collect(adapter.send(handle, { text: "early", executionId: "job", idempotencyKey: "early" }))).rejects.toThrow(/bootstrap|ready/i);
      await adapter.ready(handle);
      expect((await collect(adapter.send(handle, { text: "started", executionId: "job", idempotencyKey: "started" }))).at(-1)).toMatchObject({ type: "completed" });
    });

    it("declares the required provider-neutral capabilities", () => {
      const caps = create().completing().capabilities();
      expect(caps).toEqual({
        supportsSessionResume: expect.any(Boolean), supportsTurnPauseResume: expect.any(Boolean),
        supportsToolInterception: true, supportsPreCompactionSignal: expect.any(Boolean),
        supportsSessionEndSignal: expect.any(Boolean), supportsStreaming: true, supportsInterrupt: true,
      });
    });

    it("streams output and completes a normal turn", async () => {
      const adapter = create().completing();
      const handle = await startReady(adapter);
      const events = await collect(adapter.send(handle, { text: "ping", executionId: "job", idempotencyKey: "turn" }));
      expect(events[0]).toEqual({ type: "started" });
      expect(events[1]).toEqual({ type: "output", text: "ping" });
      expect(events.at(-1)).toMatchObject({ type: "completed" });
    });

    it("interrupts an in-flight turn", async () => {
      const adapter = create().openEnded();
      const handle = await startReady(adapter);
      const iterator = adapter.send(handle, { text: "hold", executionId: "job", idempotencyKey: "turn" })[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toMatchObject({ value: { type: "started" } });
      await expect(iterator.next()).resolves.toMatchObject({
        value: { type: "output", text: "hold" },
      });
      const pending = iterator.next();
      await adapter.interrupt(handle);
      await expect(pending).resolves.toMatchObject({ value: { type: "interrupted" } });
    });

    it("normalizes a runtime failure", async () => {
      await expectNormalized(create, "FAILED", "send");
    });

    it("reports a terminal failed outcome without claiming completion", async () => {
      const adapter = create().terminalFailure("FAILED");
      const handle = await startReady(adapter);
      const events = await collect(adapter.send(handle, { text: "x", executionId: "job", idempotencyKey: "failed" }));
      expect(events[0]).toEqual({ type: "started" });
      expect(events.at(-1)).toMatchObject({ type: "failed", status: "FAILED" });
      expect(events.some((event) => event.type === "completed")).toBe(false);
    });

    it("normalizes an auth failure", async () => {
      await expectNormalized(create, "AUTH_REQUIRED", "start");
    });

    it("normalizes a rate limit", async () => {
      await expectNormalized(create, "RATE_LIMITED", "status");
    });

    it("normalizes quota exhaustion", async () => {
      await expectNormalized(create, "QUOTA_EXHAUSTED", "start");
    });

    it("reports readiness failure before the session can run", async () => {
      const adapter = create().failing("FAILED", "ready");
      const handle = await adapter.start(startRequest);
      await expect(adapter.ready(handle)).rejects.toBeInstanceOf(RuntimeAdapterError);
    });

    it("closes a session", async () => {
      const adapter = create().completing();
      const handle = await startReady(adapter);
      await adapter.close(handle);
      await expect(collect(adapter.send(handle, { text: "after", executionId: "job", idempotencyKey: "turn" }))).rejects.toBeInstanceOf(
        RuntimeSessionClosedError,
      );
    });

    it("waits for an explicit broker decision before an effect proceeds", async () => {
      const fixture = create();
      const adapter = fixture.requestingEffect();
      const handle = await startReady(adapter);
      const iterator = adapter.send(handle, { text: "effect", executionId: "job", idempotencyKey: "turn" })[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.next();
      const request = await iterator.next();
      expect(request.value).toMatchObject({ type: "effect_requested", request: { action: "force_push" } });
      expect(fixture.effectCount(adapter)).toBe(0);
      await adapter.resolveEffect(handle, "effect-1", { decision: "deny", reason: "Policy" });
      await expect(iterator.next()).resolves.toMatchObject({ value: { type: "failed" } });
      expect(fixture.effectCount(adapter)).toBe(0);
    });

    it("pauses and resumes the same logical turn when approval is required", async () => {
      const fixture = create();
      const adapter = fixture.requestingEffect();
      if (!adapter.capabilities().supportsTurnPauseResume) return;
      const handle = await startReady(adapter);
      const message = { text: "effect", executionId: "job", idempotencyKey: "turn" };
      const iterator = adapter.send(handle, message)[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.next();
      await expect(iterator.next()).resolves.toMatchObject({ value: { type: "effect_requested" } });
      await adapter.resolveEffect(handle, "effect-1", { decision: "require_approval", approvalId: "approval" });
      expect(fixture.effectCount(adapter)).toBe(0);
      await adapter.resolveEffect(handle, "effect-1", { decision: "allow", grantId: "grant" });
      await expect(iterator.next()).resolves.toMatchObject({ value: { type: "completed" } });
      expect(fixture.effectCount(adapter)).toBe(0);
      expect((await collect(adapter.send(handle, message))).at(-1)).toMatchObject({ type: "completed" });
      expect(fixture.effectCount(adapter)).toBe(0);
      await expect(adapter.resolveEffect(handle, "effect-1", { decision: "allow", grantId: "grant" })).rejects.toThrow(/pending/);
    });

    it("reports session health and resumes only when supported", async () => {
      const adapter = create().completing();
      const handle = await startReady(adapter);
      expect(await adapter.sessionHealth(handle)).toBe("alive");
      if (adapter.capabilities().supportsSessionResume) expect(await adapter.resumeSession(handle)).toEqual(handle);
      await adapter.close(handle);
      expect(await adapter.sessionHealth(handle)).toBe("dead");
    });

    it("emits pre-compaction and session-end signals when supported", async () => {
      const adapter = create().withLifecycleSignals();
      const handle = await startReady(adapter);
      const events = await collect(adapter.send(handle, { text: "context", executionId: "job", idempotencyKey: "turn" }));
      const lifecycle = events.filter((event) => event.type === "lifecycle");
      const signals = lifecycle.map((event) => event.signal);
      if (adapter.capabilities().supportsPreCompactionSignal) expect(signals).toContain("pre_compaction");
      if (adapter.capabilities().supportsSessionEndSignal) expect(signals).toContain("session_ending");
      for (const event of lifecycle) {
        expect(event.checkpointState?.phase).toBeTruthy();
        expect(event.digest?.sourceCursor).toBeTruthy();
        expect(event.digest?.summary).toBeTruthy();
      }
    });
  });
}

async function expectNormalized(
  create: () => AdapterConformanceHarness,
  status: RuntimeFailureStatus,
  at: "status" | "start" | "send",
): Promise<void> {
  const adapter = create().failing(status, at);
  const attempt = async () => {
    if (at === "status") return adapter.status();
    if (at === "start") return adapter.start(startRequest);
    const handle = await startReady(adapter);
    return collect(adapter.send(handle, { text: "x", executionId: "job", idempotencyKey: "turn" }));
  };

  try {
    await attempt();
    throw new Error(`expected ${status}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeAdapterError);
    const runtimeError = error as RuntimeAdapterError;
    expect(runtimeError.status).toBe(status);
    expect(runtimeError.message.toLowerCase()).not.toContain("claude");
    expect(runtimeError.message.toLowerCase()).not.toContain("codex");
    expect(runtimeError.message.toLowerCase()).not.toContain("cursor");
  }
}
