import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "@kilic/adapter-claude";
import { createDatabase, createPostgresRepositories, migrateDatabase, seedFoundationCatalog } from "@kilic/db";
import { EffectAuthorization, ExecutionControl, Kernel } from "@kilic/kernel";
import { createSilentLogger } from "@kilic/observability";
import { newId, systemClock } from "@kilic/shared";
import { ExecutionPlane } from "./execution.js";
import { ReadOnlyEffectExecutor } from "./read-only-executor.js";
import { RuntimeAdapterRegistry } from "./registry.js";
import { GitWorktreeManager } from "./worktree.js";

// Opt-in paid test against a dedicated database and a disposable repository fixture.
const connection = process.env.DATABASE_URL;
const scenario = process.env.KILIC_LIVE_SCENARIO ?? "approval";
if (!["approval", "deny", "restart"].includes(scenario)) throw new Error("Unknown live test scenario");
if (process.env.KILIC_LIVE_TEST !== "1" || !connection || !new URL(connection).pathname.startsWith("/kilic_live_") ||
  !["127.0.0.1", "localhost"].includes(new URL(connection).hostname)) {
  throw new Error("KILIC_LIVE_TEST=1 and a dedicated kilic_live_* database are required");
}
await migrateDatabase(connection);
const database = createDatabase(connection);
const runtime = new RuntimeAdapterRegistry();
const adapter = new ClaudeCodeAdapter({ maxBudgetUsd: 0.15 });
let liveAdapter = adapter;
runtime.register(adapter);
const directory = await mkdtemp(join(tmpdir(), "kilic-live-project-"));
const marker = `KILIC_READ_${randomUUID().replaceAll("-", "")}`;
await writeFile(join(directory, "README.md"), `Project acceptance marker: ${marker}\n`);
let handle: string | null = null;
try {
  const repos = createPostgresRepositories(database.db);
  await seedFoundationCatalog(repos);
  const kernel = new Kernel({ repos, runtime, clock: systemClock, logger: createSilentLogger() });
  const user = await kernel.createUser({ displayName: "Live integration fixture" });
  const workspace = await kernel.createWorkspace({ ownerUserId: user.id, name: "Live integration", slug: `live-${randomUUID()}` });
  const project = await kernel.createProject({ workspaceId: workspace.id, name: "Controlled read-only fixture", slug: "fixture" });
  const repository = await kernel.attachRepository({ projectId: project.id, name: "Fixture", defaultBranch: "main" });
  await kernel.ensureOrchestrator({ workspaceId: workspace.id, projectId: project.id, kind: "project" });
  const node = await kernel.registerExecutionNode({ machineKey: `live-${randomUUID()}`, displayName: "Live test node", kind: "local", status: "online" });
  const bootId = randomUUID();
  await repos.executionNodes.setBoot(node.id, bootId, systemClock());
  await kernel.registerCheckout({ repositoryId: repository.id, executionNodeId: node.id, localPath: directory });
  const operation = await kernel.createOperation({ workspaceId: workspace.id, title: "Read-only provider integration" });
  const task = await kernel.createTask({ operationId: operation.id, projectId: project.id,
    title: "Use the read_file broker tool to read README.md and return its exact acceptance marker.",
    acceptanceCriteria: "Call read_file with path README.md exactly once. Return the marker from the file. Do not invoke any other tool." });
  const dispatch = { taskId: task.id, role: "worker", access: "read_only" as const, action: "local_analysis",
    executionNodeId: node.id, idempotencyKey: `live-${randomUUID()}` };
  const planned = await kernel.dispatchWorker(dispatch);
  if (planned.status !== "planned") throw new Error("Worker was not dispatched");
  const repeated = await kernel.dispatchWorker(dispatch);
  assert.equal(repeated.status, "existing");
  if (repeated.status === "existing") assert.equal(repeated.run.id, planned.run.id);
  // Add the exact read approval policy after dispatch to test execution-time approval separately.
  await repos.policyRules.insert({ id: newId<"PolicyRuleId">(), scopeType: "project", workspaceId: workspace.id,
    projectId: project.id, action: "local_analysis", effect: "require_approval",
    createdAt: systemClock(), updatedAt: systemClock() });
  const control = new ExecutionControl(repos, systemClock, await readFile(new URL("../../../identity/AGENTS.md", import.meta.url), "utf8"));
  const executor = new ReadOnlyEffectExecutor({ repos, clock: systemClock, nodeId: node.id, bootId, allowedFiles: ["README.md"] });
  let effects = 0;
  const plane = new ExecutionPlane({ control, runtime, effects: new EffectAuthorization(repos, systemClock),
    effectExecutor: { execute: async (input) => { const result = await executor.execute(input); effects += 1; return result; } },
    handoffPlanner: kernel, worktrees: new GitWorktreeManager(), worktreeRoot: join(directory, "worktrees"), bootId, nodeId: node.id });
  await plane.materialize({ runId: planned.run.id, repositoryId: repository.id });
  const job = await control.jobForRun(planned.run.id);
  const session = await control.getSession(job.runtimeSessionId);
  handle = session.adapterSessionId;
  let activePlane = plane;
  let pending = plane.executeRun(planned.run.id).then((result) => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
  // Poll only the dedicated test job; auto-approve only its known read action/resource.
  const approvalTimeout = setTimeout(() => { if (handle) void liveAdapter.interrupt({ harnessKey: liveAdapter.harnessKey, adapterSessionId: handle }).catch(() => undefined); }, 90_000);
  let approved = false;
  try {
    for (let attempt = 0; attempt < 900; attempt++) {
      const current = await repos.executionJobs.get(job.id);
      if (current?.status === "awaiting_approval" && current.pendingApprovalId) {
        const approval = await repos.approvals.get(current.pendingApprovalId);
        assert.equal(approval?.action, "local_analysis");
        assert.equal(approval?.payload.resource, "file:README.md");
        assert.equal(effects, 0);
        if (scenario === "restart") {
          const previousHandle = handle!;
          await adapter.close({ harnessKey: adapter.harnessKey, adapterSessionId: previousHandle });
          const nextBoot = randomUUID();
          await control.rotateBoot(node.id, nextBoot);
          const interrupted = await pending;
          assert.equal(interrupted.ok, false);
          assert.equal((await repos.executionJobs.get(job.id))?.status, "interrupted");
          assert.equal(effects, 0);
          const checkpoint = await repos.checkpoints.latestRelevant(job.orchestratorId, job.operationId, job.taskId);
          assert.ok(checkpoint);
          assert.equal(checkpoint.taskId, task.id);
          await kernel.decideApproval(current.pendingApprovalId, "approved");
          const freshRuntime = new RuntimeAdapterRegistry();
          liveAdapter = new ClaudeCodeAdapter({ maxBudgetUsd: 0.15 }); freshRuntime.register(liveAdapter);
          const recoveredExecutor = new ReadOnlyEffectExecutor({ repos, clock: systemClock, nodeId: node.id, bootId: nextBoot, allowedFiles: ["README.md"] });
          activePlane = new ExecutionPlane({ control, runtime: freshRuntime, effects: new EffectAuthorization(repos, systemClock),
            effectExecutor: { execute: async (input) => { const result = await recoveredExecutor.execute(input); effects += 1; return result; } },
            handoffPlanner: kernel, worktrees: new GitWorktreeManager(), worktreeRoot: join(directory, "worktrees"), bootId: nextBoot, nodeId: node.id });
          await activePlane.materialize({ runId: planned.run.id, repositoryId: repository.id, retry: true });
          handle = (await control.getSession(job.runtimeSessionId)).adapterSessionId;
          assert.notEqual(handle, previousHandle);
          assert.equal((await control.bootstrapFor(job.runtimeSessionId, planned.run.id)).checkpoint?.id, checkpoint.id);
          pending = activePlane.executeRun(planned.run.id).then((result) => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
        } else await kernel.decideApproval(current.pendingApprovalId, scenario === "deny" ? "rejected" : "approved");
        await assert.rejects(kernel.decideApproval(current.pendingApprovalId, "approved"));
        approved = true; break;
      }
      if (current && ["failed", "interrupted", "completed"].includes(current.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const finished = await pending;
    if (!finished.ok) throw finished.error;
    const result = finished.result;
    console.log(JSON.stringify({ phase: "terminal", outcome: result.outcome, approvalObserved: approved, effects,
      output: result.output }));
    assert.equal(approved, true);
    assert.equal(result.outcome, scenario === "deny" ? "failed" : "completed");
    if (scenario !== "deny") assert.ok(result.output.includes(marker), "Output must contain the actual file marker");
    assert.equal(effects, scenario === "deny" ? 0 : 1);
    await assert.rejects(activePlane.executeRun(planned.run.id));
    assert.equal(effects, scenario === "deny" ? 0 : 1);
    assert.equal((await control.getSession(job.runtimeSessionId)).adapterSessionId, handle);
    assert.equal(await readFile(join(directory, "README.md"), "utf8"), `Project acceptance marker: ${marker}\n`);
    const lifecycle = (await repos.events.listByAggregate("execution_job", job.id)).filter((event) => event.type === "runtime.lifecycle");
    assert.ok(lifecycle.length > 0);
    assert.ok(lifecycle.every((event) => event.correlationId === job.correlationId));
    console.log(JSON.stringify({ passed: true, scenario, executionJobId: job.id, sameSession: scenario !== "restart",
      approvalResumed: scenario !== "deny", brokeredEffects: effects, duplicateRunPrevented: true,
      durableFlushSignals: lifecycle.map((event) => event.payload.signal), repositoryUnchanged: true }));
  } finally { clearTimeout(approvalTimeout); }
} finally {
  if (handle) await liveAdapter.close({ harnessKey: liveAdapter.harnessKey, adapterSessionId: handle });
  await database.close();
}
