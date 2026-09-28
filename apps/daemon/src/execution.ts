import { join } from "node:path";
import { createHash } from "node:crypto";
import { DomainError } from "@kilic/shared";
import type { AgentRunId, ApprovalId, ExecutionJob, ExecutionJobId, ExecutionNodeId, RepositoryId, RuntimeSessionId, WorktreeId } from "@kilic/domain";
import type { EffectAuthorizationPort, ExecutionControl, RuntimeProcessPort } from "@kilic/kernel";
import type { Kernel } from "@kilic/kernel";
import { approvalContinuation, selectLifecycleFlush } from "@kilic/kernel";
import { RuntimeAdapterError, type EffectRequest, type RuntimeFailureStatus, type RuntimeLifecycleSignal } from "@kilic/runtime-contract";
import type { GitWorktreeManager } from "./worktree.js";
import type { EffectExecutionPort } from "./effect-executor.js";

const RETRYABLE = new Set(["starting", "failed", "interrupted"]);

export class ExecutionPlane {
  constructor(
    private readonly deps: {
      control: ExecutionControl;
      runtime: RuntimeProcessPort;
      effects: EffectAuthorizationPort;
      effectExecutor?: EffectExecutionPort;
      handoffPlanner: Pick<Kernel, "requestHandoff" | "resumeHandoff" | "recordRuntimeLifecycle">;
      worktrees: GitWorktreeManager;
      worktreeRoot: string;
      bootId: string;
      nodeId: ExecutionNodeId;
      leaseHeartbeatIntervalMs?: number;
    },
  ) {}

