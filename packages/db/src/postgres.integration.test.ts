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
});
