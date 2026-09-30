import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryRepositories, seedFoundationCatalog } from "@kilic/db";
import { Kernel, ExecutionControl, EffectAuthorization } from "@kilic/kernel";
import { createSilentLogger } from "@kilic/observability";
import { ReadOnlyEffectExecutor } from "./read-only-executor.js";

const directories: string[] = [];
async function setup() {
  const root = fileURLToPath(new URL("../../../.tmp/readonly", import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "fixture-")); directories.push(directory);
  const checkoutPath = join(directory, "checkout"); await mkdir(checkoutPath);
  await writeFile(join(checkoutPath, "README.md"), "Expected content");
  const repos = createInMemoryRepositories(); await seedFoundationCatalog(repos);
  let now = new Date(); const clock = () => now;
  const kernel = new Kernel({ repos, runtime: { status: async () => "AVAILABLE" }, clock, logger: createSilentLogger() });
  const user = await kernel.createUser({ displayName: "Test" });
  const workspace = await kernel.createWorkspace({ ownerUserId: user.id, name: "Test", slug: "test" });
  const project = await kernel.createProject({ workspaceId: workspace.id, name: "Test", slug: "test" });
  await kernel.ensureOrchestrator({ workspaceId: workspace.id, projectId: project.id, kind: "project" });
  const repository = await kernel.attachRepository({ projectId: project.id, name: "Test", defaultBranch: "main" });
  const node = await kernel.registerExecutionNode({ machineKey: "test", displayName: "Test", kind: "local", status: "online" });
  await repos.executionNodes.setBoot(node.id, "boot", clock());
  await kernel.registerCheckout({ repositoryId: repository.id, executionNodeId: node.id, localPath: checkoutPath });
  const operation = await kernel.createOperation({ workspaceId: workspace.id, title: "Test" });
  const task = await kernel.createTask({ operationId: operation.id, projectId: project.id, title: "Test" });
  const plan = await kernel.dispatchWorker({ taskId: task.id, role: "worker", access: "read_only", action: "local_analysis", executionNodeId: node.id });
  if (plan.status !== "planned") throw new Error("Missing test plan");
  const job = plan.job;
  const control = new ExecutionControl(repos, clock, "Doctrine");
  await control.bindRepositoryForRun(repository.id, plan.run.id, node.id);
  await control.claimJob(plan.job.id, node.id, "boot");
  await control.transitionJob(plan.job.id, "claimed", "bootstrapping");
  await control.attachAdapterSession(plan.session.id, "fixture", "boot");
  await control.transitionJob(plan.job.id, "bootstrapping", "running");
  const executor = new ReadOnlyEffectExecutor({ repos, clock, nodeId: node.id, bootId: "boot", allowedFiles: ["README.md", "escape.txt"] });
  const effects = new EffectAuthorization(repos, clock);
  const principal = { kind: "tool" as const, executionJobId: plan.job.id, agentRunId: plan.run.id,
    workspaceId: workspace.id, projectId: project.id, operationId: operation.id, taskId: task.id };
  async function granted(resource: string) {
    const request = { idempotencyKey: resource, action: "local_analysis", resource, description: "Read" };
    const resolution = await effects.authorize(principal, job.id, request);
    if (resolution.decision !== "allow") throw new Error("Grant required");
    return { executionJobId: job.id, grantId: resolution.grantId, request };
  }
  return { executor, granted, repos, directory, checkoutPath, control, repository, project, node, plan, kernel,
    expire: () => { now = new Date(now.getTime() + 120_000); } };
}

describe("read-only broker executor", () => {
  afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
  it("reads only an exact granted repository file", async () => {
    const test = await setup(); const input = await test.granted("file:README.md");
    expect(await test.executor.execute(input)).toEqual({ path: "README.md", text: "Expected content" });
    await expect(test.executor.execute({ ...input, request: { ...input.request, resource: "file:other.md" } })).rejects.toThrow(/exact current grant/);
  });
  it("rejects traversal, unlisted files and symlinks escaping the checkout", async () => {
    const test = await setup();
    await writeFile(join(test.directory, "outside.txt"), "Private fixture");
    await symlink(join(test.directory, "outside.txt"), join(test.checkoutPath, "escape.txt"));
    await expect(test.executor.execute(await test.granted("file:../outside.txt"))).rejects.toThrow(/allowlist/);
    await expect(test.executor.execute(await test.granted("file:escape.txt"))).rejects.toThrow(/escapes/);
  });
  it("rejects an expired lease and a retired node epoch", async () => {
    const test = await setup(); const input = await test.granted("file:README.md");
    await test.repos.executionNodes.setBoot(test.node.id, "new-boot", new Date());
    await expect(test.executor.execute(input)).rejects.toThrow(/exact current grant/);
    await test.repos.executionNodes.setBoot(test.node.id, "boot", new Date());
    test.expire();
    await expect(test.executor.execute(input)).rejects.toThrow(/exact current grant/);
  });
  it("rejects switching a bound run to another repository on retry", async () => {
    const test = await setup();
    const second = await test.kernel.attachRepository({ projectId: test.project.id, name: "Second", defaultBranch: "main" });
    await expect(test.control.bindRepositoryForRun(second.id, test.plan.run.id, test.node.id)).rejects.toThrow(/cannot change/);
    expect((await test.repos.executionJobs.get(test.plan.job.id))?.repositoryId).toBe(test.repository.id);
  });
});
