import { join } from "node:path";
import { DomainError } from "@kilic/shared";
import type { AgentRunId, RepositoryId, RuntimeSessionId, WorktreeId } from "@kilic/domain";
import type { ExecutionControl, RuntimeProcessPort } from "@kilic/kernel";
import type { GitWorktreeManager } from "./worktree.js";

const RETRYABLE = new Set(["starting", "failed", "interrupted"]);

export class ExecutionPlane {
  constructor(
    private readonly deps: {
      control: ExecutionControl;
      runtime: RuntimeProcessPort;
      worktrees: GitWorktreeManager;
      worktreeRoot: string;
      bootId: string;
    },
  ) {}

  async materialize(input: { runId: AgentRunId; repositoryId: RepositoryId }): Promise<{ cwd: string }> {
    let run = await this.deps.control.getRun(input.runId);
    if (!run.runtimeSessionId) throw new DomainError("NOT_FOUND", "Planned run is missing a runtime session");
    let session = await this.deps.control.getSession(run.runtimeSessionId);
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
    let openedId: string | null = null;
    const harness = await this.deps.control.getHarness(session.harnessId);
    const model = await this.deps.control.getModel(session.modelId);

    try {
      if (run.isolation?.mode === "worktree") {
        cwd = join(this.deps.worktreeRoot, run.id);
        await this.deps.worktrees.create({
          repositoryRoot: checkout.localPath,
          worktreePath: cwd,
          branch: run.isolation.branch,
          baseRef: run.isolation.baseRef,
        });
        const worktree = await this.deps.control.registerWorktree({
          repositoryId: input.repositoryId,
          agentRunId: run.id,
          executionNodeId: session.executionNodeId,
          branch: run.isolation.branch,
          path: cwd,
          baseRef: run.isolation.baseRef,
        });
        worktreeId = worktree.id;
      } else if (run.access === "write") {
        throw new DomainError("INVARIANT", "A write-capable run requires a worktree plan");
      }

      const opened = await this.deps.runtime.open({
        harnessKey: harness.key,
        modelKey: model.key,
        role: run.role,
        cwd,
      });
      openedId = opened.adapterSessionId;
      await this.deps.control.attachAdapterSession(session.id, opened.adapterSessionId, this.deps.bootId);
      await this.deps.control.markRunRunning(run.id);
      return { cwd };
    } catch (error) {
      if (openedId) {
        await this.deps.runtime.close({ harnessKey: harness.key, adapterSessionId: openedId }).catch(() => undefined);
      }
      if (worktreeId) await this.deps.control.markWorktreeRemoved(worktreeId);
      if (run.isolation?.mode === "worktree") {
        await this.deps.worktrees.remove({ repositoryRoot: checkout.localPath, worktreePath: cwd }).catch(() => undefined);
      }
      await this.deps.control.markSessionFailed(session.id, error instanceof Error ? error.message : "materialize failed");
      await this.deps.control.markRunFailed(run.id);
      throw error;
    }
  }

  async openMind(
    sessionId: RuntimeSessionId,
    closePreviousSessionId?: RuntimeSessionId | null,
  ): Promise<{ sessionId: RuntimeSessionId; adapterSessionId: string }> {
    if (closePreviousSessionId) {
      const previous = await this.deps.control.getSession(closePreviousSessionId);
      if (previous.adapterSessionId && this.deps.runtime.hasAdapterSession(previous.adapterSessionId)) {
        const previousHarness = await this.deps.control.getHarness(previous.harnessId);
        await this.deps.runtime.close({
          harnessKey: previousHarness.key,
          adapterSessionId: previous.adapterSessionId,
        });
      }
      await this.deps.control.markSessionClosed(previous.id, "reconstructed");
    }
    const session = await this.deps.control.getSession(sessionId);
    if (session.purpose !== "orchestrator_mind") {
      throw new DomainError("INVARIANT", "Mind materialization requires an orchestrator session");
    }
    if (session.status !== "starting") {
      throw new DomainError("INVALID_TRANSITION", `Mind session ${session.status} is not ready to open`);
    }
    const harness = await this.deps.control.getHarness(session.harnessId);
    const model = await this.deps.control.getModel(session.modelId);
    const opened = await this.deps.runtime.open({ harnessKey: harness.key, modelKey: model.key, role: "orchestrator" });
    try {
      await this.deps.control.attachAdapterSession(session.id, opened.adapterSessionId, this.deps.bootId);
    } catch (error) {
      await this.deps.runtime.close({ harnessKey: harness.key, adapterSessionId: opened.adapterSessionId }).catch(() => undefined);
      await this.deps.control.markSessionFailed(session.id, "adapter session was not persisted");
      throw error;
    }
    return { sessionId: session.id, adapterSessionId: opened.adapterSessionId };
  }

  async resumeMind(sessionId: RuntimeSessionId): Promise<{ status: "resumed" | "stale"; adapterSessionId: string | null }> {
    const session = await this.deps.control.getSession(sessionId);
    if (
      session.status === "active" &&
      session.adapterSessionId &&
      session.executionEpoch === this.deps.bootId &&
      this.deps.runtime.hasAdapterSession(session.adapterSessionId)
    ) {
      return { status: "resumed", adapterSessionId: session.adapterSessionId };
    }
    await this.deps.control.markSessionInterrupted(session.id, "adapter_session_lost");
    return { status: "stale", adapterSessionId: null };
  }
}
