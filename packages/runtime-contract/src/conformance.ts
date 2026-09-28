import { describe, expect, it } from "vitest";
import { RuntimeAdapterError, RuntimeSessionClosedError } from "./adapter.js";
import type { AdapterConformanceHarness } from "./mock.js";
import type { RuntimeFailureStatus } from "./adapter.js";

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
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
      const handle = await adapter.start({ role: "worker" });
      expect(handle.adapterSessionId).toBeTruthy();
      expect(handle.harnessKey).toBe(adapter.harnessKey);
    });

    it("streams output and completes a normal turn", async () => {
      const adapter = create().completing();
      const handle = await adapter.start({ role: "worker" });
      const events = await collect(adapter.send(handle, { text: "ping" }));
      expect(events[0]).toEqual({ type: "output", text: "ping" });
      expect(events.at(-1)).toMatchObject({ type: "completed" });
    });

    it("interrupts an in-flight turn", async () => {
      const adapter = create().openEnded();
      const handle = await adapter.start({ role: "worker" });
      const iterator = adapter.send(handle, { text: "hold" })[Symbol.asyncIterator]();
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

    it("normalizes an auth failure", async () => {
      await expectNormalized(create, "AUTH_REQUIRED", "start");
    });

    it("normalizes a rate limit", async () => {
      await expectNormalized(create, "RATE_LIMITED", "status");
    });

    it("normalizes quota exhaustion", async () => {
      await expectNormalized(create, "QUOTA_EXHAUSTED", "start");
    });

    it("closes a session", async () => {
      const adapter = create().completing();
      const handle = await adapter.start({ role: "worker" });
      await adapter.close(handle);
      await expect(collect(adapter.send(handle, { text: "after" }))).rejects.toBeInstanceOf(
        RuntimeSessionClosedError,
      );
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
    if (at === "start") return adapter.start({ role: "worker" });
    const handle = await adapter.start({ role: "worker" });
    return collect(adapter.send(handle, { text: "x" }));
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
