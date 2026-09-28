import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import { assertMemoryScope, assertNoDependencyCycle, assertOrchestratorShape } from "./invariants.js";

describe("orchestrator shape", () => {
  it("keeps workspace and project orchestrators distinct", () => {
    expect(() => assertOrchestratorShape({ kind: "workspace", projectId: null })).not.toThrow();
    expect(() =>
      assertOrchestratorShape({ kind: "project", projectId: newId<"ProjectId">() }),
    ).not.toThrow();
    expect(() =>
      assertOrchestratorShape({ kind: "workspace", projectId: newId<"ProjectId">() }),
    ).toThrow(/workspace orchestrator/);
    expect(() => assertOrchestratorShape({ kind: "project", projectId: null })).toThrow(
      /project orchestrator/,
    );
  });
});

describe("memory scope", () => {
  it("rejects project details on a global record", () => {
    expect(() =>
      assertMemoryScope({
        scopeType: "global",
        ownerUserId: null,
        workspaceId: newId<"WorkspaceId">(),
        projectId: null,
        operationId: null,
        taskId: null,
        agentRunId: null,
      }),
    ).toThrow(/System-global memory/);
  });
});

describe("task dependencies", () => {
  it("rejects cycles", () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(() =>
      assertNoDependencyCycle([{ taskId: a, dependsOnTaskId: b }], {
        taskId: b,
        dependsOnTaskId: a,
      }),
    ).toThrow(/cycle/i);
  });
});