  async materialize(input: { runId: AgentRunId; repositoryId: RepositoryId; retry?: boolean }): Promise<{ cwd: string }> {
    let run = await this.deps.control.getRun(input.runId);
    if (!run.runtimeSessionId) throw new DomainError("NOT_FOUND", "Planned run is missing a runtime session");
    let session = await this.deps.control.getSession(run.runtimeSessionId);
    if (session.executionNodeId !== this.deps.nodeId) throw new DomainError("FORBIDDEN", "Session belongs to another execution node");
    await this.deps.control.repositoryForRun(input.repositoryId, run.id);
    await this.deps.control.checkoutFor(input.repositoryId, session.executionNodeId);
    let job = await this.deps.control.jobForRun(run.id);
    if (input.retry && (job.status === "failed" || job.status === "interrupted")) {
      job = await this.deps.control.rearmJob(job.id);
    }
    if (job.status === "planned") {
      await this.deps.control.claimJob(job.id, this.deps.nodeId, this.deps.bootId);
      await this.deps.control.transitionJob(job.id, "claimed", "bootstrapping");
    } else if (job.status !== "bootstrapping") {
      throw new DomainError("CONFLICT", `Execution job is ${job.status}`);
    }
    if (session.status === "active" && session.executionEpoch === this.deps.bootId && session.adapterSessionId && this.deps.runtime.hasAdapterSession(session.adapterSessionId)) {
      const checkout = await this.deps.control.checkoutFor(input.repositoryId, session.executionNodeId);
      return { cwd: run.isolation?.mode === "worktree" ? join(this.deps.worktreeRoot, run.id) : checkout.localPath };
    }
    if (!RETRYABLE.has(session.status) && session.status !== "active") {
      throw new DomainError("INVALID_TRANSITION", `Session ${session.status} cannot be materialized`);
    }
    if (session.status !== "starting") {
      session = await this.deps.control.rearmSession(session.id);
      run = await this.deps.control.rearmRun(run.id);
    }

    const checkout = await this.deps.control.checkoutFor(input.repositoryId, session.executionNodeId);
    let cwd = checkout.localPath;
    let worktreeId: WorktreeId | null = null;
    let createdWorktreeThisAttempt = false;
    let openedId: string | null = null;
    const harness = await this.deps.control.getHarness(session.harnessId);
    const model = await this.deps.control.getModel(session.modelId);

    try {
      if (run.isolation?.mode === "worktree") {
        cwd = join(this.deps.worktreeRoot, run.id);
        const tracked = await this.deps.control.activeWorktreeForRun(run.id);
        if (tracked && await this.deps.worktrees.exists(cwd)) {
          if (tracked.path !== cwd || tracked.branch !== run.isolation.branch || tracked.repositoryId !== input.repositoryId) throw new DomainError("CONFLICT", "Tracked worktree ownership does not match this run");
          await this.deps.worktrees.assertOwned({ worktreePath: cwd, branch: run.isolation.branch, requireClean: true });
          worktreeId = tracked.id;
        } else {
          if (tracked) {
            if (tracked.path !== cwd || tracked.branch !== run.isolation.branch || tracked.repositoryId !== input.repositoryId) {
              throw new DomainError("CONFLICT", "Tracked worktree ownership does not match this run");
            }
            await this.deps.worktrees.pruneMissing({ repositoryRoot: checkout.localPath, worktreePath: tracked.path });
            await this.deps.control.markWorktreeRemoved(tracked.id);
          }
          await this.deps.worktrees.create({
            repositoryRoot: checkout.localPath,
            worktreePath: cwd,
            branch: run.isolation.branch,
            baseRef: run.isolation.baseRef,
            allowExistingBranch: input.retry === true,
          });
          createdWorktreeThisAttempt = true;
          const worktree = await this.deps.control.registerWorktree({
            repositoryId: input.repositoryId,
            agentRunId: run.id,
            executionNodeId: session.executionNodeId,
            branch: run.isolation.branch,
            path: cwd,
            baseRef: run.isolation.baseRef,
          });
          worktreeId = worktree.id;
        }
      } else if (run.access === "write") {
        throw new DomainError("INVARIANT", "A write-capable run requires a worktree plan");
      }

      await this.deps.control.renewJobLease(job.id, this.deps.nodeId, this.deps.bootId);
      const opened = await this.deps.runtime.open({
        harnessKey: harness.key,
        modelKey: model.key,
        role: run.role,
        cwd,
        bootstrap: await this.deps.control.bootstrapFor(session.id, run.id),
        tools: { memory: true, workforce: false, effectExecution: "brokered_only" },
      });
      openedId = opened.adapterSessionId;
      await this.deps.control.attachAdapterSession(session.id, opened.adapterSessionId, this.deps.bootId);
      return { cwd };
    } catch (error) {
      if (openedId) {
        await this.deps.runtime.close({ harnessKey: harness.key, adapterSessionId: openedId }).catch(() => undefined);
      }
      if (createdWorktreeThisAttempt && run.isolation?.mode === "worktree") {
        try {
          await this.deps.worktrees.remove({ repositoryRoot: checkout.localPath, worktreePath: cwd });
          if (worktreeId) await this.deps.control.markWorktreeRemoved(worktreeId);
        } catch {
          // Keep an active row for startup reconciliation when Git cleanup fails.
        }
      }
      await this.deps.control.markSessionFailed(session.id, error instanceof Error ? error.message : "materialize failed");
      await this.deps.control.transitionJob(job.id, "bootstrapping", "failed", error instanceof Error ? error.message : "materialize failed");
      throw error;
    }
  }

  async reconcileWorktrees(): Promise<{ orphanPaths: string[]; orphanBranches: string[]; missingPaths: string[]; mismatchedPaths: string[] }> {
    const rows = await this.deps.control.worktreesForNode(this.deps.nodeId);
    const active = rows.filter((item) => item.status === "active");
    const paths = await this.deps.worktrees.listPaths(this.deps.worktreeRoot);
    const orphanPaths = paths.filter((path) => !active.some((item) => item.path === path));
    const missingPaths: string[] = [];
    const mismatchedPaths: string[] = [];
    for (const row of active) {
      if (!(await this.deps.worktrees.exists(row.path))) {
        missingPaths.push(row.path);
        try {
          const checkout = await this.deps.control.checkoutFor(row.repositoryId, this.deps.nodeId);
          await this.deps.worktrees.pruneMissing({ repositoryRoot: checkout.localPath, worktreePath: row.path });
          await this.deps.control.markWorktreeRemoved(row.id);
        } catch {
          // Keep the row active until Git ownership can be reconciled.
        }
      } else {
        try { await this.deps.worktrees.assertOwned({ worktreePath: row.path, branch: row.branch }); }
        catch { mismatchedPaths.push(row.path); }
      }
    }
    const orphanBranches: string[] = [];
    for (const checkout of await this.deps.control.checkoutsForNode(this.deps.nodeId)) {
      if (checkout.status !== "present") continue;
      for (const branch of await this.deps.worktrees.listWorkerBranches(checkout.localPath)) {
        if (!active.some((row) => row.repositoryId === checkout.repositoryId && row.branch === branch && !missingPaths.includes(row.path))) orphanBranches.push(`${checkout.repositoryId}:${branch}`);
      }
    }
    return { orphanPaths, orphanBranches, missingPaths, mismatchedPaths };
  }

