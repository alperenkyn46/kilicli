import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDatabase, createPostgresRepositories, migrateDatabase, seedFoundationCatalog } from "@kilic/db";
import { createSilentLogger } from "@kilic/observability";
import { Kernel } from "./kernel.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL handoff integration tests");

describe("PostgreSQL handoff", () => {
  it("commits checkpoint and successor links across the real transaction boundary", async () => {
    await migrateDatabase(connectionString);
    const database = createDatabase(connectionString);
    try {
      const repos = createPostgresRepositories(database.db);
      await seedFoundationCatalog(repos);
      const kernel = new Kernel({ repos, runtime: { status: async () => "AVAILABLE" },
        clock: () => new Date(), logger: createSilentLogger() });
      const suffix = randomUUID().slice(0, 8);
      const user = await kernel.createUser({ displayName: "Handoff integration" });
      const workspace = await kernel.createWorkspace({ name: "Handoff integration", slug: `handoff-${suffix}`, ownerUserId: user.id });
      const orchestrator = await kernel.ensureOrchestrator({ workspaceId: workspace.id, kind: "workspace" });
      const node = await kernel.registerExecutionNode({ machineKey: `handoff-node-${suffix}`, displayName: "Node", kind: "local", status: "online" });
      await repos.executionNodes.setBoot(node.id, `boot-${suffix}`, new Date());
      const first = await kernel.planMindSession({ orchestratorId: orchestrator.id, executionNodeId: node.id,
        contextHealth: "healthy", explicitSwitch: false });
      if (first.action !== "open") throw new Error("expected first session");
      await repos.runtimeSessions.attachAdapter(first.session.id, "mock-ready", `boot-${suffix}`, new Date());
      expect(await repos.runtimeSessions.transition(first.session.id, "starting", {
        status: "active", closeReason: null, endedAt: null, updatedAt: new Date(),
      })).toBe(true);
      const job = await kernel.planMindTurn({ sessionId: first.session.id, idempotencyKey: `flush-${suffix}`, textDigest: "test-digest" });
      const now = new Date();
      expect(await repos.executionJobs.claim(job.id, node.id, `boot-${suffix}`, new Date(now.getTime() + 60_000), now)).toBe(true);
      expect(await repos.executionJobs.transition(job.id, "claimed", "bootstrapping", {}, now)).toBe(true);
      expect(await repos.executionJobs.transition(job.id, "bootstrapping", "running", { startedAt: now }, now)).toBe(true);
      const flushed = await kernel.recordRuntimeLifecycle({ executionJobId: job.id, signal: "pre_compaction",
        checkpointState: { phase: "compaction", completed: [], remaining: [], importantFiles: [], risks: [], notes: null },
        digest: { sourceCursor: "0:10", sourceBytes: "observed output", summary: "Before compaction",
          observedDecisions: [], observedFindings: [], touchedArtifacts: [], verificationResult: null, openQuestions: [] } });
      expect(flushed.queuedDigest).toBe(true);
      expect((await repos.checkpoints.get(flushed.checkpoint.id))?.runtimeSessionId).toBe(first.session.id);
      expect((await kernel.recordRuntimeLifecycle({ executionJobId: job.id, signal: "pre_compaction",
        digest: { sourceCursor: "0:10", sourceBytes: "observed output", summary: "Before compaction",
          observedDecisions: [], observedFindings: [], touchedArtifacts: [], verificationResult: null, openQuestions: [] } })).queuedDigest).toBe(false);
      const result = await kernel.requestHandoff({ predecessorSessionId: first.session.id, reason: "RATE_LIMITED",
        checkpointState: { phase: "handoff", completed: [], remaining: [], importantFiles: [], risks: [], notes: "Continue" },
        repositoryState: { nodeId: node.id } });
      expect(result.handoff.status).toBe("successor_planned");
      expect(result.handoff.checkpointId).toBeTruthy();
      expect(result.handoff.successorSessionId).toBe(result.plan.session.id);
      expect((await repos.checkpoints.get(result.handoff.checkpointId!))?.runtimeSessionId).toBe(first.session.id);
      expect((await repos.runtimeSessions.get(first.session.id))?.status).toBe("active");
      const events = await repos.events.listByAggregate("runtime_handoff", result.handoff.id);
      expect(events.map((event) => event.type)).toEqual([
        "runtime_handoff.requested", "runtime_handoff.checkpointed", "runtime_handoff.successor_planned",
      ]);
    } finally {
      await database.close();
    }
  });
});
