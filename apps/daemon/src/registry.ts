import { runtimeAdapterError, type RuntimeAdapter, type RuntimeStatus, type BootstrapContext, type ToolSurface, type RuntimeMessage, type RuntimeEvent, type EffectResolution, type RuntimeCapabilities } from "@kilic/runtime-contract";
import type { RuntimeProcessPort, RuntimeStatusProbe } from "@kilic/kernel";

/** Execution-plane registry. Unknown harness keys are OFFLINE. Live handles die with the process. */
export class RuntimeAdapterRegistry implements RuntimeStatusProbe, RuntimeProcessPort {
  private readonly adapters = new Map<string, RuntimeAdapter>();
  private readonly liveSessions = new Map<string, string>();

  register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.harnessKey, adapter);
  }

  capabilities(harnessKey: string): RuntimeCapabilities {
    const adapter = this.adapters.get(harnessKey);
    if (!adapter) throw runtimeAdapterError("OFFLINE", "Runtime adapter is not registered");
    return adapter.capabilities();
  }

  async status(harnessKey: string): Promise<RuntimeStatus> {
    const adapter = this.adapters.get(harnessKey);
    if (!adapter) return "OFFLINE";
    return adapter.status();
  }

  hasAdapterSession(adapterSessionId: string): boolean {
    return this.liveSessions.has(adapterSessionId);
  }

  async sessionHealth(input: { harnessKey: string; adapterSessionId: string }): Promise<"alive" | "dead" | "unknown"> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter || this.liveSessions.get(input.adapterSessionId) !== input.harnessKey) return "unknown";
    return adapter.sessionHealth({ harnessKey: input.harnessKey, adapterSessionId: input.adapterSessionId });
  }

  async resumeSession(input: { harnessKey: string; adapterSessionId: string }): Promise<void> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter || !adapter.capabilities().supportsSessionResume) {
      throw runtimeAdapterError("OFFLINE", "Runtime session cannot be resumed");
    }
    const handle = await adapter.resumeSession({ harnessKey: input.harnessKey, adapterSessionId: input.adapterSessionId });
    if (handle.harnessKey !== input.harnessKey || handle.adapterSessionId !== input.adapterSessionId) {
      throw runtimeAdapterError("OFFLINE", "Runtime resumed a different session");
    }
    await adapter.ready(handle);
    this.liveSessions.set(handle.adapterSessionId, input.harnessKey);
  }

  async open(input: { harnessKey: string; modelKey: string; role: string; cwd?: string; bootstrap?: BootstrapContext; tools?: ToolSurface }): Promise<{ adapterSessionId: string }> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter) throw runtimeAdapterError("OFFLINE", `No adapter is registered for ${input.harnessKey}`);
    if (!input.bootstrap || input.tools?.effectExecution !== "brokered_only") throw new Error("Bootstrap and brokered tool surface are required before opening a runtime");
    const capabilities = adapter.capabilities();
    if (!capabilities.supportsToolInterception || !capabilities.supportsStreaming || !capabilities.supportsInterrupt) {
      throw new Error("Adapter cannot satisfy the mediated streaming execution contract");
    }
    const handle = await adapter.start({ role: input.role, modelKey: input.modelKey, cwd: input.cwd, bootstrap: input.bootstrap, tools: input.tools });
    try { await adapter.ready(handle); }
    catch (error) { await adapter.close(handle).catch(() => undefined); throw error; }
    this.liveSessions.set(handle.adapterSessionId, input.harnessKey);
    return { adapterSessionId: handle.adapterSessionId };
  }

  async close(input: { harnessKey: string; adapterSessionId: string }): Promise<void> {
    const adapter = this.adapters.get(input.harnessKey);
    this.liveSessions.delete(input.adapterSessionId);
    if (!adapter) return;
    await adapter.close({ adapterSessionId: input.adapterSessionId, harnessKey: input.harnessKey });
  }

  send(input: { harnessKey: string; adapterSessionId: string; message: RuntimeMessage }): AsyncIterable<RuntimeEvent> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter || this.liveSessions.get(input.adapterSessionId) !== input.harnessKey) {
      throw runtimeAdapterError("OFFLINE", "Adapter session is not live on this node");
    }
    return adapter.send({ harnessKey: input.harnessKey, adapterSessionId: input.adapterSessionId }, input.message);
  }

  async resolveEffect(input: { harnessKey: string; adapterSessionId: string; requestKey: string; resolution: EffectResolution }): Promise<void> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter || this.liveSessions.get(input.adapterSessionId) !== input.harnessKey) throw runtimeAdapterError("OFFLINE", "Adapter session is not live on this node");
    await adapter.resolveEffect({ harnessKey: input.harnessKey, adapterSessionId: input.adapterSessionId }, input.requestKey, input.resolution);
  }

  async interrupt(input: { harnessKey: string; adapterSessionId: string }): Promise<void> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter || this.liveSessions.get(input.adapterSessionId) !== input.harnessKey) return;
    await adapter.interrupt({ harnessKey: input.harnessKey, adapterSessionId: input.adapterSessionId });
  }
}