  async reconcileHandoffs(): Promise<{ recovered: string[]; failed: string[] }> {
    const recovered: string[] = [];
    const failed: string[] = [];
    for (const handoff of await this.deps.control.handoffsForNode(this.deps.nodeId)) {
      if (!["requested", "checkpointed", "successor_planned", "successor_ready"].includes(handoff.status)) continue;
      try {
        if (handoff.status === "requested" || !handoff.checkpointId) {
          throw new DomainError("HANDOFF_REQUIRED", "Durable handoff checkpoint or planner is unavailable");
        }
        let successorId = handoff.successorSessionId;
        if (handoff.status === "checkpointed") {
          const resumed = await this.deps.handoffPlanner.resumeHandoff(handoff.id);
          successorId = resumed.plan.session.id;
        }
        if (!successorId) throw new DomainError("INVARIANT", "Handoff has no successor session");
        const successor = await this.deps.control.getSession(successorId);
        if (successor.status === "failed" || successor.status === "interrupted") await this.deps.control.rearmSession(successor.id);
        await this.openMind(successorId, handoff.predecessorSessionId);
        recovered.push(handoff.id);
      } catch (error) {
        failed.push(handoff.id);
        await this.deps.control.markHandoffFailed(handoff.id, error instanceof Error ? error.message : "handoff recovery failed").catch(() => undefined);
      }
    }
    return { recovered, failed };
  }

