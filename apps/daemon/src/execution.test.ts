import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryRepositories, seedFoundationCatalog } from "@kilic/db";
import { EffectAuthorization, ExecutionControl, Kernel } from "@kilic/kernel";
import { createSilentLogger } from "@kilic/observability";
import { MockRuntimeAdapter } from "@kilic/runtime-contract";
import { newId, type Clock } from "@kilic/shared";
import { ExecutionPlane } from "./execution.js";
import { RuntimeAdapterRegistry } from "./registry.js";
import { GitWorktreeManager } from "./worktree.js";

const exec = promisify(execFile);
const directories: string[] = [];
const tempRoot = fileURLToPath(new URL("../../../.tmp/daemon", import.meta.url));
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Kilic",
  GIT_AUTHOR_EMAIL: "kilic@example.com",
  GIT_COMMITTER_NAME: "Kilic",
  GIT_COMMITTER_EMAIL: "kilic@example.com",
};

describe("execution plane", () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("never activates a mind whose doctrine was not loaded into bootstrap", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const firstHarness = (await repos.harnesses.list())[0];
    if (!firstHarness) throw new Error("missing harness");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: firstHarness.key }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "missing-doctrine", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "no-doctrine", displayName: "Node", kind: "local", status: "online" });
    await repos.executionNodes.setBoot(node.id, "boot", clock());
    const plan = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (plan.action !== "open") throw new Error("expected plan");
    const plane = new ExecutionPlane({ control: new ExecutionControl(repos, clock, ""), runtime, handoffPlanner: kernel,
      effects: new EffectAuthorization(repos, clock), worktrees: new GitWorktreeManager(),
      worktreeRoot: await temporaryDirectory(), bootId: "boot", nodeId: node.id });
    await expect(plane.openMind(plan.session.id)).rejects.toThrow(/doctrine/);
    expect((await repos.runtimeSessions.get(plan.session.id))?.status).toBe("failed");
  });

  it("materializes a write run inside a worktree and does not delete the branch", async () => {
    const repositoryRoot = await temporaryDirectory();
    await exec("git", ["init", "-b", "main"], { cwd: repositoryRoot, env: gitEnv });
    await writeFile(join(repositoryRoot, "README.md"), "base\n");
    await exec("git", ["add", "README.md"], { cwd: repositoryRoot, env: gitEnv });
    await exec("git", ["commit", "-m", "base"], { cwd: repositoryRoot, env: gitEnv });

    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const harnesses = await repos.harnesses.list();
    const primary = harnesses[0];
    if (!primary) throw new Error("missing harness");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: primary.key }));
    const kernel = new Kernel({ repos, runtime, clock: incrementingClock(), logger: createSilentLogger() });

    const user = await kernel.createUser({ displayName: "Alperen" });
    const workspace = await kernel.createWorkspace({ name: "Ecosystem", slug: "ecosystem", ownerUserId: user.id });
    const project = await kernel.createProject({ workspaceId: workspace.id, name: "Web", slug: "web" });
    const repository = await kernel.attachRepository({
      projectId: project.id,
      name: "web",
      defaultBranch: "main",
    });
    await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "project", projectId: project.id });
    const node = await kernel.registerExecutionNode({
      machineKey: "local-test",
      displayName: "Local",
      kind: "local",
      status: "online",
    });
    await kernel.registerCheckout({ repositoryId: repository.id, executionNodeId: node.id, localPath: repositoryRoot });
    const bootId = "boot-test";
    await repos.executionNodes.setBoot(node.id, bootId, new Date());
    const operation = await kernel.createOperation({ workspaceId: workspace.id, title: "Screen" });
    const task = await kernel.createTask({ operationId: operation.id, projectId: project.id, title: "Redraw" });
    const dispatched = await kernel.dispatchWorker({
      taskId: task.id,
      role: "worker",
      access: "write",
      action: "file_write",
      executionNodeId: node.id,
      baseRef: "main",
    });
    if (dispatched.status !== "planned" || dispatched.run.isolation?.mode !== "worktree") {
      throw new Error("expected a worktree plan");
    }

    const worktreeRoot = await temporaryDirectory();
    const plane = new ExecutionPlane({
      control: new ExecutionControl(repos, incrementingClock(), "Test doctrine"),
      runtime,
      handoffPlanner: kernel,
      effects: new EffectAuthorization(repos, incrementingClock()),
      worktrees: new GitWorktreeManager(),
      worktreeRoot,
      bootId,
      nodeId: node.id,
    });
    const foreignNode = await kernel.registerExecutionNode({ machineKey: "foreign-node", displayName: "Foreign", kind: "local", status: "online" });
    const foreignPlane = new ExecutionPlane({ control: new ExecutionControl(repos, incrementingClock(), "Test doctrine"),
      runtime, effects: new EffectAuthorization(repos, incrementingClock()), handoffPlanner: kernel, worktrees: new GitWorktreeManager(),
      worktreeRoot, bootId, nodeId: foreignNode.id });
    await expect(foreignPlane.materialize({ runId: dispatched.run.id, repositoryId: repository.id })).rejects.toThrow(/another execution node/);
    const materialized = await plane.materialize({ runId: dispatched.run.id, repositoryId: repository.id });
    expect(materialized.cwd).toBe(join(worktreeRoot, dispatched.run.id));
    expect((await repos.agentRuns.get(dispatched.run.id))?.status).toBe("planned");
    const outcome = await plane.executeRun(dispatched.run.id);
    expect(outcome.outcome).toBe("completed");
    expect((await repos.agentRuns.get(dispatched.run.id))?.status).toBe("completed");
    await expect(
      exec("git", ["show-ref", "--verify", `refs/heads/${dispatched.run.isolation.branch}`], { cwd: repositoryRoot }),
    ).resolves.toBeTruthy();
    const manager = new GitWorktreeManager();
    await manager.remove({ repositoryRoot, worktreePath: materialized.cwd });
    const reconciliation = await plane.reconcileWorktrees();
    expect(reconciliation.missingPaths).toContain(materialized.cwd);
    expect(reconciliation.orphanBranches).toContain(`${repository.id}:${dispatched.run.isolation.branch}`);
    await expect(
      exec("git", ["show-ref", "--verify", `refs/heads/${dispatched.run.isolation.branch}`], { cwd: repositoryRoot }),
    ).resolves.toBeTruthy();
  });

  it("persists a checkpoint before quota failover and keeps the predecessor on successor start failure", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const [primary, secondary] = await repos.harnesses.list();
    if (!primary || !secondary) throw new Error("missing harnesses");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: primary.key, fail: { status: "QUOTA_EXHAUSTED", at: "send" } }));
    runtime.register(new MockRuntimeAdapter({ harnessKey: secondary.key, fail: { status: "FAILED", at: "start" } }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "quota-test", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "quota-node", displayName: "Node", kind: "local", status: "online" });
    const bootId = "quota-boot";
    await repos.executionNodes.setBoot(node.id, bootId, clock());
    const plan = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (plan.action !== "open") throw new Error("expected mind plan");
    const plane = new ExecutionPlane({ control: new ExecutionControl(repos, clock, "Test doctrine"), runtime,
      effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId, nodeId: node.id });
    await plane.openMind(plan.session.id);
    const original = await kernel.planMindTurn({ sessionId: plan.session.id, idempotencyKey: "quota-turn",
      textDigest: createHash("sha256").update("Continue").digest("hex") });
    expect(original.status).toBe("planned");
    await expect(plane.executeMind(plan.session.id, "Continue", original.id)).rejects.toThrow(/QUOTA_EXHAUSTED|FAILED/);
    const handoff = await repos.runtimeHandoffs.latestForPredecessor(plan.session.id);
    expect(handoff?.checkpointId).toBeTruthy();
    expect(handoff?.status).toBe("failed");
    expect((await repos.runtimeSessions.get(plan.session.id))?.status).toBe("active");
    expect((await repos.executionJobs.get(original.id))?.status).toBe("failed");
  });

  it("opens the fallback runtime before retiring the quota-exhausted predecessor", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const [primary, secondary] = await repos.harnesses.list();
    if (!primary || !secondary) throw new Error("missing harnesses");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: primary.key, fail: { status: "QUOTA_EXHAUSTED", at: "send" } }));
    runtime.register(new MockRuntimeAdapter({ harnessKey: secondary.key }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "quota-success", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "quota-success-node", displayName: "Node", kind: "local", status: "online" });
    const bootId = "quota-success-boot";
    await repos.executionNodes.setBoot(node.id, bootId, clock());
    const plan = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (plan.action !== "open") throw new Error("expected mind plan");
    const plane = new ExecutionPlane({ control: new ExecutionControl(repos, clock, "Test doctrine"), runtime,
      effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId, nodeId: node.id });
    await plane.openMind(plan.session.id);
    const turn = await kernel.planMindTurn({ sessionId: plan.session.id, idempotencyKey: "quota-success-turn",
      textDigest: createHash("sha256").update("Continue").digest("hex") });
    await expect(plane.executeMind(plan.session.id, "Continue", turn.id)).rejects.toThrow(/QUOTA_EXHAUSTED/);
    const handoff = await repos.runtimeHandoffs.latestForPredecessor(plan.session.id);
    expect(handoff?.status).toBe("predecessor_retired");
    expect(handoff?.checkpointId).toBeTruthy();
    expect((await repos.runtimeSessions.get(plan.session.id))?.status).toBe("closed");
    expect((await repos.runtimeSessions.get(handoff!.successorSessionId!))?.status).toBe("active");
  });

  it("recovers a planned successor after a daemon restart", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const [primary, secondary] = await repos.harnesses.list();
    if (!primary || !secondary) throw new Error("missing harnesses");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: primary.key }));
    runtime.register(new MockRuntimeAdapter({ harnessKey: secondary.key }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "restart-handoff", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "restart-handoff-node", displayName: "Node", kind: "local", status: "online" });
    await repos.executionNodes.setBoot(node.id, "before-restart", clock());
    const control = new ExecutionControl(repos, clock, "Test doctrine");
    const before = new ExecutionPlane({ control, runtime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId: "before-restart", nodeId: node.id });
    const first = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (first.action !== "open") throw new Error("expected mind plan");
    await before.openMind(first.session.id);
    const planned = await kernel.requestHandoff({ predecessorSessionId: first.session.id, reason: "RATE_LIMITED",
      checkpointState: { phase: "handoff", completed: [], remaining: [], importantFiles: [], risks: [], notes: "Continue" },
      repositoryState: {} });
    expect(planned.handoff.status).toBe("successor_planned");
    await control.rotateBoot(node.id, "after-restart");
    const freshRuntime = new RuntimeAdapterRegistry();
    freshRuntime.register(new MockRuntimeAdapter({ harnessKey: primary.key }));
    freshRuntime.register(new MockRuntimeAdapter({ harnessKey: secondary.key }));
    const after = new ExecutionPlane({ control, runtime: freshRuntime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId: "after-restart", nodeId: node.id });
    expect(await after.reconcileHandoffs()).toEqual({ recovered: [planned.handoff.id], failed: [] });
    expect((await repos.runtimeHandoffs.get(planned.handoff.id))?.status).toBe("predecessor_retired");
    expect((await repos.runtimeSessions.get(planned.plan.session.id))?.status).toBe("active");
  });

  it("plans a successor from a committed checkpoint after a crash", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const [primary, secondary] = await repos.harnesses.list();
    if (!primary || !secondary) throw new Error("missing harnesses");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: primary.key }));
    runtime.register(new MockRuntimeAdapter({ harnessKey: secondary.key }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "checkpoint-recovery", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "checkpoint-recovery-node", displayName: "Node", kind: "local", status: "online" });
    await repos.executionNodes.setBoot(node.id, "old-boot", clock());
    const control = new ExecutionControl(repos, clock, "Test doctrine");
    const first = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (first.action !== "open") throw new Error("expected mind plan");
    const before = new ExecutionPlane({ control, runtime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId: "old-boot", nodeId: node.id });
    await before.openMind(first.session.id);
    const checkpoint = await kernel.recordCheckpoint({ orchestratorId: orchestrator.id, runtimeSessionId: first.session.id,
      trigger: "before_runtime_switch", state: { phase: "handoff", completed: [], remaining: [], importantFiles: [], risks: [], notes: "Continue" } });
    const handoffId = newId<"RuntimeHandoffId">();
    await repos.runtimeHandoffs.insert({ id: handoffId, predecessorSessionId: first.session.id, successorSessionId: null,
      orchestratorId: orchestrator.id, workspaceId: workspace.id, operationId: null, taskId: null,
      checkpointId: checkpoint.id, digestId: null, repositoryState: {}, reason: "RATE_LIMITED", status: "checkpointed",
      correlationId: first.session.correlationId, causationId: null, createdAt: clock(), updatedAt: clock() });
    await control.rotateBoot(node.id, "new-boot");
    const freshRuntime = new RuntimeAdapterRegistry();
    freshRuntime.register(new MockRuntimeAdapter({ harnessKey: primary.key }));
    freshRuntime.register(new MockRuntimeAdapter({ harnessKey: secondary.key }));
    const after = new ExecutionPlane({ control, runtime: freshRuntime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId: "new-boot", nodeId: node.id });
    expect(await after.reconcileHandoffs()).toEqual({ recovered: [handoffId], failed: [] });
    const recovered = await repos.runtimeHandoffs.get(handoffId);
    expect(recovered?.status).toBe("predecessor_retired");
    expect((await repos.runtimeSessions.get(recovered!.successorSessionId!))?.status).toBe("active");
  });

  it("interrupts a silent runtime when its node loses the execution lease", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const harness = (await repos.harnesses.list())[0];
    if (!harness) throw new Error("missing harness");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: harness.key, openEnded: true }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "lease-heartbeat", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "lease-heartbeat-node", displayName: "Node", kind: "local", status: "online" });
    const control = new ExecutionControl(repos, clock, "Test doctrine");
    await repos.executionNodes.setBoot(node.id, "first-boot", clock());
    const plane = new ExecutionPlane({ control, runtime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(),
      bootId: "first-boot", nodeId: node.id, leaseHeartbeatIntervalMs: 10 });
    const first = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (first.action !== "open") throw new Error("expected mind plan");
    await plane.openMind(first.session.id);
    const turn = await kernel.planMindTurn({ sessionId: first.session.id, idempotencyKey: "silent-lease-turn",
      textDigest: createHash("sha256").update("Continue").digest("hex") });
    const rejection = expect(plane.executeMind(first.session.id, "Continue", turn.id)).rejects.toThrow(/lease|boot/i);
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await repos.executionJobs.get(turn.id))?.status === "running") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect((await repos.executionJobs.get(turn.id))?.status).toBe("running");
    await control.rotateBoot(node.id, "second-boot");
    await rejection;
    expect((await repos.executionJobs.get(turn.id))?.status).toBe("interrupted");
  });

  it("blocks a mock runtime effect until an exact approval is granted", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const harness = (await repos.harnesses.list())[0];
    if (!harness) throw new Error("missing harness");
    const runtime = new RuntimeAdapterRegistry();
    const adapter = new MockRuntimeAdapter({ harnessKey: harness.key, effectRequest: {
      idempotencyKey: "force-push-1", action: "force_push", resource: "repo/main", description: "Rewrite main",
    } });
    runtime.register(adapter);
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "mock-effect-approval", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "mock-effect-node", displayName: "Node", kind: "local", status: "online" });
    await repos.executionNodes.setBoot(node.id, "effect-boot", clock());
    const control = new ExecutionControl(repos, clock, "Test doctrine");
    const executed: string[] = [];
    const plane = new ExecutionPlane({ control, runtime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      effectExecutor: { execute: async ({ grantId }) => { executed.push(grantId); return { ok: true }; } },
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId: "effect-boot", nodeId: node.id });
    const plan = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (plan.action !== "open") throw new Error("expected mind plan");
    await plane.openMind(plan.session.id);
    const turn = await kernel.planMindTurn({ sessionId: plan.session.id, idempotencyKey: "effect-turn",
      textDigest: createHash("sha256").update("Continue").digest("hex") });
    const pending = plane.executeMind(plan.session.id, "Continue", turn.id);
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await repos.executionJobs.get(turn.id))?.status === "awaiting_approval") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect((await repos.executionJobs.get(turn.id))?.status).toBe("awaiting_approval");
    const approval = await repos.approvals.findEffectRequest(turn.id, "force-push-1");
    expect(approval?.status).toBe("pending");
    expect(await repos.effectGrants.getByRequest(turn.id, "force-push-1")).toBeNull();
    await repos.approvals.decide(approval!.id, "approved", clock());
    expect((await pending).outcome).toBe("completed");
    expect(executed).toHaveLength(1);
    expect(adapter.providerSideEffectCount).toBe(0);
    expect((await repos.effectGrants.getByRequest(turn.id, "force-push-1"))?.consumedAt).toBeTruthy();
    await expect(plane.executeMind(plan.session.id, "Continue", turn.id)).rejects.toThrow(/completed/);
    await expect(kernel.decideApproval(approval!.id, "approved")).rejects.toThrow(/pending/);
    expect(executed).toHaveLength(1);
    const deniedTurn = await kernel.planMindTurn({ sessionId: plan.session.id, idempotencyKey: "denied-turn",
      textDigest: createHash("sha256").update("Denied").digest("hex") });
    const denied = plane.executeMind(plan.session.id, "Denied", deniedTurn.id);
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await repos.executionJobs.get(deniedTurn.id))?.status === "awaiting_approval") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const denial = await repos.approvals.findEffectRequest(deniedTurn.id, "force-push-1");
    await repos.approvals.decide(denial!.id, "rejected", clock());
    expect((await denied).outcome).toBe("failed");
    expect(executed).toHaveLength(1);
  });

  it("uses an explicit approved retry when a runtime cannot pause a turn", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const harness = (await repos.harnesses.list())[0];
    if (!harness) throw new Error("missing harness");
    const adapter = new MockRuntimeAdapter({ harnessKey: harness.key,
      capabilities: { supportsTurnPauseResume: false },
      effectRequest: { idempotencyKey: "protected-1", action: "force_push", resource: "repo/main", description: "Rewrite main" } });
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(adapter);
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "approval-retry", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "approval-retry-node", displayName: "Node", kind: "local", status: "online" });
    await repos.executionNodes.setBoot(node.id, "retry-boot", clock());
    const control = new ExecutionControl(repos, clock, "Test doctrine");
    const executed: string[] = [];
    const plane = new ExecutionPlane({ control, runtime, effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel,
      effectExecutor: { execute: async ({ grantId }) => { executed.push(grantId); return { ok: true }; } },
      worktrees: new GitWorktreeManager(), worktreeRoot: await temporaryDirectory(), bootId: "retry-boot", nodeId: node.id });
    const plan = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (plan.action !== "open") throw new Error("expected mind plan");
    await plane.openMind(plan.session.id);
    const turn = await kernel.planMindTurn({ sessionId: plan.session.id, idempotencyKey: "retry-turn",
      textDigest: createHash("sha256").update("Continue").digest("hex") });
    expect((await plane.executeMind(plan.session.id, "Continue", turn.id)).outcome).toBe("interrupted");
    expect((await repos.executionJobs.get(turn.id))?.outcome).toBe("approval_requires_retry");
    expect(executed).toHaveLength(0);
    await expect(plane.executeMind(plan.session.id, "Continue", turn.id)).rejects.toThrow(/not been granted/);
    expect(adapter.turnStartCount).toBe(1);
    const approval = await repos.approvals.findEffectRequest(turn.id, "protected-1");
    await repos.approvals.decide(approval!.id, "approved", clock());
    expect((await plane.executeMind(plan.session.id, "Continue", turn.id)).outcome).toBe("completed");
    expect(adapter.turnStartCount).toBe(2);
    expect(executed).toHaveLength(1);
    expect(adapter.providerSideEffectCount).toBe(0);
  });

  it("durably flushes mock lifecycle signals to scoped checkpoints and digest ingestion", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const harness = (await repos.harnesses.list())[0];
    if (!harness) throw new Error("missing harness");
    const runtime = new RuntimeAdapterRegistry();
    runtime.register(new MockRuntimeAdapter({ harnessKey: harness.key, lifecycleSignals: ["pre_compaction", "session_ending"] }));
    const clock = incrementingClock();
    const kernel = new Kernel({ repos, runtime, clock, logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "lifecycle-flush", ownerUserId: user.id });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const node = await kernel.registerExecutionNode({ machineKey: "lifecycle-flush-node", displayName: "Node", kind: "local", status: "online" });
    await repos.executionNodes.setBoot(node.id, "flush-boot", clock());
    const plane = new ExecutionPlane({ control: new ExecutionControl(repos, clock, "Test doctrine"), runtime,
      effects: new EffectAuthorization(repos, clock), handoffPlanner: kernel, worktrees: new GitWorktreeManager(),
      worktreeRoot: await temporaryDirectory(), bootId: "flush-boot", nodeId: node.id });
    const plan = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
      contextHealth: "healthy", explicitSwitch: false });
    if (plan.action !== "open") throw new Error("expected mind plan");
    await plane.openMind(plan.session.id);
    const turn = await kernel.planMindTurn({ sessionId: plan.session.id, idempotencyKey: "flush-turn",
      textDigest: createHash("sha256").update("Continue").digest("hex") });
    expect((await plane.executeMind(plan.session.id, "Continue", turn.id)).outcome).toBe("completed");
    const events = (await repos.events.listByAggregate("execution_job", turn.id)).filter((event) => event.type === "runtime.lifecycle");
    expect(events.map((event) => event.payload.signal)).toEqual(["pre_compaction", "session_ending"]);
    for (const event of events) {
      const checkpoint = await repos.checkpoints.get(event.payload.checkpointId as import("@kilic/domain").CheckpointId);
      expect(checkpoint?.workspaceId).toBe(workspace.id);
      expect(checkpoint?.runtimeSessionId).toBe(plan.session.id);
    }
    const first = await repos.digestIngestions.claimDue(clock());
    const second = await repos.digestIngestions.claimDue(clock());
    expect(new Set([first?.sourceCursor, second?.sourceCursor])).toEqual(new Set([
      `${turn.id}:flush-turn:pre_compaction`, `${turn.id}:flush-turn:session_ending`,
    ]));
    expect((await kernel.recordRuntimeLifecycle({ executionJobId: turn.id, signal: "pre_compaction",
      checkpointState: { phase: "pre_compaction", completed: [], remaining: [], importantFiles: [], risks: [], notes: null },
      digest: { sourceCursor: `${turn.id}:flush-turn:pre_compaction`, sourceBytes: "Continue", summary: "Runtime pre_compaction",
        observedDecisions: [], observedFindings: [], touchedArtifacts: [], verificationResult: null, openQuestions: [] } })).queuedDigest).toBe(false);
  });
});

function incrementingClock(): Clock {
  let tick = Date.parse("2026-09-28T00:00:00.000Z");
  return () => new Date((tick += 1000));
}

async function temporaryDirectory(): Promise<string> {
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, "kilic-exec-"));
  directories.push(directory);
  return directory;
}
