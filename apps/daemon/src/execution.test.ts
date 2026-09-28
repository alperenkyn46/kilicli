import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryRepositories, seedFoundationCatalog } from "@kilic/db";
import { ExecutionControl, Kernel } from "@kilic/kernel";
import { createSilentLogger } from "@kilic/observability";
import { MockRuntimeAdapter } from "@kilic/runtime-contract";
import type { Clock } from "@kilic/shared";
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
      control: new ExecutionControl(repos, incrementingClock()),
      runtime,
      worktrees: new GitWorktreeManager(),
      worktreeRoot,
      bootId,
    });
    const materialized = await plane.materialize({ runId: dispatched.run.id, repositoryId: repository.id });
    expect(materialized.cwd).toBe(join(worktreeRoot, dispatched.run.id));
    expect((await repos.agentRuns.get(dispatched.run.id))?.status).toBe("running");
    await expect(
      exec("git", ["show-ref", "--verify", `refs/heads/${dispatched.run.isolation.branch}`], { cwd: repositoryRoot }),
    ).resolves.toBeTruthy();

    const manager = new GitWorktreeManager();
    await manager.remove({ repositoryRoot, worktreePath: materialized.cwd });
    await expect(
      exec("git", ["show-ref", "--verify", `refs/heads/${dispatched.run.isolation.branch}`], { cwd: repositoryRoot }),
    ).resolves.toBeTruthy();
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