  async executeRun(runId: AgentRunId): Promise<{ outcome: "completed" | "failed" | "interrupted"; output: string }> {
    const job = await this.deps.control.jobForRun(runId);
    if (job.executionNodeId !== this.deps.nodeId || job.claimEpoch !== this.deps.bootId) {
      throw new DomainError("FORBIDDEN", "Execution job is not owned by this daemon boot");
    }
    if (job.status !== "bootstrapping") throw new DomainError("INVALID_TRANSITION", `Execution job is ${job.status}`);
    const session = await this.deps.control.getSession(job.runtimeSessionId);
    if (session.status !== "active" || !session.adapterSessionId || !this.deps.runtime.hasAdapterSession(session.adapterSessionId)) {
      throw new DomainError("INVARIANT", "A bootstrapped live runtime is required before execution");
    }
    const harness = await this.deps.control.getHarness(session.harnessId);
    if (await this.deps.runtime.sessionHealth({ harnessKey: harness.key, adapterSessionId: session.adapterSessionId }) !== "alive") {
      throw new DomainError("INVARIANT", "Runtime session is not live");
    }
    const task = job.taskId ? await this.deps.control.getTask(job.taskId) : null;
    const text = task ? [task.title, task.description, task.acceptanceCriteria].filter(Boolean).join("\n\n") : "Continue the current operation from the scoped bootstrap context.";
    let output = "";
    let started = false;
    let terminal: "completed" | "failed" | "interrupted" | null = null;
    const flushed = new Set<RuntimeLifecycleSignal>();
    try {
      await this.deps.control.renewJobLease(job.id, this.deps.nodeId, this.deps.bootId);
      const heartbeat = this.startLeaseHeartbeat(job.id, harness.key, session.adapterSessionId);
      try {
      for await (const event of this.deps.runtime.send({
        harnessKey: harness.key,
        adapterSessionId: session.adapterSessionId,
        message: { text, executionId: job.id, idempotencyKey: job.idempotencyKey },
      })) {
        heartbeat.check();
        await this.deps.control.renewJobLease(job.id, this.deps.nodeId, this.deps.bootId);
        if (!started && event.type === "started") {
          await this.deps.control.transitionJob(job.id, "bootstrapping", "running");
          started = true;
        }
        if (!started && (event.type === "output" || event.type === "effect_requested" || event.type === "completed" || event.type === "lifecycle")) {
          throw new DomainError("INVALID_TRANSITION", "Runtime emitted work before execution start");
        }
        if (event.type === "output") output += event.text;
        if (event.type === "lifecycle") {
          await this.deps.handoffPlanner.recordRuntimeLifecycle({ executionJobId: job.id, signal: event.signal,
            checkpointState: event.checkpointState, digest: event.digest });
          flushed.add(event.signal);
        }
        if (event.type === "effect_requested") {
          await this.mediateEffect(job, harness.key, session.adapterSessionId, event.request, heartbeat.check);
        }
        if (event.type === "completed") { terminal = "completed"; break; }
        if (event.type === "interrupted") { terminal = "interrupted"; break; }
        if (event.type === "failed") { terminal = "failed"; break; }
      }
      heartbeat.check();
      } finally {
        await heartbeat.stop();
      }
      heartbeat.check();
      if (!terminal) terminal = "failed";
      const signal = selectLifecycleFlush({ capabilities: this.deps.runtime.capabilities(harness.key),
        purpose: "worker", outcome: terminal, observed: flushed });
      if (signal) await this.flush(job.id, signal, output);
      const current = await this.deps.control.getJob(job.id);
      if (current.status === "awaiting_approval" && terminal === "failed" && current.pendingApprovalId &&
        (await this.deps.control.getApproval(current.pendingApprovalId)).status !== "rejected") terminal = "interrupted";
      await this.deps.control.transitionJob(job.id, current.status, terminal,
        current.status === "awaiting_approval" ? terminal === "interrupted" ? "approval_requires_retry" : "approval_denied" : terminal === "failed" ? "Runtime ended without completion" : terminal);
      return { outcome: terminal, output };
    } catch (error) {
      const current = await this.deps.control.getJob(job.id);
      await this.deps.control.transitionJob(job.id, current.status, "failed", error instanceof Error ? error.message : "Runtime failed").catch(() => undefined);
      if (!flushed.has("runtime_failure")) await this.flush(job.id, "runtime_failure", output).catch(() => undefined);
      throw error;
    }
  }

  async openMind(
    sessionId: RuntimeSessionId,
    closePreviousSessionId?: RuntimeSessionId | null,
  ): Promise<{ sessionId: RuntimeSessionId; adapterSessionId: string }> {
    let previous: Awaited<ReturnType<ExecutionControl["getSession"]>> | null = null;
    if (closePreviousSessionId) {
      previous = await this.deps.control.getSession(closePreviousSessionId);
    }
    const session = await this.deps.control.getSession(sessionId);
    if (session.executionNodeId !== this.deps.nodeId) throw new DomainError("FORBIDDEN", "Mind session belongs to another execution node");
    if (previous && previous.orchestratorId !== session.orchestratorId) throw new DomainError("FORBIDDEN", "Predecessor belongs to another orchestrator");
    if (session.purpose !== "orchestrator_mind") {
      throw new DomainError("INVARIANT", "Mind materialization requires an orchestrator session");
    }
    if (session.status !== "starting") {
      throw new DomainError("INVALID_TRANSITION", `Mind session ${session.status} is not ready to open`);
    }
    const harness = await this.deps.control.getHarness(session.harnessId);
    const model = await this.deps.control.getModel(session.modelId);
    const handoff = await this.deps.control.handoffForSuccessor(session.id);
    let opened: { adapterSessionId: string };
    try {
      opened = await this.deps.runtime.open({
        harnessKey: harness.key,
        modelKey: model.key,
        role: "orchestrator",
        bootstrap: await this.deps.control.bootstrapFor(session.id),
        tools: { memory: true, workforce: true, effectExecution: "brokered_only" },
      });
    } catch (error) {
      await this.deps.control.markSessionFailed(session.id, "successor_start_failed");
      if (handoff) await this.deps.control.markHandoffFailed(handoff.id, "successor_start_failed");
      throw error;
    }
    try {
      await this.deps.control.attachAdapterSession(session.id, opened.adapterSessionId, this.deps.bootId);
    } catch (error) {
      await this.deps.runtime.close({ harnessKey: harness.key, adapterSessionId: opened.adapterSessionId }).catch(() => undefined);
      await this.deps.control.markSessionFailed(session.id, "adapter session was not persisted");
      if (handoff) await this.deps.control.markHandoffFailed(handoff.id, "adapter session was not persisted");
      throw error;
    }
    if (handoff?.status === "successor_planned") await this.deps.control.markHandoffReady(handoff.id);
    if (previous) {
      if (previous.adapterSessionId && this.deps.runtime.hasAdapterSession(previous.adapterSessionId)) {
        const previousHarness = await this.deps.control.getHarness(previous.harnessId);
        await this.deps.runtime.close({ harnessKey: previousHarness.key, adapterSessionId: previous.adapterSessionId });
      }
      if (previous.status === "active" || previous.status === "starting") await this.deps.control.markSessionClosed(previous.id, "reconstructed");
      if (handoff) await this.deps.control.markHandoffRetired(handoff.id);
    }
    return { sessionId: session.id, adapterSessionId: opened.adapterSessionId };
  }

