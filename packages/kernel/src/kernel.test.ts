import { describe, expect, it } from "vitest";
import type { Clock } from "@kilic/shared";
import type { RuntimeStatus } from "@kilic/runtime-contract";
import { createSilentLogger } from "@kilic/observability";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { seedFoundationCatalog } from "@kilic/db/seed";
import { Kernel } from "./index.js";

describe("foundation control plane", () => {
  it("runs workspace and project orchestrators without treating a session as identity", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const harnesses = await repos.harnesses.list();
    const primary = harnesses[0];
    const secondary = harnesses[1];
    if (!primary || !secondary) throw new Error("catalog missing harnesses");

    const gateway = new ScriptedGateway((key) => {
      if (key === primary.key) return "QUOTA_EXHAUSTED";
      if (key === secondary.key) return "AVAILABLE";
      return "OFFLINE";
    });
    const kernel = new Kernel({
      repos,
      runtime: gateway,
      clock: incrementingClock(),
      logger: createSilentLogger(),
    });

    const user = await kernel.createUser({ displayName: "Alperen" });
    const workspace = await kernel.createWorkspace({ name: "Agent Ecosystem", slug: "agent-ecosystem", ownerUserId: user.id });
    const project = await kernel.createProject({ workspaceId: workspace.id, name: "Web", slug: "web" });
    const node = await kernel.registerExecutionNode({
      machineKey: "local-1",
      displayName: "Local",
      kind: "local",
      status: "online",
    });
    const workspaceOrchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
    const projectOrchestrator = await kernel.ensureOrchestrator({
      workspaceId: workspace.id,
      kind: "project",
      projectId: project.id,
    });

    expect(workspaceOrchestrator.id).not.toBe(projectOrchestrator.id);
    expect(workspaceOrchestrator.projectId).toBeNull();
    expect(projectOrchestrator.projectId).toBe(project.id);
    expect(workspaceOrchestrator).not.toHaveProperty("harnessId");

    const operation = await kernel.createOperation({
      workspaceId: workspace.id,
      title: "Giriş ekranını yenile",
      description: "Auth davranışı bozulmasın",
      language: "tr",
    });
    const blocked = await kernel.createTask({
      operationId: operation.id,
      projectId: project.id,
      title: "Sözleşmeyi koru",
      language: "tr",
    });
    const task = await kernel.createTask({
      operationId: operation.id,
      projectId: project.id,
      title: "Ekranı yenile",
      language: "tr",
    });
    await kernel.addTaskDependency(task.id, blocked.id);
    expect((await repos.tasks.get(task.id))?.status).toBe("pending");
    await kernel.transitionTask(blocked.id, "in_progress");
    await kernel.transitionTask(blocked.id, "completed");
    expect((await repos.tasks.get(task.id))?.status).toBe("ready");

    const planned = await kernel.dispatchWorker({
      taskId: task.id,
      role: "worker",
      access: "write",
      action: "file_write",
      executionNodeId: node.id,
      baseRef: "main",
    });
    expect(planned.status).toBe("planned");
    if (planned.status === "planned") {
      expect(planned.run.isolation).toMatchObject({ mode: "worktree" });
      expect(planned.session.orchestratorId).toBe(projectOrchestrator.id);
      expect(planned.session.purpose).toBe("worker");
      expect(planned.session.status).toBe("starting");
    }

    const approval = await kernel.dispatchWorker({
      taskId: task.id,
      role: "worker",
      access: "write",
      action: "force_push",
      executionNodeId: node.id,
      baseRef: "main",
    });
    expect(approval.status).toBe("approval_required");
    if (approval.status !== "approval_required") return;
    const afterDeniedDispatch = await repos.events.listByCorrelation(operation.correlationId);
    expect(afterDeniedDispatch.filter((event) => event.type === "workforce.dispatch_planned")).toHaveLength(1);
    expect(afterDeniedDispatch.filter((event) => event.type === "workforce.approval_required")).toHaveLength(1);

    const denied = await kernel.decideApproval(approval.approval.id, "rejected");
    expect(denied.status).toBe("rejected");
    await expect(
      kernel.dispatchWorker({
        taskId: task.id,
        role: "worker",
        access: "write",
        action: "force_push",
        executionNodeId: node.id,
        baseRef: "main",
        approvalId: approval.approval.id,
      }),
    ).rejects.toThrow(/does not grant/);

    const opened = await kernel.planMindSession({
      orchestratorId: workspaceOrchestrator.id,
      executionNodeId: node.id,
      contextHealth: "healthy",
      explicitSwitch: false,
      operationId: operation.id,
    });
    expect(opened.action).toBe("open");
    if (opened.action !== "open") return;
    expect(opened.session.status).toBe("starting");
    expect(opened.session.adapterSessionId).toBeNull();
    expect(opened.session.harnessId).toBe(secondary.id);
    expect((await repos.orchestrators.get(workspaceOrchestrator.id))?.status).toBe("active");

    await repos.executionNodes.setBoot(node.id, "boot-1", new Date("2026-09-28T00:10:00.000Z"));
    await repos.runtimeSessions.attachAdapter(opened.session.id, "adapter-1", "boot-1", new Date("2026-09-28T00:10:01.000Z"));
    await repos.runtimeSessions.setStatus(opened.session.id, {
      status: "active",
      closeReason: null,
      endedAt: null,
      updatedAt: new Date("2026-09-28T00:10:01.000Z"),
    });

    const reused = await kernel.planMindSession({
      orchestratorId: workspaceOrchestrator.id,
      executionNodeId: node.id,
      contextHealth: "healthy",
      explicitSwitch: false,
      operationId: operation.id,
    });
    expect(reused.action).toBe("resume");
    expect(reused.session.id).toBe(opened.session.id);

    const reconstructed = await kernel.planMindSession({
      orchestratorId: workspaceOrchestrator.id,
      executionNodeId: node.id,
      contextHealth: "degraded",
      explicitSwitch: false,
      operationId: operation.id,
    });
    expect(reconstructed.action).toBe("open");
    if (reconstructed.action !== "open") return;
    expect(reconstructed.reason).toBe("context_degraded");
    expect(reconstructed.closePreviousSessionId).toBe(opened.session.id);
    expect((await repos.runtimeSessions.get(opened.session.id))?.status).toBe("active");

    const checkpoint = await kernel.recordCheckpoint({
      orchestratorId: projectOrchestrator.id,
      operationId: operation.id,
      taskId: task.id,
      trigger: "before_runtime_switch",
      state: {
        phase: "implementation",
        completed: ["contract guard"],
        remaining: ["screen"],
        importantFiles: [],
        risks: [],
        notes: "Türkçe not korunur",
      },
    });
    expect((await repos.checkpoints.latestForOrchestrator(projectOrchestrator.id))?.id).toBe(checkpoint.id);

    const history = await repos.events.listByCorrelation(operation.correlationId);
    expect(history.map((event) => event.type)).toContain("operation.created");
    expect(history.map((event) => event.type)).toContain("task.created");
    expect("update" in repos.events).toBe(false);
  });
});

class ScriptedGateway {
  constructor(private readonly statuses: (harnessKey: string) => RuntimeStatus) {}

  async status(harnessKey: string): Promise<RuntimeStatus> {
    return this.statuses(harnessKey);
  }
}

function incrementingClock(): Clock {
  let tick = Date.parse("2026-09-28T00:00:00.000Z");
  return () => {
    tick += 1000;
    return new Date(tick);
  };
}
