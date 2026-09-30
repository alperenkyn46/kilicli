import { DomainError, newId, type Clock } from "@kilic/shared";
import { buildBootstrapContext } from "./bootstrap.js";
import { buildEvent, type ExecutionJob, type ExecutionJobId, type ExecutionJobStatus } from "@kilic/domain";
import type {
  AgentRun,
  AgentRunId,
  ApprovalId,
  ExecutionNodeId,
  Harness,
  HarnessId,
  Model,
  ModelId,
  OrchestratorId,
  Repositories,
  RepositoryCheckout,
  RepositoryId,
  RuntimeSession,
  RuntimeSessionId,
  Worktree,
  WorktreeId,
} from "@kilic/domain";
import type { RuntimeCapabilities } from "@kilic/runtime-contract";

export function approvalContinuation(capabilities: RuntimeCapabilities): "pause" | "retry" {
  if (!capabilities.supportsToolInterception) throw new DomainError("FORBIDDEN", "Runtime cannot mediate effects");
  return capabilities.supportsTurnPauseResume ? "pause" : "retry";
}

/**
 * Narrow port for the execution plane.
 * It persists execution results. It does not choose routes or create operations.
 */
export class ExecutionControl {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock,
    private readonly doctrineText: string,
  ) {}

  async jobForRun(runId: AgentRunId): Promise<ExecutionJob> {
    const job = await this.repos.executionJobs.getByRun(runId);
    if (!job) throw new DomainError("NOT_FOUND", "Execution job was not found for run");
    return job;
  }

  async getJob(id: ExecutionJobId): Promise<ExecutionJob> {
    const job = await this.repos.executionJobs.get(id);
    if (!job) throw new DomainError("NOT_FOUND", "Execution job was not found");
    return job;
  }

  async getApproval(id: ApprovalId) {
    const approval = await this.repos.approvals.get(id);
    if (!approval) throw new DomainError("NOT_FOUND", "Approval was not found");
    return approval;
  }

  async latestJobEventId(id: ExecutionJobId): Promise<import("@kilic/domain").EventId | null> {
    const events = await this.repos.events.listByAggregate("execution_job", id);
    return events.at(-1)?.id ?? null;
  }

  async handoffForSuccessor(sessionId: RuntimeSessionId) {
    return this.repos.runtimeHandoffs.findBySuccessor(sessionId);
  }

  async handoffsForNode(nodeId: ExecutionNodeId) {
    return this.repos.runtimeHandoffs.listByNode(nodeId);
  }

  async markHandoffReady(id: import("@kilic/domain").RuntimeHandoffId): Promise<void> {
    const handoff = await this.repos.runtimeHandoffs.get(id);
    if (!handoff || !handoff.successorSessionId) throw new DomainError("NOT_FOUND", "Handoff successor was not found");
    const now = this.clock();
    await this.repos.transaction(async (repos) => {
      const changed = await repos.runtimeHandoffs.transition(id, "successor_planned", "successor_ready", {}, now);
      if (!changed) throw new DomainError("INVALID_TRANSITION", "Handoff is not awaiting successor readiness");
      await repos.events.append(buildEvent({ type: "runtime_handoff.successor_ready", workspaceId: handoff.workspaceId,
        aggregateType: "runtime_handoff", aggregateId: handoff.id, correlationId: handoff.correlationId,
        causationId: handoff.causationId, runtimeSessionId: handoff.successorSessionId, occurredAt: now,
        payload: { predecessorSessionId: handoff.predecessorSessionId },
      }));
    });
  }

  async markHandoffRetired(id: import("@kilic/domain").RuntimeHandoffId): Promise<void> {
    const handoff = await this.repos.runtimeHandoffs.get(id);
    if (!handoff) throw new DomainError("NOT_FOUND", "Handoff was not found");
    const now = this.clock();
    await this.repos.transaction(async (repos) => {
      const changed = await repos.runtimeHandoffs.transition(id, "successor_ready", "predecessor_retired", {}, now);
      if (!changed) throw new DomainError("INVALID_TRANSITION", "Handoff successor is not ready");
      await repos.events.append(buildEvent({ type: "runtime_handoff.predecessor_retired", workspaceId: handoff.workspaceId,
        aggregateType: "runtime_handoff", aggregateId: handoff.id, correlationId: handoff.correlationId,
        causationId: handoff.causationId, runtimeSessionId: handoff.predecessorSessionId,
        occurredAt: now, payload: { successorSessionId: handoff.successorSessionId },
      }));
    });
  }

  async markHandoffFailed(id: import("@kilic/domain").RuntimeHandoffId, reason: string): Promise<void> {
    const handoff = await this.repos.runtimeHandoffs.get(id);
    if (!handoff || handoff.status === "failed") return;
    const now = this.clock();
    await this.repos.transaction(async (repos) => {
      const changed = await repos.runtimeHandoffs.transition(id, handoff.status, "failed", {}, now);
      if (!changed) throw new DomainError("CONFLICT", "Handoff changed while failing");
      await repos.events.append(buildEvent({ type: "runtime_handoff.failed", workspaceId: handoff.workspaceId,
        aggregateType: "runtime_handoff", aggregateId: handoff.id, correlationId: handoff.correlationId,
        causationId: handoff.causationId, runtimeSessionId: handoff.successorSessionId,
        occurredAt: now, payload: { reason },
      }));
    });
  }

  async claimJob(id: ExecutionJobId, nodeId: ExecutionNodeId, epoch: string): Promise<ExecutionJob> {
    const now = this.clock();
    const job = await this.getJob(id);
    if (job.executionNodeId !== nodeId) throw new DomainError("FORBIDDEN", "Execution job belongs to another node");
    await this.repos.transaction(async (repos) => {
      const claimed = await repos.executionJobs.claim(id, nodeId, epoch, new Date(now.getTime() + 60_000), now);
      if (!claimed) throw new DomainError("CONFLICT", "Execution job is already claimed");
      await repos.events.append(buildEvent({
        type: "execution_job.claimed", workspaceId: job.workspaceId, projectId: job.projectId,
        aggregateType: "execution_job", aggregateId: job.id, correlationId: job.correlationId,
        causationId: job.causationId, agentRunId: job.agentRunId, runtimeSessionId: job.runtimeSessionId,
        occurredAt: now, payload: { nodeId, epoch },
      }));
    });
    return this.getJob(id);
  }

  async renewJobLease(id: ExecutionJobId, nodeId: ExecutionNodeId, epoch: string): Promise<void> {
    const now = this.clock();
    if (!(await this.repos.executionJobs.renew(id, nodeId, epoch, new Date(now.getTime() + 60_000), now))) {
      throw new DomainError("FORBIDDEN", "Execution lease or node boot is no longer valid");
    }
  }

  async rearmJob(id: ExecutionJobId): Promise<ExecutionJob> {
    const job = await this.getJob(id);
    if (job.status !== "failed" && job.status !== "interrupted") throw new DomainError("INVALID_TRANSITION", "Only failed or interrupted jobs can be retried");
    if (job.outcome === "approval_requires_retry") {
      if (!job.pendingApprovalId || (await this.getApproval(job.pendingApprovalId)).status !== "approved") {
        throw new DomainError("FORBIDDEN", "Effect approval has not been granted");
      }
    }
    const now = this.clock();
    const changed = await this.repos.executionJobs.transition(id, job.status, "planned", {
      claimEpoch: null, leaseUntil: null, startedAt: null, endedAt: null, outcome: null, pendingApprovalId: null,
    }, now);
    if (!changed) throw new DomainError("CONFLICT", "Execution job changed during retry");
    return this.getJob(id);
  }

  async rearmAfterApproval(id: ExecutionJobId): Promise<ExecutionJob> {
    const job = await this.getJob(id);
    if (job.status !== "interrupted" || job.outcome !== "approval_requires_retry" || !job.pendingApprovalId) {
      throw new DomainError("INVALID_TRANSITION", "Job is not awaiting an approved retry");
    }
    const approval = await this.getApproval(job.pendingApprovalId);
    if (approval.status !== "approved") throw new DomainError("FORBIDDEN", "Effect approval has not been granted");
    return this.rearmJob(id);
  }

  async transitionJob(id: ExecutionJobId, from: ExecutionJobStatus, to: ExecutionJobStatus, outcome?: string, approvalId?: ApprovalId): Promise<ExecutionJob> {
    const allowed: Record<ExecutionJobStatus, readonly ExecutionJobStatus[]> = {
      planned: ["claimed", "cancelled"],
      claimed: ["bootstrapping", "failed", "interrupted", "cancelled"],
      bootstrapping: ["running", "failed", "interrupted", "cancelled"],
      running: ["awaiting_approval", "completed", "failed", "interrupted", "cancelled"],
      awaiting_approval: ["running", "failed", "interrupted", "cancelled"],
      completed: [], failed: [], interrupted: [], cancelled: [],
    };
    if (!allowed[from].includes(to)) throw new DomainError("INVALID_TRANSITION", `Execution job cannot move from ${from} to ${to}`);
    if (to === "awaiting_approval" && !approvalId) throw new DomainError("INVARIANT", "Awaiting approval needs an exact approval id");
    const job = await this.getJob(id);
    const now = this.clock();
    await this.repos.transaction(async (repos) => {
      if (to === "awaiting_approval") {
        const approval = await repos.approvals.get(approvalId!);
        if (!approval || approval.workspaceId !== job.workspaceId || approval.payload.executionJobId !== job.id) {
          throw new DomainError("FORBIDDEN", "Effect approval does not belong to this execution");
        }
      }
      if (!job.claimEpoch || !(await repos.executionJobs.renew(id, job.executionNodeId, job.claimEpoch, new Date(now.getTime() + 60_000), now))) {
        throw new DomainError("FORBIDDEN", "Execution lease or node boot is no longer valid");
      }
      const changed = await repos.executionJobs.transition(id, from, to, {
        ...(to === "running" && from === "bootstrapping" ? { startedAt: now } : {}),
        ...(to === "awaiting_approval" ? { pendingApprovalId: approvalId ?? null } : {}),
        ...(to === "running" && from === "awaiting_approval" ? { pendingApprovalId: null } : {}),
        ...(["completed", "failed", "interrupted", "cancelled"].includes(to) ? { endedAt: now, outcome: outcome ?? to, leaseUntil: null } : {}),
      }, now);
      if (!changed) throw new DomainError("INVALID_TRANSITION", `Execution job cannot move from ${from} to ${to}`);
      if (job.agentRunId) {
        if (to === "running" && from === "bootstrapping" && !(await repos.agentRuns.transition(job.agentRunId, "planned", "running", now, null))) throw new DomainError("INVALID_TRANSITION", "Run was not planned when execution started");
        if (to === "awaiting_approval" && !(await repos.agentRuns.transition(job.agentRunId, "running", "awaiting_approval", now, null))) throw new DomainError("INVALID_TRANSITION", "Run was not running when approval was requested");
        if (from === "awaiting_approval" && to === "running" && !(await repos.agentRuns.transition(job.agentRunId, "awaiting_approval", "running", now, null))) throw new DomainError("INVALID_TRANSITION", "Run was not waiting for approval");
        if (to === "completed" || to === "failed" || to === "cancelled") {
          const expected = from === "awaiting_approval" ? "awaiting_approval" : from === "running" ? "running" : "planned";
          if (!(await repos.agentRuns.transition(job.agentRunId, expected, to, now, now))) throw new DomainError("INVALID_TRANSITION", "Run changed while execution terminated");
        }
        if (to === "interrupted") {
          const expected = from === "bootstrapping" ? "planned" : from === "awaiting_approval" ? "awaiting_approval" : "running";
          if (!(await repos.agentRuns.transition(job.agentRunId, expected, "failed", now, now))) throw new DomainError("INVALID_TRANSITION", "Run changed while execution interrupted");
        }
      }
      if (to === "running" && from === "bootstrapping" && job.taskId) {
        const task = await repos.tasks.get(job.taskId);
        if (task?.status === "ready" && !(await repos.tasks.transition(task.id, "ready", "in_progress", now))) throw new DomainError("INVALID_TRANSITION", "Task changed while execution started");
      }
      await repos.events.append(buildEvent({
        type: `execution_job.${to}`, workspaceId: job.workspaceId, projectId: job.projectId,
        aggregateType: "execution_job", aggregateId: job.id, correlationId: job.correlationId,
        causationId: job.causationId, agentRunId: job.agentRunId, runtimeSessionId: job.runtimeSessionId,
        occurredAt: now, payload: { from, to, outcome: outcome ?? null, approvalId: approvalId ?? null },
      }));
    });
    return this.getJob(id);
  }

  async bootstrapFor(sessionId: RuntimeSessionId, runId?: AgentRunId) {
    const session = await this.mustSession(sessionId);
    const run = runId ? await this.mustRun(runId) : null;
    if (run && (run.runtimeSessionId !== session.id || run.orchestratorId !== session.orchestratorId)) {
      throw new DomainError("INVARIANT", "Run does not belong to the runtime session");
    }
    return buildBootstrapContext(this.repos, {
      orchestratorId: session.orchestratorId,
      doctrineText: this.doctrineText,
      purpose: session.purpose,
      role: run?.role ?? "orchestrator",
      executionNodeId: session.executionNodeId,
      correlationId: session.correlationId,
      operationId: run?.operationId,
      taskId: run?.taskId,
      runtimeSessionId: session.id,
      agentRunId: run?.id,
    });
  }

  async rotateBoot(executionNodeId: ExecutionNodeId, bootId: string): Promise<void> {
    const now = this.clock();
    await this.repos.executionNodes.setBoot(executionNodeId, bootId, now);
    const jobs = await this.repos.executionJobs.listByNode(executionNodeId);
    for (const job of jobs) {
      if (job.claimEpoch === bootId) continue;
      if (job.status === "claimed" || job.status === "bootstrapping" || job.status === "running" || job.status === "awaiting_approval") {
        await this.repos.transaction(async (repos) => {
          const changed = await repos.executionJobs.transition(job.id, job.status, "interrupted", {
            endedAt: now, outcome: "execution_node_restart", leaseUntil: null,
          }, now);
          if (!changed) return;
          if (job.agentRunId) await repos.agentRuns.transition(job.agentRunId,
            job.status === "awaiting_approval" ? "awaiting_approval" : job.status === "running" ? "running" : "planned", "failed", now, now);
          await repos.events.append(buildEvent({ type: "execution_job.interrupted", workspaceId: job.workspaceId,
            projectId: job.projectId, aggregateType: "execution_job", aggregateId: job.id,
            correlationId: job.correlationId, causationId: job.causationId,
            agentRunId: job.agentRunId, runtimeSessionId: job.runtimeSessionId,
            occurredAt: now, payload: { reason: "execution_node_restart", previousEpoch: job.claimEpoch, bootId },
          }));
        });
      }
    }
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

  async repositoryForRun(repositoryId: RepositoryId, runId: AgentRunId): Promise<void> {
    const run = await this.mustRun(runId);
    const repository = await this.repos.repositories.get(repositoryId);
    if (!repository || repository.projectId !== run.projectId) throw new DomainError("INVARIANT", "Repository is outside the run project");
  }

  async bindRepositoryForRun(repositoryId: RepositoryId, runId: AgentRunId, nodeId: ExecutionNodeId): Promise<void> {
    await this.repositoryForRun(repositoryId, runId);
    const job = await this.jobForRun(runId);
    if (job.executionNodeId !== nodeId) throw new DomainError("FORBIDDEN", "Job belongs to another execution node");
    if (job.repositoryId === repositoryId) return;
    if (job.repositoryId !== null) throw new DomainError("CONFLICT", "Execution repository cannot change on retry");
    await this.repos.transaction(async (repos) => {
      const now = this.clock();
      if (!await repos.executionJobs.bindRepository(job.id, repositoryId, nodeId, now)) {
        if ((await repos.executionJobs.get(job.id))?.repositoryId === repositoryId) return;
        throw new DomainError("CONFLICT", "Execution repository binding lost its expected state");
      }
      await repos.events.append(buildEvent({ type: "execution_job.repository_bound", aggregateType: "execution_job", aggregateId: job.id,
        workspaceId: job.workspaceId, projectId: job.projectId, correlationId: job.correlationId, causationId: job.causationId,
        runtimeSessionId: job.runtimeSessionId, agentRunId: job.agentRunId, occurredAt: now, payload: { repositoryId, nodeId } }));
    });
  }

  async activeWorktreeForRun(runId: AgentRunId) { return this.repos.worktrees.findActiveByRun(runId); }

  async worktreesForNode(nodeId: ExecutionNodeId) { return this.repos.worktrees.listByNode(nodeId); }

  async checkoutsForNode(nodeId: ExecutionNodeId) { return this.repos.repositoryCheckouts.listByNode(nodeId); }

  async repositoryStateForOrchestrator(orchestratorId: OrchestratorId, nodeId: ExecutionNodeId): Promise<Record<string, unknown>> {
    const worktrees: Array<{ repositoryId: RepositoryId; runId: AgentRunId; branch: string; path: string; status: string }> = [];
    for (const row of await this.repos.worktrees.listByNode(nodeId)) {
      const run = await this.repos.agentRuns.get(row.agentRunId);
      if (run?.orchestratorId === orchestratorId) worktrees.push({ repositoryId: row.repositoryId, runId: row.agentRunId,
        branch: row.branch, path: row.path, status: row.status });
    }
    return { nodeId, worktrees };
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
    const orchestrator = await this.repos.orchestrators.get(session.orchestratorId);
    if (!orchestrator) throw new DomainError("NOT_FOUND", "Session orchestrator was not found");
    await this.repos.transaction(async (repos) => {
      if (session.status !== "starting") throw new DomainError("INVALID_TRANSITION", "Only a starting session can attach a runtime");
      if (!(await repos.runtimeSessions.attachAdapter(session.id, adapterSessionId, executionEpoch, now))) throw new DomainError("INVALID_TRANSITION", "Runtime session changed before attach");
      if (!(await repos.runtimeSessions.transition(session.id, "starting", {
        status: "active",
        closeReason: null,
        endedAt: null,
        updatedAt: now,
      }))) throw new DomainError("INVALID_TRANSITION", "Runtime session changed before activation");
      await repos.events.append(buildEvent({ type: "runtime_session.active", workspaceId: orchestrator.workspaceId,
        projectId: orchestrator.projectId, aggregateType: "runtime_session", aggregateId: session.id,
        correlationId: session.correlationId, runtimeSessionId: session.id, occurredAt: now,
        payload: { adapterSessionId, executionEpoch },
      }));
    });
    return this.mustSession(session.id);
  }

  async markRunRunning(runId: AgentRunId): Promise<AgentRun> {
    const run = await this.mustRun(runId);
    if (run.status === "running") return run;
    if (run.status !== "planned") {
      throw new DomainError("INVALID_TRANSITION", `Run cannot move from ${run.status} to running`);
    }
    const now = this.clock();
    if (!(await this.repos.agentRuns.transition(run.id, "planned", "running", now, null))) throw new DomainError("INVALID_TRANSITION", "Run changed before start");
    return this.mustRun(run.id);
  }

  async markRunFailed(runId: AgentRunId): Promise<void> {
    const run = await this.repos.agentRuns.get(runId);
    if (!run || run.status === "failed" || run.status === "completed" || run.status === "cancelled") return;
    const now = this.clock();
    if (!(await this.repos.agentRuns.transition(run.id, run.status, "failed", now, now))) throw new DomainError("INVALID_TRANSITION", "Run changed before failure");
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
    const orchestrator = await this.repos.orchestrators.get(session.orchestratorId);
    if (!orchestrator) throw new DomainError("NOT_FOUND", "Session orchestrator was not found");
    await this.repos.transaction(async (repos) => {
      if (!(await repos.runtimeSessions.transition(session.id, session.status, {
        status, closeReason: reason, endedAt: now, updatedAt: now,
      }))) throw new DomainError("INVALID_TRANSITION", "Session changed before termination");
      await repos.events.append(buildEvent({ type: `runtime_session.${status}`, workspaceId: orchestrator.workspaceId,
        projectId: orchestrator.projectId, aggregateType: "runtime_session", aggregateId: session.id,
        correlationId: session.correlationId, runtimeSessionId: session.id,
        occurredAt: now, payload: { from: session.status, reason },
      }));
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

  async getTask(id: import("@kilic/domain").TaskId) {
    const task = await this.repos.tasks.get(id);
    if (!task) throw new DomainError("NOT_FOUND", "Task was not found");
    return task;
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
