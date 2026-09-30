import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { asId, newId } from "@kilic/shared";
import { buildEvent, newCorrelationId } from "@kilic/domain";
import { createDatabase } from "./client.js";
import { migrateDatabase } from "./migrate.js";
import { createPostgresRepositories } from "./postgres-repositories.js";
import { seedFoundationCatalog } from "./seed.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required. PostgreSQL integration tests must not be skipped.");
}

describe("postgresql foundation", () => {
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  it("migrates, seeds, and enforces relational invariants", async () => {
    await migrateDatabase(connectionString);
    const database = createDatabase(connectionString);
    const repos = createPostgresRepositories(database.db);
    await seedFoundationCatalog(repos);
    const harness = await repos.harnesses.getByKey("claude-code");
    expect(harness?.key).toBe("claude-code");

    const constraints = await sql<{ conname: string }[]>`
      select conname from pg_constraint
      where conname in (
        'orchestrators_scope_ck',
        'memory_items_scope_ck',
        'routing_policies_scope_ck',
        'policy_rules_scope_ck',
        'project_relations_distinct_ck',
        'task_dependencies_no_self_ck',
        'checkpoints_orchestrator_workspace_fk',
        'memory_items_project_workspace_fk',
        'tasks_project_workspace_fk'
      )
    `;
    expect(constraints.map((row) => row.conname).sort()).toEqual([
      "checkpoints_orchestrator_workspace_fk",
      "memory_items_project_workspace_fk",
      "memory_items_scope_ck",
      "orchestrators_scope_ck",
      "policy_rules_scope_ck",
      "project_relations_distinct_ck",
      "routing_policies_scope_ck",
      "task_dependencies_no_self_ck",
      "tasks_project_workspace_fk",
    ]);

    const indexes = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes
      where indexname in (
        'orchestrators_workspace_singleton',
        'orchestrators_project_singleton',
        'repository_checkouts_repo_node_uq',
        'harnesses_key_uq'
      )
    `;
    expect(indexes).toHaveLength(4);
    const guards = await sql<{ tgname: string }[]>`
      select tgname from pg_trigger where not tgisinternal and tgname in (
        'events_append_only', 'checkpoints_append_only', 'checkpoints_scope', 'memory_items_run_scope',
        'runtime_sessions_lifecycle', 'agent_runs_lifecycle', 'execution_jobs_lifecycle'
      ) order by tgname
    `;
    expect(guards.map((item) => item.tgname)).toEqual([
      "agent_runs_lifecycle", "checkpoints_append_only", "checkpoints_scope", "events_append_only",
      "execution_jobs_lifecycle", "memory_items_run_scope", "runtime_sessions_lifecycle",
    ]);

    const now = new Date();
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const projectId = randomUUID();
    await sql`
      insert into users (id, display_name, created_at, updated_at)
      values (${userId}, 'Gate', ${now}, ${now})
    `;
    await sql`
      insert into workspaces (id, name, slug, created_at, updated_at)
      values (${workspaceId}, 'Gate', ${`gate-${userId.slice(0, 8)}`}, ${now}, ${now})
    `;
    await sql`
      insert into projects (id, workspace_id, name, slug, created_at, updated_at)
      values (${projectId}, ${workspaceId}, 'Web', 'web', ${now}, ${now})
    `;

    const orchestrator = {
      id: randomUUID(),
      workspaceId,
      projectId: null,
      kind: "workspace",
      displayName: "Workspace Orchestrator",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await sql`
      insert into orchestrators (id, workspace_id, project_id, kind, display_name, status, created_at, updated_at)
      values (${orchestrator.id}, ${workspaceId}, null, 'workspace', 'Workspace Orchestrator', 'active', ${now}, ${now})
    `;
    await expect(sql`
      insert into orchestrators (id, workspace_id, project_id, kind, display_name, status, created_at, updated_at)
      values (${randomUUID()}, ${workspaceId}, null, 'workspace', 'Duplicate', 'active', ${now}, ${now})
    `).rejects.toThrow();

    await sql`
      insert into orchestrators (id, workspace_id, project_id, kind, display_name, status, created_at, updated_at)
      values (${randomUUID()}, ${workspaceId}, ${projectId}, 'project', 'Project Orchestrator', 'active', ${now}, ${now})
    `;
    await expect(sql`
      insert into orchestrators (id, workspace_id, project_id, kind, display_name, status, created_at, updated_at)
      values (${randomUUID()}, ${workspaceId}, ${projectId}, 'project', 'Duplicate Project', 'active', ${now}, ${now})
    `).rejects.toThrow();

    await expect(sql`
      insert into orchestrators (id, workspace_id, project_id, kind, display_name, status, created_at, updated_at)
      values (${randomUUID()}, ${workspaceId}, ${projectId}, 'workspace', 'Bad scope', 'active', ${now}, ${now})
    `).rejects.toThrow();

    await expect(sql`
      insert into project_relations (
        id, workspace_id, source_project_id, target_project_id, relation_type, knowledge_class, created_at, updated_at
      ) values (
        ${randomUUID()}, ${workspaceId}, ${projectId}, ${projectId}, 'api_provider', 'authoritative', ${now}, ${now}
      )
    `).rejects.toThrow();

    const operationId = randomUUID();
    const taskId = randomUUID();
    const projectOrchestrator = await sql<{ id: string }[]>`
      select id from orchestrators where project_id = ${projectId} limit 1
    `;
    const projectOrchestratorId = projectOrchestrator[0]?.id;
    if (!projectOrchestratorId) throw new Error("project orchestrator missing");
    await sql`
      insert into operations (id, workspace_id, correlation_id, title, status, created_at, updated_at)
      values (${operationId}, ${workspaceId}, ${randomUUID()}, 'Op', 'active', ${now}, ${now})
    `;
    await sql`
      insert into tasks (
        id, operation_id, project_id, orchestrator_id, workspace_id, correlation_id, title, status, created_at, updated_at
      ) values (
        ${taskId}, ${operationId}, ${projectId}, ${projectOrchestratorId}, ${workspaceId}, ${randomUUID()}, 'Task', 'ready', ${now}, ${now}
      )
    `;
    await expect(sql`
      insert into tasks (id, operation_id, project_id, orchestrator_id, workspace_id, correlation_id, title, status, created_at, updated_at)
      values (${randomUUID()}, ${operationId}, ${projectId}, ${orchestrator.id}, ${workspaceId}, ${randomUUID()}, 'Wrong orchestrator', 'ready', ${now}, ${now})
    `).rejects.toThrow();
    const otherWorkspaceId = randomUUID();
    await sql`insert into workspaces (id, name, slug, created_at, updated_at) values (${otherWorkspaceId}, 'Other', ${`other-${otherWorkspaceId.slice(0, 8)}`}, ${now}, ${now})`;
    await expect(sql`
      insert into routing_policies (id, name, scope_type, workspace_id, project_id, enabled, created_at, updated_at)
      values (${randomUUID()}, 'Cross workspace', 'project', ${otherWorkspaceId}, ${projectId}, true, ${now}, ${now})
    `).rejects.toThrow();
    const otherProjectId = randomUUID();
    const otherOrchestratorId = randomUUID();
    const otherTaskId = randomUUID();
    await sql`insert into projects (id, workspace_id, name, slug, created_at, updated_at) values (${otherProjectId}, ${workspaceId}, 'Other project', 'other-project', ${now}, ${now})`;
    await sql`insert into orchestrators (id, workspace_id, project_id, kind, display_name, status, created_at, updated_at) values (${otherOrchestratorId}, ${workspaceId}, ${otherProjectId}, 'project', 'Other mind', 'active', ${now}, ${now})`;
    await sql`insert into tasks (id, operation_id, project_id, orchestrator_id, workspace_id, correlation_id, title, status, created_at, updated_at) values (${otherTaskId}, ${operationId}, ${otherProjectId}, ${otherOrchestratorId}, ${workspaceId}, ${randomUUID()}, 'Other task', 'ready', ${now}, ${now})`;
    const nodeId = randomUUID();
    const runtimeSessionId = randomUUID();
    const runId = randomUUID();
    const catalogHarness = await repos.harnesses.getByKey("claude-code");
    if (!catalogHarness) throw new Error("missing catalog harness");
    const catalogModel = await repos.models.findByHarnessAndKey(catalogHarness.id, "default");
    if (!catalogModel) throw new Error("missing catalog model");
    await sql`insert into execution_nodes (id, machine_key, display_name, kind, status, created_at, updated_at) values (${nodeId}, ${`scope-${nodeId}`}, 'Scope node', 'local', 'online', ${now}, ${now})`;
    await sql`insert into runtime_sessions (id, orchestrator_id, execution_node_id, harness_id, model_id, purpose, status, correlation_id, started_at, created_at, updated_at) values (${runtimeSessionId}, ${projectOrchestratorId}, ${nodeId}, ${catalogHarness.id}, ${catalogModel.id}, 'worker', 'starting', ${randomUUID()}, ${now}, ${now}, ${now})`;
    await sql`insert into agent_runs (id, runtime_session_id, orchestrator_id, task_id, workspace_id, project_id, operation_id, correlation_id, kind, role, access, status, started_at, created_at, updated_at) values (${runId}, ${runtimeSessionId}, ${projectOrchestratorId}, ${taskId}, ${workspaceId}, ${projectId}, ${operationId}, ${randomUUID()}, 'worker', 'worker', 'read_only', 'planned', ${now}, ${now}, ${now})`;
    const sameProjectOtherTaskId = randomUUID();
    await sql`insert into tasks (id, operation_id, project_id, orchestrator_id, workspace_id, correlation_id, title, status, created_at, updated_at) values (${sameProjectOtherTaskId}, ${operationId}, ${projectId}, ${projectOrchestratorId}, ${workspaceId}, ${randomUUID()}, 'Sibling task', 'ready', ${now}, ${now})`;
    await expect(sql`insert into findings (id, workspace_id, project_id, task_id, agent_run_id, title, body, knowledge_class, status, created_at, updated_at) values (${randomUUID()}, ${workspaceId}, ${projectId}, ${sameProjectOtherTaskId}, ${runId}, 'Wrong task', 'Wrong', 'authoritative', 'active', ${now}, ${now})`).rejects.toThrow();
    await expect(sql`insert into findings (id, workspace_id, project_id, task_id, agent_run_id, title, body, knowledge_class, status, created_at, updated_at) values (${randomUUID()}, ${workspaceId}, ${otherProjectId}, ${otherTaskId}, ${runId}, 'Wrong', 'Wrong', 'authoritative', 'active', ${now}, ${now})`).rejects.toThrow();
    await expect(sql`insert into artifacts (id, workspace_id, project_id, task_id, agent_run_id, kind, storage_key, metadata, created_at) values (${randomUUID()}, ${workspaceId}, ${otherProjectId}, ${otherTaskId}, ${runId}, 'file', 'wrong', ${sql.json({})}, ${now})`).rejects.toThrow();
    await expect(sql`insert into checkpoints (id, orchestrator_id, workspace_id, runtime_session_id, operation_id, task_id, correlation_id, trigger, state, created_at) values (${randomUUID()}, ${projectOrchestratorId}, ${workspaceId}, ${runtimeSessionId}, ${operationId}, ${otherTaskId}, ${randomUUID()}, 'phase_completed', ${sql.json({ phase: null, completed: [], remaining: [], importantFiles: [], risks: [], notes: null })}, ${now})`).rejects.toThrow();
    await expect(sql`
      insert into task_dependencies (task_id, depends_on_task_id, created_at)
      values (${taskId}, ${taskId}, ${now})
    `).rejects.toThrow();

    await expect(sql`
      insert into memory_items (
        id, scope_type, workspace_id, title, body, kind, knowledge_class, status, created_at, updated_at
      ) values (
        ${randomUUID()}, 'global', ${workspaceId}, 'Bad', 'Bad', 'fact', 'authoritative', 'active', ${now}, ${now}
      )
    `).rejects.toThrow();

    await expect(sql`
      insert into routing_policies (
        id, name, scope_type, workspace_id, enabled, created_at, updated_at
      ) values (
        ${randomUUID()}, 'bad-global', 'global', ${workspaceId}, true, ${now}, ${now}
      )
    `).rejects.toThrow();

    await expect(sql`
      insert into policy_rules (
        id, scope_type, project_id, action, effect, created_at, updated_at
      ) values (
        ${randomUUID()}, 'project', ${projectId}, 'force_push', 'deny', ${now}, ${now}
      )
    `).rejects.toThrow();

    const event = buildEvent({
      type: "workspace.created",
      workspaceId: asId<"WorkspaceId">(workspaceId, "workspace"),
      aggregateType: "workspace",
      aggregateId: workspaceId,
      correlationId: newCorrelationId(),
      occurredAt: now,
      payload: { probe: true },
    });
    await repos.events.append(event);
    await expect(sql`update events set type = 'mutated' where id = ${event.id}`).rejects.toThrow(/append-only/);
    await expect(sql`delete from events where id = ${event.id}`).rejects.toThrow(/append-only/);

    const checkpointId = randomUUID();
    await sql`
      insert into checkpoints (
        id, orchestrator_id, workspace_id, correlation_id, trigger, state, created_at
      ) values (
        ${checkpointId}, ${orchestrator.id}, ${workspaceId}, ${randomUUID()}, 'phase_completed',
        ${sql.json({ phase: null, completed: [], remaining: [], importantFiles: [], risks: [], notes: null })},
        ${now}
      )
    `;
    await expect(sql`update checkpoints set trigger = 'major_decision' where id = ${checkpointId}`).rejects.toThrow(/append-only/);
    await expect(sql`delete from checkpoints where id = ${checkpointId}`).rejects.toThrow(/append-only/);

    await database.close();
  });

  it("rolls back a failed transaction", async () => {
    const database = createDatabase(connectionString);
    const repos = createPostgresRepositories(database.db);
    const id = newId<"UserId">();
    await expect(
      repos.transaction(async (tx) => {
        const now = new Date();
        await tx.users.insert({ id, displayName: "Rollback", createdAt: now, updatedAt: now });
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);
    expect(await repos.users.get(id)).toBeNull();
    await database.close();
  });

  it("atomically binds a repository and rejects cross-project or retry rebinding", async () => {
    await migrateDatabase(connectionString);
    const firstDb = createDatabase(connectionString);
    const secondDb = createDatabase(connectionString);
    try {
      const first = createPostgresRepositories(firstDb.db);
      const second = createPostgresRepositories(secondDb.db);
      await seedFoundationCatalog(first);
      const now = new Date();
      const workspaceId = randomUUID(), projectId = randomUUID(), otherProjectId = randomUUID();
      const orchestratorId = randomUUID(), nodeId = randomUUID(), sessionId = randomUUID();
      const repoA = randomUUID(), repoB = randomUUID(), foreignRepo = randomUUID();
      const harness = await first.harnesses.getByKey("claude-code");
      if (!harness) throw new Error("Missing harness");
      const model = await first.models.findByHarnessAndKey(harness.id, "default");
      if (!model) throw new Error("Missing model");
      await sql`insert into workspaces (id,name,slug,created_at,updated_at) values (${workspaceId},'Binding',${workspaceId},${now},${now})`;
      for (const id of [projectId, otherProjectId]) await sql`insert into projects (id,workspace_id,name,slug,created_at,updated_at) values (${id},${workspaceId},'Binding',${id},${now},${now})`;
      for (const [id, scope] of [[repoA,projectId],[repoB,projectId],[foreignRepo,otherProjectId]]) {
        await sql`insert into repositories (id,project_id,name,default_branch,created_at,updated_at) values (${id!},${scope!},'Repo','main',${now},${now})`;
      }
      await sql`insert into orchestrators (id,workspace_id,project_id,kind,display_name,status,created_at,updated_at) values (${orchestratorId},${workspaceId},${projectId},'project','Project','active',${now},${now})`;
      await sql`insert into execution_nodes (id,machine_key,display_name,kind,status,created_at,updated_at) values (${nodeId},${nodeId},'Node','local','online',${now},${now})`;
      await sql`insert into runtime_sessions (id,orchestrator_id,execution_node_id,harness_id,model_id,purpose,status,correlation_id,started_at,created_at,updated_at) values (${sessionId},${orchestratorId},${nodeId},${harness.id},${model.id},'orchestrator_mind','starting',${randomUUID()},${now},${now},${now})`;
      const job = { id: newId<"ExecutionJobId">(), idempotencyKey: randomUUID(), requestFingerprint: "binding",
        runtimeSessionId: asId<"RuntimeSessionId">(sessionId,"sessionId"), agentRunId: null,
        orchestratorId: asId<"OrchestratorId">(orchestratorId,"orchestratorId"), executionNodeId: asId<"ExecutionNodeId">(nodeId,"nodeId"),
        workspaceId: asId<"WorkspaceId">(workspaceId,"workspaceId"), projectId: asId<"ProjectId">(projectId,"projectId"), operationId: null, taskId: null,
        repositoryId: null, correlationId: newCorrelationId(), causationId: null, handoffCheckpointId: null, pendingApprovalId: null,
        status: "planned" as const, claimEpoch: null, leaseUntil: null, startedAt: null, endedAt: null, outcome: null, createdAt: now, updatedAt: now };
      await first.executionJobs.insert(job);
      expect(await first.executionJobs.bindRepository(job.id, asId<"RepositoryId">(foreignRepo,"repositoryId"), job.executionNodeId,now)).toBe(false);
      await expect(sql`update execution_jobs set repository_id=${foreignRepo} where id=${job.id}`).rejects.toThrow(/foreign key/);
      const results = await Promise.all([first.executionJobs.bindRepository(job.id,asId<"RepositoryId">(repoA,"repositoryId"),job.executionNodeId,now),
        second.executionJobs.bindRepository(job.id,asId<"RepositoryId">(repoB,"repositoryId"),job.executionNodeId,now)]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const stored = await first.executionJobs.get(job.id);
      expect([repoA,repoB]).toContain(stored?.repositoryId);
      const changed = stored!.repositoryId === repoA ? repoB : repoA;
      await expect(sql`update execution_jobs set repository_id=${changed} where id=${job.id}`).rejects.toThrow(/immutable/);
      await expect(sql`update execution_jobs set repository_id=null where id=${job.id}`).rejects.toThrow(/immutable/);
    } finally { await firstDb.close(); await secondDb.close(); }
  });

  it("deduplicates concurrent jobs and permits one atomic node claim", async () => {
    await migrateDatabase(connectionString);
    const firstDb = createDatabase(connectionString);
    const secondDb = createDatabase(connectionString);
    try {
      const first = createPostgresRepositories(firstDb.db);
      const second = createPostgresRepositories(secondDb.db);
      await seedFoundationCatalog(first);
      const now = new Date();
      const workspaceId = randomUUID();
      const orchestratorId = randomUUID();
      const nodeId = randomUUID();
      const sessionId = randomUUID();
      const harness = await first.harnesses.getByKey("claude-code");
      if (!harness) throw new Error("missing harness");
      const model = await first.models.findByHarnessAndKey(harness.id, "default");
      if (!model) throw new Error("missing model");
      await sql`insert into workspaces (id, name, slug, created_at, updated_at) values (${workspaceId}, 'Concurrent', ${`c-${workspaceId.slice(0, 8)}`}, ${now}, ${now})`;
      await sql`insert into orchestrators (id, workspace_id, kind, display_name, status, created_at, updated_at) values (${orchestratorId}, ${workspaceId}, 'workspace', 'Mind', 'active', ${now}, ${now})`;
      await sql`insert into execution_nodes (id, machine_key, display_name, kind, status, created_at, updated_at) values (${nodeId}, ${`node-${nodeId}`}, 'Node', 'local', 'online', ${now}, ${now})`;
      await sql`update execution_nodes set boot_id = 'boot-a' where id = ${nodeId}`;
      await sql`insert into runtime_sessions (id, orchestrator_id, execution_node_id, harness_id, model_id, purpose, status, correlation_id, started_at, created_at, updated_at) values (${sessionId}, ${orchestratorId}, ${nodeId}, ${harness.id}, ${model.id}, 'orchestrator_mind', 'starting', ${randomUUID()}, ${now}, ${now}, ${now})`;
      await expect(sql`update runtime_sessions set status = 'active' where id = ${sessionId}`).rejects.toThrow(/ready adapter handle/);
      const job = {
        id: newId<"ExecutionJobId">(), idempotencyKey: `request-${randomUUID()}`, requestFingerprint: "same-request",
        runtimeSessionId: asId<"RuntimeSessionId">(sessionId, "sessionId"), agentRunId: null,
        orchestratorId: asId<"OrchestratorId">(orchestratorId, "orchestratorId"), executionNodeId: asId<"ExecutionNodeId">(nodeId, "nodeId"),
        workspaceId: asId<"WorkspaceId">(workspaceId, "workspaceId"), projectId: null, operationId: null, taskId: null,
        repositoryId: null, correlationId: newCorrelationId(), causationId: null, handoffCheckpointId: null, pendingApprovalId: null,
        status: "planned" as const, claimEpoch: null, leaseUntil: null, startedAt: null, endedAt: null,
        outcome: null, createdAt: now, updatedAt: now,
      };
      const inserted = await Promise.all([first.executionJobs.insert(job), second.executionJobs.insert({ ...job, id: newId<"ExecutionJobId">() })]);
      expect(inserted[0]!.id).toBe(inserted[1]!.id);
      const jobs = await sql<{ id: string }[]>`select id from execution_jobs where workspace_id = ${workspaceId} and idempotency_key = ${job.idempotencyKey}`;
      expect(jobs).toHaveLength(1);
      const jobId = asId<"ExecutionJobId">(jobs[0]!.id, "jobId");
      const otherSessionId = randomUUID();
      await sql`insert into runtime_sessions (id, orchestrator_id, execution_node_id, harness_id, model_id, purpose, status, correlation_id, started_at, created_at, updated_at) values (${otherSessionId}, ${orchestratorId}, ${nodeId}, ${harness.id}, ${model.id}, 'orchestrator_mind', 'starting', ${randomUUID()}, ${now}, ${now}, ${now})`;
      const digestBase = { executionJobId: jobId, agentRunId: null, workspaceId: job.workspaceId,
        projectId: null, operationId: null, taskId: null, sourceDigest: `digest-${randomUUID()}`,
        sourceCursor: "0:1", summary: "Observed", observedDecisions: [], observedFindings: [],
        touchedArtifacts: [], verificationResult: null, openQuestions: [], createdAt: now };
      await expect(first.executionDigests.insert({ ...digestBase, id: newId<"ExecutionDigestId">(),
        runtimeSessionId: asId<"RuntimeSessionId">(otherSessionId, "otherSessionId") })).rejects.toThrow();
      const validDigest = await first.executionDigests.insert({ ...digestBase, id: newId<"ExecutionDigestId">(),
        runtimeSessionId: job.runtimeSessionId });
      await expect(sql`insert into runtime_handoffs (id, predecessor_session_id, orchestrator_id, workspace_id, digest_id, repository_state, reason, status, correlation_id, created_at, updated_at) values (${randomUUID()}, ${otherSessionId}, ${orchestratorId}, ${workspaceId}, ${validDigest.id}, ${sql.json({})}, 'test', 'requested', ${randomUUID()}, ${now}, ${now})`).rejects.toThrow();
      expect(await first.executionJobs.claim(jobId, job.executionNodeId, "stale-boot", new Date(Date.now() + 60_000), new Date())).toBe(false);
      const claims = await Promise.all([
        first.executionJobs.claim(jobId, job.executionNodeId, "boot-a", new Date(Date.now() + 60_000), new Date()),
        second.executionJobs.claim(jobId, job.executionNodeId, "boot-a", new Date(Date.now() + 60_000), new Date()),
      ]);
      expect(claims.sort()).toEqual([false, true]);
      const transitions = await Promise.all([
        first.executionJobs.transition(jobId, "claimed", "bootstrapping", {}, new Date()),
        second.executionJobs.transition(jobId, "claimed", "bootstrapping", {}, new Date()),
      ]);
      expect(transitions.sort()).toEqual([false, true]);
      await expect(sql`update execution_jobs set status = 'completed' where id = ${jobId}`).rejects.toThrow(/invalid execution job transition/);
      await sql`update execution_jobs set status = 'running', started_at = ${now} where id = ${jobId}`;
      await expect(sql`update execution_jobs set status = 'awaiting_approval' where id = ${jobId}`).rejects.toThrow(/execution_jobs_approval_ck/);
      const approvalId = randomUUID();
      await sql`insert into approvals (id, action, status, workspace_id, correlation_id, payload, created_at) values (${approvalId}, 'force_push', 'pending', ${workspaceId}, ${job.correlationId}, ${sql.json({ executionJobId: jobId, requestKey: 'effect-1', resource: 'repo/main' })}, ${now})`;
      await sql`update execution_jobs set status = 'awaiting_approval', pending_approval_id = ${approvalId} where id = ${jobId}`;
      await sql`update execution_jobs set status = 'running', pending_approval_id = null where id = ${jobId}`;
      expect(await first.executionJobs.renew(jobId, job.executionNodeId, "stale-boot", new Date(Date.now() + 60_000), new Date())).toBe(false);
      const ingestion = await first.digestIngestions.enqueue({
        id: newId<"DigestIngestionId">(), executionJobId: jobId, sourceDigest: "source-range-a",
        sourceCursor: "0:1", payload: { executionJobId: jobId, runtimeSessionId: job.runtimeSessionId,
          agentRunId: null, workspaceId: job.workspaceId, projectId: null, operationId: null, taskId: null,
          sourceDigest: "source-range-a", sourceCursor: "0:1", summary: "Observed", observedDecisions: [],
          observedFindings: [], touchedArtifacts: [], verificationResult: null, openQuestions: [] },
        status: "pending", attempts: 0, nextAttemptAt: new Date(0), lastError: null, digestId: null,
        createdAt: now, updatedAt: now,
      });
      const firstClaim = await first.digestIngestions.claimDue(now);
      expect(firstClaim?.id).toBe(ingestion.id);
      expect((await second.digestIngestions.get(ingestion.id))?.attempts).toBe(1);
      const recovered = await second.digestIngestions.claimDue(new Date(now.getTime() + 6 * 60_000));
      expect(recovered?.id).toBe(ingestion.id);
      expect(recovered?.attempts).toBe(2);
      await expect(first.digestIngestions.complete(ingestion.id, newId<"ExecutionDigestId">(), 1, now)).rejects.toThrow();
      expect((await second.digestIngestions.get(ingestion.id))?.attempts).toBe(2);
      await second.digestIngestions.complete(ingestion.id, validDigest.id, 2, now);
    } finally {
      await firstDb.close();
      await secondDb.close();
    }
  });
});
