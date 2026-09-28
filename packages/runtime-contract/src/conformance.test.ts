import { createMockConformanceHarness } from "./mock.js";
import { defineRuntimeAdapterConformance } from "./conformance.js";
import { describe, expect, it } from "vitest";
import { MockRuntimeAdapter } from "./mock.js";

defineRuntimeAdapterConformance("mock", () => createMockConformanceHarness());

describe("mock bootstrap delivery", () => {
  it("receives doctrine, scoped task, and tool surface before readiness", async () => {
    const adapter = new MockRuntimeAdapter();
    const bootstrap = { doctrinePath: "identity/AGENTS.md", doctrineText: "Doctrine",
      identity: { orchestratorId: "orchestrator", kind: "project" as const, displayName: "Project Kılıç" },
      workspace: { id: "workspace", name: "Workspace", slug: "workspace" },
      project: { id: "project", name: "Project", slug: "project" },
      operation: { id: "operation", title: "Work", status: "active", language: null },
      task: { id: "task", title: "Review", status: "ready", acceptanceCriteria: null, language: null },
      checkpoint: null, policies: [], memories: [],
      runtime: { purpose: "worker" as const, role: "worker", executionNodeId: "node", correlationId: "correlation" } };
    const tools = { memory: true, workforce: false, effectExecution: "brokered_only" as const };
    const handle = await adapter.start({ role: "worker", bootstrap, tools });
    await adapter.ready(handle);
    expect(adapter.lastStartOptions?.bootstrap).toBe(bootstrap);
    expect(adapter.lastStartOptions?.tools).toBe(tools);
    await expect(adapter.start({ role: "worker", bootstrap: { ...bootstrap, doctrineText: "" }, tools })).rejects.toThrow(/bootstrap/);
  });
});
