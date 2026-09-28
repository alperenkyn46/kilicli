import { describe, expect, it } from "vitest";
import type { Clock } from "@kilic/shared";
import { createInMemoryRepositories, seedFoundationCatalog } from "@kilic/db";
import { EffectAuthorization, ExecutionControl, Kernel } from "@kilic/kernel";
import { createSilentLogger } from "@kilic/observability";
import { ExecutionPlane } from "./execution.js";
import type { GitWorktreeManager } from "./worktree.js";

class MemoryTrees {
  removed: string[] = [];
  async create(): Promise<void> {}
  async remove(input: { worktreePath: string }): Promise<void> {
    this.removed.push(input.worktreePath);
  }
}

class MemoryRuntime {
  failOpen = false;
  live = new Set<string>();
  closed: string[] = [];

  capabilities() {
    return { supportsSessionResume: true, supportsTurnPauseResume: true, supportsToolInterception: true,
      supportsPreCompactionSignal: false, supportsSessionEndSignal: false, supportsStreaming: true, supportsInterrupt: true };
  }

  async sessionHealth(input: { adapterSessionId: string }): Promise<"alive" | "dead"> {
    return this.live.has(input.adapterSessionId) ? "alive" : "dead";
  }

  async resumeSession(): Promise<void> {}

  async status(): Promise<"AVAILABLE"> {
    return "AVAILABLE";
  }

  hasAdapterSession(id: string): boolean {
    return this.live.has(id);
  }

  async open(): Promise<{ adapterSessionId: string }> {
    if (this.failOpen) throw new Error("runtime open failed");
    const adapterSessionId = crypto.randomUUID();
    this.live.add(adapterSessionId);
    return { adapterSessionId };
  }

  async close(input: { adapterSessionId: string }): Promise<void> {
    this.live.delete(input.adapterSessionId);
    this.closed.push(input.adapterSessionId);
  }

  async interrupt(): Promise<void> {}
  async resolveEffect(): Promise<void> {}

  async *send(): AsyncIterable<{ type: "started" | "completed" }> {
    yield { type: "started" };
    yield { type: "completed" };
  }
}

describe("materialize compensation", () => {
  it("removes a worktree when database registration fails", async () => {
    const ctx = await setup();
    ctx.control.registerWorktree = async () => {
      throw new Error("registration failed");
    };
    await expect(ctx.plane.materialize({ runId: ctx.runId, repositoryId: ctx.repositoryId })).rejects.toThrow(
      /registration failed/,
    );
    expect(ctx.trees.removed).toHaveLength(1);
    expect(ctx.runtime.live.size).toBe(0);
    expect((await ctx.control.getSession(ctx.sessionId)).status).toBe("failed");
  });

  it("does not leave a starting session when runtime open fails", async () => {
    const ctx = await setup();
    ctx.runtime.failOpen = true;
    await expect(ctx.plane.materialize({ runId: ctx.runId, repositoryId: ctx.repositoryId })).rejects.toThrow(
      /runtime open failed/,
    );
    expect(ctx.trees.removed).toHaveLength(1);
    expect((await ctx.control.getSession(ctx.sessionId)).status).toBe("failed");
    expect((await ctx.control.getRun(ctx.runId)).status).toBe("failed");
  });

  it("closes an opened adapter session when persistence fails, then retries", async () => {
    const ctx = await setup();
    ctx.control.attachAdapterSession = async () => {
      throw new Error("persist failed");
    };
    await expect(ctx.plane.materialize({ runId: ctx.runId, repositoryId: ctx.repositoryId })).rejects.toThrow(
      /persist failed/,
    );
    expect(ctx.runtime.live.size).toBe(0);
    expect(ctx.runtime.closed).toHaveLength(1);
    expect(ctx.trees.removed).toHaveLength(1);

    const retried = ctx.rebuild();
    const result = await retried.plane.materialize({ runId: ctx.runId, repositoryId: ctx.repositoryId, retry: true });
    expect(result.cwd).toContain(ctx.runId);
    expect((await retried.control.getRun(ctx.runId)).status).toBe("planned");
    expect((await retried.control.getSession(ctx.sessionId)).status).toBe("active");
    expect((await retried.control.getSession(ctx.sessionId)).executionEpoch).toBe("boot");
  });

  it("treats a database-active session as stale when the adapter handle is gone", async () => {
    const ctx = await setup();
    const now = new Date("2026-09-28T00:02:00.000Z");
    await ctx.repos.runtimeSessions.attachAdapter(ctx.sessionId, "missing-handle", "boot", now);
    await ctx.repos.runtimeSessions.setStatus(ctx.sessionId, {
      status: "active",
      closeReason: null,
      endedAt: null,
      updatedAt: now,
    });
    const result = await ctx.plane.resumeMind(ctx.sessionId);
    expect(result.status).toBe("stale");
    expect((await ctx.control.getSession(ctx.sessionId)).status).toBe("interrupted");
  });
});

async function setup() {
  const repos = createInMemoryRepositories();
  await seedFoundationCatalog(repos);
  const runtime = new MemoryRuntime();
  const clock: Clock = () => new Date("2026-09-28T00:00:00.000Z");
  const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
  const user = await kernel.createUser({ displayName: "Alperen" });
  const workspace = await kernel.createWorkspace({ name: "Eco", slug: "eco", ownerUserId: user.id });
  const project = await kernel.createProject({ workspaceId: workspace.id, name: "Web", slug: "web" });
  const repository = await kernel.attachRepository({ projectId: project.id, name: "web", defaultBranch: "main" });
  await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "project", projectId: project.id });
  const node = await kernel.registerExecutionNode({
    machineKey: "local",
    displayName: "Local",
    kind: "local",
    status: "online",
  });
  await kernel.registerCheckout({ repositoryId: repository.id, executionNodeId: node.id, localPath: "/tmp/repo" });
  await repos.executionNodes.setBoot(node.id, "boot", new Date());
  const operation = await kernel.createOperation({ workspaceId: workspace.id, title: "Work" });
  const task = await kernel.createTask({ operationId: operation.id, projectId: project.id, title: "Task" });
  const dispatched = await kernel.dispatchWorker({
    taskId: task.id,
    role: "worker",
    access: "write",
    action: "file_write",
    executionNodeId: node.id,
    baseRef: "main",
  });
  if (dispatched.status !== "planned") throw new Error(dispatched.status);
  const trees = new MemoryTrees();
  const build = (activeRuntime: MemoryRuntime) => {
    const control = new ExecutionControl(repos, clock, "Test doctrine");
    const plane = new ExecutionPlane({
      control,
      runtime: activeRuntime,
      effects: new EffectAuthorization(repos, clock),
      handoffPlanner: kernel,
      worktrees: trees as unknown as GitWorktreeManager,
      worktreeRoot: "/tmp/worktrees",
      bootId: "boot",
      nodeId: node.id,
    });
    return { control, plane };
  };
  const first = build(runtime);
  return {
    repos,
    trees,
    runtime,
    control: first.control,
    plane: first.plane,
    runId: dispatched.run.id,
    repositoryId: repository.id,
    sessionId: dispatched.session.id,
    rebuild: () => build(runtime),
  };
}
