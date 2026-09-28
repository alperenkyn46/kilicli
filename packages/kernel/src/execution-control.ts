import { DomainError, newId, type Clock } from "@kilic/shared";
import type {
  AgentRun,
  AgentRunId,
  ExecutionNodeId,
  Harness,
  HarnessId,
  Model,
  ModelId,
  Repositories,
  RepositoryCheckout,
  RepositoryId,
  RuntimeSession,
  RuntimeSessionId,
  Worktree,
  WorktreeId,
} from "@kilic/domain";

/**
 * Narrow port for the execution plane.
 * It persists execution results. It does not choose routes or create operations.
 */
export class ExecutionControl {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock,
  ) {}

  async rotateBoot(executionNodeId: ExecutionNodeId, bootId: string): Promise<void> {
    const now = this.clock();
    await this.repos.executionNodes.setBoot(executionNodeId, bootId, now);
    const sessions = await this.repos.runtimeSessions.listByNode(executionNodeId);
    for (const session of sessions) {
      const live = session.status === "active" || session.status === "starting";
      if (!live) continue;
      if (session.executionEpoch === bootId) continue;
      await this.markSessionInterrupted(session.id, "execution_node_restart");
    }
  }

  async checkoutFor(repositoryId: RepositoryId, executionNodeId: ExecutionNodeId): Promise<RepositoryCheckout> {
    const checkout = await this.repos.repositoryCheckouts.find(repositoryId, executionNodeId);
    if (!checkout || checkout.status !== "present") {
      throw new DomainError("CHECKOUT_NOT_FOUND", "This execution node has no checkout for the repository");
    }
    return checkout;
  }

  async registerWorktree(input: {
    repositoryId: RepositoryId;
    agentRunId: AgentRunId;
    executionNodeId: ExecutionNodeId;
    branch: string;
    path: string;
    baseRef: string;
  }): Promise<Worktree> {
    const run = await this.mustRun(input.agentRunId);
    const repository = await this.repos.repositories.get(input.repositoryId);
    if (!repository || repository.projectId !== run.projectId) {
      throw new DomainError("INVARIANT", "Worktree repository must belong to the run project");
    }
    if (run.isolation?.mode !== "worktree" || run.isolation.branch !== input.branch) {
      throw new DomainError("INVARIANT", "Worktree branch must match the dispatch isolation plan");
    }
    const now = this.clock();
    const worktree: Worktree = {
      id: newId<"WorktreeId">(),
      repositoryId: repository.id,
      agentRunId: run.id,
      executionNodeId: input.executionNodeId,
      branch: input.branch,
      path: input.path,
      baseRef: input.baseRef,
      status: "active",
      createdAt: now,
      removedAt: null,
    };
    await this.repos.worktrees.insert(worktree);
    return worktree;
  }

  async markWorktreeRemoved(id: WorktreeId): Promise<void> {
    const existing = await this.repos.worktrees.get(id);
    if (!existing || existing.status === "removed") return;
    await this.repos.worktrees.markRemoved(id, this.clock());
  }

  async attachAdapterSession(
    sessionId: RuntimeSessionId,
    adapterSessionId: string,
    executionEpoch: string,
  ): Promise<RuntimeSession> {
    const session = await this.mustSession(sessionId);
    const now = this.clock();
    await this.repos.runtimeSessions.attachAdapter(session.id, adapterSessionId, executionEpoch, now);
    if (session.status === "starting" || session.status === "interrupted" || session.status === "failed") {
      await this.repos.runtimeSessions.setStatus(session.id, {
        status: "active",
        closeReason: null,
        endedAt: null,
        updatedAt: now,
      });
    }
    return this.mustSession(session.id);
  }

  async markRunRunning(runId: AgentRunId): Promise<AgentRun> {
    const run = await this.mustRun(runId);
    if (run.status === "running") return run;
    if (run.status !== "planned") {
      throw new DomainError("INVALID_TRANSITION", `Run cannot move from ${run.status} to running`);
    }
    const now = this.clock();
    await this.repos.agentRuns.setStatus(run.id, "running", now, null);
    return this.mustRun(run.id);
  }

  async markRunFailed(runId: AgentRunId): Promise<void> {
    const run = await this.repos.agentRuns.get(runId);
    if (!run || run.status === "failed" || run.status === "completed" || run.status === "cancelled") return;
    const now = this.clock();
    await this.repos.agentRuns.setStatus(run.id, "failed", now, now);
  }

  async rearmRun(runId: AgentRunId): Promise<AgentRun> {
    const run = await this.mustRun(runId);
    if (run.status === "completed" || run.status === "cancelled") {
      throw new DomainError("INVALID_TRANSITION", `Run ${run.status} cannot be retried`);
    }
    if (run.status !== "planned") await this.repos.agentRuns.rearm(run.id, this.clock());
    return this.mustRun(run.id);
  }

  async markSessionFailed(sessionId: RuntimeSessionId, reason: string): Promise<void> {
    await this.finishSession(sessionId, "failed", reason);
  }

  async markSessionInterrupted(sessionId: RuntimeSessionId, reason: string): Promise<void> {
    await this.finishSession(sessionId, "interrupted", reason);
    const session = await this.repos.runtimeSessions.get(sessionId);
    if (!session) return;
    const runs = await this.repos.agentRuns.listBySession(session.id);
    for (const run of runs) {
      if (run.status === "planned" || run.status === "running") await this.markRunFailed(run.id);
    }
  }

  async markSessionClosed(sessionId: RuntimeSessionId, reason: string): Promise<void> {
    await this.finishSession(sessionId, "closed", reason);
  }

  async rearmSession(sessionId: RuntimeSessionId): Promise<RuntimeSession> {
    await this.repos.runtimeSessions.rearm(sessionId, this.clock());
    return this.mustSession(sessionId);
  }

  private async finishSession(
    sessionId: RuntimeSessionId,
    status: "failed" | "interrupted" | "closed",
    reason: string,
  ): Promise<void> {
    const session = await this.repos.runtimeSessions.get(sessionId);
    if (!session || session.status === status || session.status === "closed") return;
    const now = this.clock();
    await this.repos.runtimeSessions.setStatus(session.id, {
      status,
      closeReason: reason,
      endedAt: now,
      updatedAt: now,
    });
  }

  private async mustSession(id: RuntimeSessionId): Promise<RuntimeSession> {
    const session = await this.repos.runtimeSessions.get(id);
    if (!session) throw new DomainError("NOT_FOUND", `Runtime session ${id} was not found`);
    return session;
  }

  private async mustRun(id: AgentRunId): Promise<AgentRun> {
    const run = await this.repos.agentRuns.get(id);
    if (!run) throw new DomainError("NOT_FOUND", `Agent run ${id} was not found`);
    return run;
  }

  async getSession(id: RuntimeSessionId): Promise<RuntimeSession> {
    return this.mustSession(id);
  }

  async getRun(id: AgentRunId): Promise<AgentRun> {
    return this.mustRun(id);
  }

  async getHarness(id: HarnessId): Promise<Harness> {
    const harness = await this.repos.harnesses.get(id);
    if (!harness) throw new DomainError("NOT_FOUND", `Harness ${id} was not found`);
    return harness;
  }

  async getModel(id: ModelId): Promise<Model> {
    const model = await this.repos.models.get(id);
    if (!model) throw new DomainError("NOT_FOUND", `Model ${id} was not found`);
    return model;
  }
}
