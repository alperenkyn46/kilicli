import { describe, expect, it } from "vitest";
import { MockRuntimeAdapter } from "@kilic/runtime-contract";
import { RuntimeAdapterRegistry } from "./registry.js";

describe("runtime mediation gate", () => {
  it("refuses a runtime that cannot intercept effect-capable tools", async () => {
    const registry = new RuntimeAdapterRegistry();
    registry.register(new MockRuntimeAdapter({ harnessKey: "mock", capabilities: { supportsToolInterception: false } }));
    await expect(registry.open({ harnessKey: "mock", modelKey: "default", role: "worker",
      bootstrap: { doctrinePath: "identity/AGENTS.md", doctrineText: "Doctrine",
        identity: { orchestratorId: "orchestrator", kind: "project", displayName: "Project" },
        workspace: { id: "workspace", name: "Workspace", slug: "workspace" }, project: null,
        operation: null, task: null, checkpoint: null, policies: [], memories: [],
        runtime: { purpose: "worker", role: "worker", executionNodeId: "node", correlationId: "correlation" } },
      tools: { memory: false, workforce: false, effectExecution: "brokered_only" },
    })).rejects.toThrow(/mediated streaming execution/);
  });

  it("reattaches a live session through the adapter's resume capability", async () => {
    const adapter = new MockRuntimeAdapter({ harnessKey: "mock" });
    const first = new RuntimeAdapterRegistry();
    first.register(adapter);
    const handle = await first.open({ harnessKey: "mock", modelKey: "default", role: "worker",
      bootstrap: { doctrinePath: "identity/AGENTS.md", doctrineText: "Doctrine",
        identity: { orchestratorId: "orchestrator", kind: "project", displayName: "Project" },
        workspace: { id: "workspace", name: "Workspace", slug: "workspace" }, project: null,
        operation: null, task: null, checkpoint: null, policies: [], memories: [],
        runtime: { purpose: "worker", role: "worker", executionNodeId: "node", correlationId: "correlation" } },
      tools: { memory: false, workforce: false, effectExecution: "brokered_only" },
    });
    const restarted = new RuntimeAdapterRegistry();
    restarted.register(adapter);
    await restarted.resumeSession({ harnessKey: "mock", adapterSessionId: handle.adapterSessionId });
    expect(restarted.hasAdapterSession(handle.adapterSessionId)).toBe(true);
    expect(await restarted.sessionHealth({ harnessKey: "mock", adapterSessionId: handle.adapterSessionId })).toBe("alive");
  });
});
