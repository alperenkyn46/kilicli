import { runtimeAdapterError, type RuntimeAdapter, type RuntimeStatus } from "@kilic/runtime-contract";
import type { RuntimeProcessPort, RuntimeStatusProbe } from "@kilic/kernel";

/** Execution-plane registry. Unknown harness keys are OFFLINE. Live handles die with the process. */
export class RuntimeAdapterRegistry implements RuntimeStatusProbe, RuntimeProcessPort {
  private readonly adapters = new Map<string, RuntimeAdapter>();
  private readonly liveSessions = new Map<string, string>();

  register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.harnessKey, adapter);
  }

  async status(harnessKey: string): Promise<RuntimeStatus> {
    const adapter = this.adapters.get(harnessKey);
    if (!adapter) return "OFFLINE";
    return adapter.status();
  }

  hasAdapterSession(adapterSessionId: string): boolean {
    return this.liveSessions.has(adapterSessionId);
  }

  async open(input: { harnessKey: string; modelKey: string; role: string; cwd?: string }): Promise<{ adapterSessionId: string }> {
    const adapter = this.adapters.get(input.harnessKey);
    if (!adapter) throw runtimeAdapterError("OFFLINE", `No adapter is registered for ${input.harnessKey}`);
    const handle = await adapter.start({ role: input.role, modelKey: input.modelKey, cwd: input.cwd });
    this.liveSessions.set(handle.adapterSessionId, input.harnessKey);
    return { adapterSessionId: handle.adapterSessionId };
  }

  async close(input: { harnessKey: string; adapterSessionId: string }): Promise<void> {
    const adapter = this.adapters.get(input.harnessKey);
    this.liveSessions.delete(input.adapterSessionId);
    if (!adapter) return;
    await adapter.close({ adapterSessionId: input.adapterSessionId, harnessKey: input.harnessKey });
  }
}
