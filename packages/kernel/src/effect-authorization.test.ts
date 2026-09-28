import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { newId } from "@kilic/shared";
import type { ExecutionJob, ScopedToolPrincipal } from "@kilic/domain";
import { EffectAuthorization } from "./effect-authorization.js";

describe("execution effect authorization", () => {
  it("binds an approval and one-use grant to the exact running job, principal, action, and resource", async () => {
    const repos = createInMemoryRepositories();
    const now = new Date("2026-09-28T00:00:00Z");
    const job: ExecutionJob = {
      id: newId<"ExecutionJobId">(), idempotencyKey: "turn-1", requestFingerprint: "turn-1",
      runtimeSessionId: newId<"RuntimeSessionId">(), agentRunId: newId<"AgentRunId">(),
      orchestratorId: newId<"OrchestratorId">(), executionNodeId: newId<"ExecutionNodeId">(),
      workspaceId: newId<"WorkspaceId">(), projectId: newId<"ProjectId">(),
      operationId: newId<"OperationId">(), taskId: newId<"TaskId">(), repositoryId: null,
      correlationId: newId<"CorrelationId">(), causationId: null, handoffCheckpointId: null, pendingApprovalId: null,
      status: "running", claimEpoch: "boot-1", leaseUntil: new Date(now.getTime() + 60_000),
      startedAt: now, endedAt: null, outcome: null, createdAt: now, updatedAt: now,
    };
    await repos.executionJobs.insert(job);
    const principal: ScopedToolPrincipal = { kind: "tool", executionJobId: job.id, agentRunId: job.agentRunId,
      workspaceId: job.workspaceId, projectId: job.projectId, operationId: job.operationId, taskId: job.taskId };
    const auth = new EffectAuthorization(repos, () => now);
    const request = { idempotencyKey: "effect-1", action: "force_push", resource: "repo/main", description: "Rewrite main" };
    const pending = await auth.authorize(principal, job.id, request);
    expect(pending.decision).toBe("require_approval");
    if (pending.decision !== "require_approval") throw new Error("expected approval");
    await expect(auth.authorize(principal, job.id, { ...request, resource: "repo/other" })).rejects.toThrow(/changed meaning/);
    await repos.approvals.decide(pending.approvalId as import("@kilic/domain").ApprovalId, "approved", now);
    const granted = await auth.authorize(principal, job.id, request);
    expect(granted.decision).toBe("allow");
    expect((await auth.authorize(principal, job.id, request)).decision).toBe("deny");
    await expect(auth.authorize({ ...principal, workspaceId: newId<"WorkspaceId">() }, job.id, request)).rejects.toThrow(/outside/);
  });
});