  async executeMind(sessionId: RuntimeSessionId, text: string, jobId: ExecutionJobId): Promise<{ outcome: "completed" | "failed" | "interrupted"; output: string }> {
    let job = await this.deps.control.getJob(jobId);
    if (job.runtimeSessionId !== sessionId) throw new DomainError("FORBIDDEN", "Mind turn belongs to another session");
    if (job.requestFingerprint !== createHash("sha256").update(text).digest("hex")) throw new DomainError("CONFLICT", "Mind turn content changed after planning");
    if (job.executionNodeId !== this.deps.nodeId) throw new DomainError("FORBIDDEN", "Mind job belongs to another execution node");
    if (job.status === "interrupted" && job.outcome === "approval_requires_retry") job = await this.deps.control.rearmAfterApproval(job.id);
    if (job.status !== "planned") throw new DomainError("INVALID_TRANSITION", `Mind job is ${job.status}`);
    const session = await this.deps.control.getSession(sessionId);
    if (session.status !== "active" || !session.adapterSessionId || !this.deps.runtime.hasAdapterSession(session.adapterSessionId)) throw new DomainError("INVARIANT", "A bootstrapped live mind is required");
    const harness = await this.deps.control.getHarness(session.harnessId);
    if (await this.deps.runtime.sessionHealth({ harnessKey: harness.key, adapterSessionId: session.adapterSessionId }) !== "alive") {
      throw new DomainError("INVARIANT", "Runtime session is not live");
    }
    job = await this.deps.control.claimJob(job.id, this.deps.nodeId, this.deps.bootId);
    await this.deps.control.transitionJob(job.id, "claimed", "bootstrapping");
    let output = "";
    let started = false;
    let terminal: "completed" | "failed" | "interrupted" = "failed";
    let failureStatus: RuntimeFailureStatus | null = null;
    const flushed = new Set<RuntimeLifecycleSignal>();
    try {
      await this.deps.control.renewJobLease(job.id, this.deps.nodeId, this.deps.bootId);
      const heartbeat = this.startLeaseHeartbeat(job.id, harness.key, session.adapterSessionId);
      try {
      for await (const event of this.deps.runtime.send({ harnessKey: harness.key, adapterSessionId: session.adapterSessionId,
        message: { text, executionId: job.id, idempotencyKey: job.idempotencyKey },
      })) {
        heartbeat.check();
        await this.deps.control.renewJobLease(job.id, this.deps.nodeId, this.deps.bootId);
        if (!started && event.type === "started") { await this.deps.control.transitionJob(job.id, "bootstrapping", "running"); started = true; }
        if (!started && (event.type === "output" || event.type === "effect_requested" || event.type === "completed" || event.type === "lifecycle")) {
          throw new DomainError("INVALID_TRANSITION", "Runtime emitted work before execution start");
        }
        if (event.type === "output") output += event.text;
        if (event.type === "lifecycle") {
          await this.deps.handoffPlanner.recordRuntimeLifecycle({ executionJobId: job.id, signal: event.signal,
            checkpointState: event.checkpointState, digest: event.digest });
          flushed.add(event.signal);
        }
        if (event.type === "effect_requested") {
          await this.mediateEffect(job, harness.key, session.adapterSessionId, event.request, heartbeat.check);
        }
        if (event.type === "failed") failureStatus = event.status;
        if (event.type === "completed" || event.type === "interrupted" || event.type === "failed") {
          terminal = event.type === "failed" ? "failed" : event.type;
          break;
        }
      }
      heartbeat.check();
      } finally {
        await heartbeat.stop();
      }
      heartbeat.check();
      const signal = selectLifecycleFlush({ capabilities: this.deps.runtime.capabilities(harness.key),
        purpose: "orchestrator_mind", outcome: terminal, failureStatus, observed: flushed });
      if (signal) await this.flush(job.id, signal, output);
      const current = await this.deps.control.getJob(job.id);
      if (current.status === "awaiting_approval" && terminal === "failed" && current.pendingApprovalId &&
        (await this.deps.control.getApproval(current.pendingApprovalId)).status !== "rejected") terminal = "interrupted";
      await this.deps.control.transitionJob(job.id, current.status, terminal,
        current.status === "awaiting_approval" ? terminal === "interrupted" ? "approval_requires_retry" : "approval_denied" : terminal);
      if (failureStatus) await this.failoverMind(session.id, failureStatus, job.operationId, job.id);
      return { outcome: terminal, output };
    } catch (error) {
      const signal = error instanceof RuntimeAdapterError && error.status === "QUOTA_EXHAUSTED" ? "quota_exhausted"
        : error instanceof RuntimeAdapterError && error.status === "RATE_LIMITED" ? "rate_limited" : "runtime_failure";
      const current = await this.deps.control.getJob(job.id);
      await this.deps.control.transitionJob(job.id, current.status, "failed", error instanceof Error ? error.message : "Runtime failed").catch(() => undefined);
      if (!flushed.has(signal)) await this.flush(job.id, signal, output).catch(() => undefined);
      if (error instanceof RuntimeAdapterError) await this.failoverMind(session.id, error.status, job.operationId, job.id);
      throw error;
    }
  }

