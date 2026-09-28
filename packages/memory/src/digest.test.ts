import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { newId } from "@kilic/shared";
import type { ExecutionJob } from "@kilic/domain";
import { ExecutionDigestService, proposeMemoryCandidate } from "./digest.js";

describe("execution digest ingestion", () => {
  it("queues a source range durably and produces one digest for repeated ingestion", async () => {
    const repos = createInMemoryRepositories();
    let now = new Date("2026-09-28T00:00:00Z");
    const job: ExecutionJob = {
      id: newId<"ExecutionJobId">(), idempotencyKey: "once", requestFingerprint: "once",
      runtimeSessionId: newId<"RuntimeSessionId">(), agentRunId: null,
      orchestratorId: newId<"OrchestratorId">(), executionNodeId: newId<"ExecutionNodeId">(),
      workspaceId: newId<"WorkspaceId">(), projectId: null, operationId: null,
      taskId: null, repositoryId: null, correlationId: newId<"CorrelationId">(), causationId: null,
      handoffCheckpointId: null, pendingApprovalId: null, status: "completed", claimEpoch: "boot", leaseUntil: null,
      startedAt: now, endedAt: now, outcome: "completed", createdAt: now, updatedAt: now,
    };
    await repos.executionJobs.insert(job);
    const service = new ExecutionDigestService(repos, () => now);
    const input = { executionJobId: job.id, sourceBytes: "bounded-runtime-output", sourceCursor: "0:22",
      observation: { summary: "Completed review", observedDecisions: [], observedFindings: ["One issue"],
        touchedArtifacts: ["README.md"], verificationResult: "pass", openQuestions: [] } };
    const first = await service.enqueue(input);
    const repeated = await service.enqueue(input);
    expect(repeated.id).toBe(first.id);
    const digest = await service.processNext();
    expect(digest?.summary).toBe("Completed review");
    expect(await service.processNext()).toBeNull();
    expect((await repos.executionDigests.getBySource(job.id, first.sourceDigest))?.id).toBe(digest?.id);
    const differentRange = await service.enqueue({ ...input, sourceCursor: "23:45" });
    expect(differentRange.sourceDigest).not.toBe(first.sourceDigest);
    const originalInsert = repos.executionDigests.insert;
    repos.executionDigests.insert = async () => { throw new Error("ingestion unavailable"); };
    expect(await service.processNext()).toBeNull();
    expect((await repos.digestIngestions.get(differentRange.id))?.attempts).toBe(1);
    repos.executionDigests.insert = originalInsert;
    now = new Date(now.getTime() + 3 * 60_000);
    expect((await service.processNext())?.sourceDigest).toBe(differentRange.sourceDigest);
    const crashed = await service.enqueue({ ...input, sourceCursor: "46:68" });
    const firstClaim = await repos.digestIngestions.claimDue(now);
    expect(firstClaim?.id).toBe(crashed.id);
    now = new Date(now.getTime() + 6 * 60_000);
    expect((await service.processNext())?.sourceDigest).toBe(crashed.sourceDigest);
    await expect(repos.digestIngestions.complete(crashed.id, digest!.id, firstClaim!.attempts, now)).rejects.toThrow(/changed/);
    const candidate = proposeMemoryCandidate({ sourceDigestId: digest!.id, kind: "finding", title: "Issue", body: "Observed", reason: "Review" });
    expect(candidate.status).toBe("proposed");
  });
});
