import { createHash } from "node:crypto";
import { DomainError, newId, type Clock } from "@kilic/shared";
import type { DigestIngestion, ExecutionDigest, ExecutionDigestId, ExecutionJobId, Repositories } from "@kilic/domain";

export type DigestObservation = Pick<ExecutionDigest,
  "summary" | "observedDecisions" | "observedFindings" | "touchedArtifacts" | "verificationResult" | "openQuestions">;

export type MemoryCandidate = {
  sourceDigestId: ExecutionDigestId;
  kind: "memory" | "decision" | "finding";
  title: string;
  body: string;
  reason: string;
  status: "proposed";
};

/** A candidate is never a canonical memory write. Review/distillation is a separate step. */
export function proposeMemoryCandidate(input: Omit<MemoryCandidate, "status">): MemoryCandidate {
  if (!input.title.trim() || !input.body.trim() || !input.reason.trim()) throw new DomainError("INVALID_TEXT", "Memory candidate needs title, body, and reason");
  return { ...input, status: "proposed" };
}

export class ExecutionDigestService {
  constructor(private readonly repos: Repositories, private readonly clock: Clock) {}

  async enqueue(input: {
    executionJobId: ExecutionJobId;
    sourceBytes: string;
    sourceCursor?: string | null;
    observation: DigestObservation;
  }): Promise<DigestIngestion> {
    const job = await this.repos.executionJobs.get(input.executionJobId);
    if (!job) throw new DomainError("NOT_FOUND", "Digest source execution was not found");
    if (!input.sourceBytes) throw new DomainError("INVALID_TEXT", "Digest source range is required");
    if (!input.observation.summary.trim()) throw new DomainError("INVALID_TEXT", "Digest summary is required");
    const now = this.clock();
    const sourceDigest = createHash("sha256").update(input.sourceCursor ?? "").update("\0").update(input.sourceBytes).digest("hex");
    const payload: DigestIngestion["payload"] = {
      executionJobId: job.id, runtimeSessionId: job.runtimeSessionId, agentRunId: job.agentRunId,
      workspaceId: job.workspaceId, projectId: job.projectId, operationId: job.operationId, taskId: job.taskId,
      sourceDigest, sourceCursor: input.sourceCursor ?? null,
      summary: input.observation.summary.trim(),
      observedDecisions: input.observation.observedDecisions,
      observedFindings: input.observation.observedFindings,
      touchedArtifacts: input.observation.touchedArtifacts,
      verificationResult: input.observation.verificationResult,
      openQuestions: input.observation.openQuestions,
    };
    return this.repos.digestIngestions.enqueue({
      id: newId<"DigestIngestionId">(), executionJobId: job.id, sourceDigest,
      sourceCursor: input.sourceCursor ?? null, payload,
      status: "pending", attempts: 0, nextAttemptAt: now, lastError: null,
      digestId: null, createdAt: now, updatedAt: now,
    });
  }

  async processNext(): Promise<ExecutionDigest | null> {
    const now = this.clock();
    const item = await this.repos.digestIngestions.claimDue(now);
    if (!item) return null;
    try {
      const digest: ExecutionDigest = { ...item.payload, id: newId<"ExecutionDigestId">(), createdAt: now };
      return await this.repos.transaction(async (repos) => {
        const stored = await repos.executionDigests.insert(digest);
        await repos.digestIngestions.complete(item.id, stored.id, item.attempts, now);
        return stored;
      });
    } catch (error) {
      const delay = Math.min(60_000 * 2 ** Math.min(item.attempts, 8), 24 * 60 * 60_000);
      await this.repos.digestIngestions.retry(item.id, error instanceof Error ? error.message : "Digest ingestion failed", new Date(now.getTime() + delay), item.attempts, now);
      return null;
    }
  }
}
