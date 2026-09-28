import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { seedFoundationCatalog } from "@kilic/db/seed";
import { createSilentLogger } from "@kilic/observability";
import { Kernel } from "./kernel.js";
import { buildBootstrapContext } from "./bootstrap.js";

describe("bounded scoped bootstrap", () => {
  it("selects the active task checkpoint and excludes another operation", async () => {
    const repos = createInMemoryRepositories();
    await seedFoundationCatalog(repos);
    const kernel = new Kernel({ repos, runtime: { status: async () => "AVAILABLE" }, clock: () => new Date(), logger: createSilentLogger() });
    const user = await kernel.createUser({ displayName: "User" });
    const workspace = await kernel.createWorkspace({ name: "Workspace", slug: "bootstrap", ownerUserId: user.id });
    const project = await kernel.createProject({ workspaceId: workspace.id, name: "Project", slug: "project" });
    const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "project", projectId: project.id });
    const node = await kernel.registerExecutionNode({ machineKey: "bootstrap-node", displayName: "Node", kind: "local", status: "online" });
    const firstOperation = await kernel.createOperation({ workspaceId: workspace.id, title: "First" });
    const secondOperation = await kernel.createOperation({ workspaceId: workspace.id, title: "Second" });
    const firstTask = await kernel.createTask({ operationId: firstOperation.id, projectId: project.id, title: "First task" });
    const secondTask = await kernel.createTask({ operationId: secondOperation.id, projectId: project.id, title: "Second task" });
    const state = (phase: string) => ({ phase, completed: [], remaining: [], importantFiles: [], risks: [], notes: null });
    const wanted = await kernel.recordCheckpoint({ orchestratorId: orchestrator.id, operationId: firstOperation.id,
      taskId: firstTask.id, trigger: "phase_completed", state: state("wanted") });
    await kernel.recordCheckpoint({ orchestratorId: orchestrator.id, operationId: secondOperation.id,
      taskId: secondTask.id, trigger: "phase_completed", state: state("other") });
    const bootstrap = await buildBootstrapContext(repos, { orchestratorId: orchestrator.id,
      doctrineText: "Test doctrine", purpose: "worker", role: "worker", executionNodeId: node.id,
      correlationId: firstOperation.correlationId, operationId: firstOperation.id, taskId: firstTask.id });
    expect(bootstrap.checkpoint?.id).toBe(wanted.id);
    expect(bootstrap.operation?.id).toBe(firstOperation.id);
    expect(bootstrap.task?.id).toBe(firstTask.id);
    await expect(buildBootstrapContext(repos, { orchestratorId: orchestrator.id, doctrineText: "Test doctrine",
      purpose: "worker", role: "worker", executionNodeId: node.id, correlationId: firstOperation.correlationId,
      operationId: firstOperation.id, taskId: secondTask.id })).rejects.toThrow(/outside/);
  });
});