  private async mediateEffect(job: ExecutionJob, harnessKey: string, adapterSessionId: string, request: EffectRequest, checkLease: () => void): Promise<void> {
    const principal = { kind: "tool" as const, executionJobId: job.id, agentRunId: job.agentRunId,
      workspaceId: job.workspaceId, projectId: job.projectId, operationId: job.operationId, taskId: job.taskId };
    let resolution = await this.deps.effects.authorize(principal, job.id, request);
    if (resolution.decision === "require_approval") {
      const approvalId = resolution.approvalId as ApprovalId;
      await this.deps.control.transitionJob(job.id, "running", "awaiting_approval", undefined, approvalId);
      await this.deps.handoffPlanner.recordRuntimeLifecycle({ executionJobId: job.id, signal: "approval_pause" });
      await this.deliverEffectResolution(job.id, harnessKey, adapterSessionId, request, resolution);
      if (approvalContinuation(this.deps.runtime.capabilities(harnessKey)) === "pause") {
        for (;;) {
          checkLease();
          if (await this.deps.runtime.sessionHealth({ harnessKey, adapterSessionId }) !== "alive") {
            throw new DomainError("INVARIANT", "Runtime died while awaiting effect approval");
          }
          const approval = await this.deps.control.getApproval(approvalId);
          if (approval.status === "approved") {
            await this.deps.control.transitionJob(job.id, "awaiting_approval", "running");
            resolution = await this.deps.effects.authorize(principal, job.id, request);
            break;
          }
          if (approval.status === "rejected") {
            resolution = { decision: "deny", reason: "User rejected this effect" };
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await this.deliverEffectResolution(job.id, harnessKey, adapterSessionId, request, resolution);
      }
      return;
    }
    await this.deliverEffectResolution(job.id, harnessKey, adapterSessionId, request, resolution);
  }

  private async deliverEffectResolution(jobId: ExecutionJobId, harnessKey: string, adapterSessionId: string,
    request: EffectRequest, resolution: Awaited<ReturnType<EffectAuthorizationPort["authorize"]>>): Promise<void> {
    if (resolution.decision === "allow") {
      try {
        if (!this.deps.effectExecutor) throw new DomainError("UNSUPPORTED_EFFECT", "No brokered effect executor is registered");
        const result = await this.deps.effectExecutor.execute({ executionJobId: jobId, grantId: resolution.grantId, request });
        await this.deps.runtime.resolveEffect({ harnessKey, adapterSessionId, requestKey: request.idempotencyKey,
          resolution: { ...resolution, result } });
      } catch (error) {
        await this.deps.runtime.resolveEffect({ harnessKey, adapterSessionId, requestKey: request.idempotencyKey,
          resolution: { decision: "deny", reason: "Brokered effect execution failed" } }).catch(() => undefined);
        throw error;
      }
      return;
    }
    await this.deps.runtime.resolveEffect({ harnessKey, adapterSessionId, requestKey: request.idempotencyKey, resolution });
  }

  private async flush(jobId: ExecutionJobId, signal: RuntimeLifecycleSignal, output: string): Promise<void> {
    await this.deps.handoffPlanner.recordRuntimeLifecycle({ executionJobId: jobId, signal,
      digest: { sourceCursor: `execution:${jobId}:${signal}`, sourceBytes: output.slice(-1_000_000) || `${jobId}:${signal}`,
        summary: `Runtime ${signal}`, observedDecisions: [], observedFindings: [], touchedArtifacts: [],
        verificationResult: null, openQuestions: [] } });
  }

  private startLeaseHeartbeat(jobId: ExecutionJobId, harnessKey: string, adapterSessionId: string) {
    let inFlight: Promise<void> | null = null;
    let failure: unknown = null;
    const tick = () => {
      if (inFlight || failure) return;
      inFlight = (async () => {
        try {
          await this.deps.control.renewJobLease(jobId, this.deps.nodeId, this.deps.bootId);
        } catch (error) {
          failure = error;
          await this.deps.runtime.interrupt({ harnessKey, adapterSessionId }).catch(() => undefined);
        } finally {
          inFlight = null;
        }
      })();
    };
    const timer = setInterval(tick, this.deps.leaseHeartbeatIntervalMs ?? 20_000);
    return {
      check: () => { if (failure) throw failure; },
      stop: async () => { clearInterval(timer); await inFlight; },
    };
  }

  private async failoverMind(sessionId: RuntimeSessionId, status: RuntimeFailureStatus, operationId: import("@kilic/domain").OperationId | null, jobId: ExecutionJobId): Promise<void> {
    if (status !== "QUOTA_EXHAUSTED" && status !== "RATE_LIMITED") return;
    const predecessor = await this.deps.control.getSession(sessionId);
    const result = await this.deps.handoffPlanner.requestHandoff({
      predecessorSessionId: sessionId, operationId, reason: status,
      causationId: await this.deps.control.latestJobEventId(jobId),
      checkpointState: { phase: "runtime_handoff", completed: [], remaining: [], importantFiles: [],
        risks: [status], notes: `Runtime failure: ${status}` },
      repositoryState: await this.deps.control.repositoryStateForOrchestrator(predecessor.orchestratorId, this.deps.nodeId),
    });
    if (result.plan.action === "open") await this.openMind(result.plan.session.id, sessionId);
  }

  async resumeMind(sessionId: RuntimeSessionId): Promise<{ status: "resumed" | "stale"; adapterSessionId: string | null }> {
    const session = await this.deps.control.getSession(sessionId);
    if (
      session.status === "active" &&
      session.adapterSessionId &&
      session.executionEpoch === this.deps.bootId
    ) {
      const harness = await this.deps.control.getHarness(session.harnessId);
      if (this.deps.runtime.capabilities(harness.key).supportsSessionResume) {
        await this.deps.runtime.resumeSession({ harnessKey: harness.key, adapterSessionId: session.adapterSessionId }).catch(() => undefined);
      }
      if (await this.deps.runtime.sessionHealth({ harnessKey: harness.key, adapterSessionId: session.adapterSessionId }) === "alive") {
        return { status: "resumed", adapterSessionId: session.adapterSessionId };
      }
    }
    await this.deps.control.markSessionInterrupted(session.id, "adapter_session_lost");
    return { status: "stale", adapterSessionId: null };
  }
}
