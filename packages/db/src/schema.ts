import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACCESS_MODES,
  AGENT_RUN_KINDS,
  AGENT_RUN_STATUSES,
  APPROVAL_STATUSES,
  CHECKOUT_STATUSES,
  CHECKPOINT_TRIGGERS,
  CONFIG_SCOPES,
  EXECUTION_NODE_KINDS,
  EXECUTION_NODE_STATUSES,
  EXECUTION_PROFILES,
  KNOWLEDGE_CLASSES,
  MEMBERSHIP_ROLES,
  MEMORY_SCOPES,
  OPERATION_STATUSES,
  ORCHESTRATOR_KINDS,
  ORCHESTRATOR_STATUSES,
  POLICY_EFFECTS,
  POLICY_SCOPES,
  RECORD_STATUSES,
  RUNTIME_SESSION_PURPOSES,
  RUNTIME_SESSION_STATUSES,
  TASK_STATUSES,
  WORKTREE_STATUSES,
  type CheckpointState,
  type IsolationPlan,
} from "@kilic/domain";

function oneOf(column: AnyPgColumn, values: readonly string[], name: string) {
  const list = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
  return check(name, sql`${column} in (${sql.raw(list)})`);
}

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    oneOf(table.role, MEMBERSHIP_ROLES, "workspace_members_role_ck"),
  ],
);

export const executionNodes = pgTable(
  "execution_nodes",
  {
    id: uuid("id").primaryKey(),
    machineKey: text("machine_key").notNull(),
    displayName: text("display_name").notNull(),
    hostname: text("hostname"),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    bootId: text("boot_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("execution_nodes_machine_key_uq").on(table.machineKey),
    oneOf(table.kind, EXECUTION_NODE_KINDS, "execution_nodes_kind_ck"),
    oneOf(table.status, EXECUTION_NODE_STATUSES, "execution_nodes_status_ck"),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("projects_workspace_slug_uq").on(table.workspaceId, table.slug),
    unique("projects_id_workspace_uq").on(table.id, table.workspaceId),
  ],
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    remoteUrl: text("remote_url"),
    ...timestamps,
  },
  (table) => [unique("repositories_id_project_uq").on(table.id, table.projectId)],
);

export const repositoryCheckouts = pgTable(
  "repository_checkouts",
  {
    id: uuid("id").primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id),
    executionNodeId: uuid("execution_node_id")
      .notNull()
      .references(() => executionNodes.id),
    localPath: text("local_path").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repository_checkouts_repo_node_uq").on(table.repositoryId, table.executionNodeId),
    oneOf(table.status, CHECKOUT_STATUSES, "repository_checkouts_status_ck"),
  ],
);

export const projectRelations = pgTable(
  "project_relations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceProjectId: uuid("source_project_id")
      .notNull()
      .references(() => projects.id),
    targetProjectId: uuid("target_project_id")
      .notNull()
      .references(() => projects.id),
    relationType: text("relation_type").notNull(),
    knowledgeClass: text("knowledge_class").notNull(),
    confidence: integer("confidence"),
    ...timestamps,
  },
  (table) => [
    check("project_relations_distinct_ck", sql`${table.sourceProjectId} <> ${table.targetProjectId}`),
    oneOf(table.knowledgeClass, KNOWLEDGE_CLASSES, "project_relations_knowledge_ck"),
    foreignKey({
      columns: [table.sourceProjectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "project_relations_source_workspace_fk",
    }),
    foreignKey({
      columns: [table.targetProjectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "project_relations_target_workspace_fk",
    }),
  ],
);

export const orchestrators = pgTable(
  "orchestrators",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    kind: text("kind").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "orchestrators_scope_ck",
      sql`(${table.kind} = 'workspace' AND ${table.projectId} IS NULL) OR (${table.kind} = 'project' AND ${table.projectId} IS NOT NULL)`,
    ),
    oneOf(table.kind, ORCHESTRATOR_KINDS, "orchestrators_kind_ck"),
    oneOf(table.status, ORCHESTRATOR_STATUSES, "orchestrators_status_ck"),
    uniqueIndex("orchestrators_workspace_singleton")
      .on(table.workspaceId)
      .where(sql`${table.kind} = 'workspace'`),
    uniqueIndex("orchestrators_project_singleton")
      .on(table.projectId)
      .where(sql`${table.kind} = 'project'`),
    unique("orchestrators_id_workspace_uq").on(table.id, table.workspaceId),
  ],
);

export const operations = pgTable(
  "operations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    correlationId: uuid("correlation_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    language: text("language"),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("operations_id_workspace_uq").on(table.id, table.workspaceId),
    oneOf(table.status, OPERATION_STATUSES, "operations_status_ck"),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    orchestratorId: uuid("orchestrator_id")
      .notNull()
      .references(() => orchestrators.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    correlationId: uuid("correlation_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    language: text("language"),
    acceptanceCriteria: text("acceptance_criteria"),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    oneOf(table.status, TASK_STATUSES, "tasks_status_ck"),
    unique("tasks_id_workspace_uq").on(table.id, table.workspaceId),
    unique("tasks_id_operation_uq").on(table.id, table.operationId),
    unique("tasks_scope_uq").on(table.id, table.operationId, table.projectId, table.workspaceId),
    foreignKey({
      columns: [table.operationId, table.workspaceId],
      foreignColumns: [operations.id, operations.workspaceId],
      name: "tasks_operation_workspace_fk",
    }),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "tasks_project_workspace_fk",
    }),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    check("task_dependencies_no_self_ck", sql`${table.taskId} <> ${table.dependsOnTaskId}`),
  ],
);

export const harnesses = pgTable(
  "harnesses",
  {
    id: uuid("id").primaryKey(),
    key: text("key").notNull(),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("harnesses_key_uq").on(table.key)],
);

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey(),
    harnessId: uuid("harness_id")
      .notNull()
      .references(() => harnesses.id),
    key: text("key").notNull(),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("models_harness_key_uq").on(table.harnessId, table.key)],
);

export const routingPolicies = pgTable(
  "routing_policies",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    operationId: uuid("operation_id").references(() => operations.id),
    executionProfile: text("execution_profile"),
    enabled: boolean("enabled").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "routing_policies_scope_ck",
      sql`(
        (${table.scopeType} = 'global' AND ${table.workspaceId} IS NULL AND ${table.projectId} IS NULL AND ${table.operationId} IS NULL) OR
        (${table.scopeType} = 'workspace' AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NULL AND ${table.operationId} IS NULL) OR
        (${table.scopeType} = 'project' AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NOT NULL AND ${table.operationId} IS NULL) OR
        (${table.scopeType} = 'operation' AND ${table.workspaceId} IS NOT NULL AND ${table.operationId} IS NOT NULL)
      )`,
    ),
    oneOf(table.scopeType, CONFIG_SCOPES, "routing_policies_scope_type_ck"),
    check(
      "routing_policies_profile_ck",
      sql`${table.executionProfile} is null or ${table.executionProfile} in (${sql.raw(
        EXECUTION_PROFILES.map((value) => `'${value}'`).join(", "),
      )})`,
    ),
  ],
);

export const roleRoutes = pgTable(
  "role_routes",
  {
    id: uuid("id").primaryKey(),
    routingPolicyId: uuid("routing_policy_id")
      .notNull()
      .references(() => routingPolicies.id),
    role: text("role").notNull(),
    harnessId: uuid("harness_id")
      .notNull()
      .references(() => harnesses.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id),
    priority: integer("priority").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [uniqueIndex("role_routes_priority_uq").on(table.routingPolicyId, table.role, table.priority)],
);

export const runtimeSessions = pgTable(
  "runtime_sessions",
  {
    id: uuid("id").primaryKey(),
    orchestratorId: uuid("orchestrator_id")
      .notNull()
      .references(() => orchestrators.id),
    executionNodeId: uuid("execution_node_id")
      .notNull()
      .references(() => executionNodes.id),
    harnessId: uuid("harness_id")
      .notNull()
      .references(() => harnesses.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id),
    purpose: text("purpose").notNull(),
    status: text("status").notNull(),
    adapterSessionId: text("adapter_session_id"),
    executionEpoch: text("execution_epoch"),
    closeReason: text("close_reason"),
    correlationId: uuid("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    oneOf(table.purpose, RUNTIME_SESSION_PURPOSES, "runtime_sessions_purpose_ck"),
    oneOf(table.status, RUNTIME_SESSION_STATUSES, "runtime_sessions_status_ck"),
    unique("runtime_sessions_id_orchestrator_uq").on(table.id, table.orchestratorId),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey(),
    runtimeSessionId: uuid("runtime_session_id").references(() => runtimeSessions.id),
    orchestratorId: uuid("orchestrator_id")
      .notNull()
      .references(() => orchestrators.id),
    taskId: uuid("task_id").references(() => tasks.id),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => agentRuns.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    operationId: uuid("operation_id").references(() => operations.id),
    correlationId: uuid("correlation_id").notNull(),
    kind: text("kind").notNull(),
    role: text("role").notNull(),
    access: text("access").notNull(),
    status: text("status").notNull(),
    isolation: jsonb("isolation").$type<IsolationPlan | null>(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    oneOf(table.kind, AGENT_RUN_KINDS, "agent_runs_kind_ck"),
    oneOf(table.status, AGENT_RUN_STATUSES, "agent_runs_status_ck"),
    oneOf(table.access, ACCESS_MODES, "agent_runs_access_ck"),
    unique("agent_runs_id_workspace_uq").on(table.id, table.workspaceId),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "agent_runs_project_workspace_fk",
    }),
    foreignKey({
      columns: [table.operationId, table.workspaceId],
      foreignColumns: [operations.id, operations.workspaceId],
      name: "agent_runs_operation_workspace_fk",
    }),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    operationId: uuid("operation_id").references(() => operations.id),
    taskId: uuid("task_id").references(() => tasks.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    language: text("language"),
    knowledgeClass: text("knowledge_class").notNull(),
    status: text("status").notNull(),
    supersededById: uuid("superseded_by_id").references((): AnyPgColumn => memoryItems.id),
    ...timestamps,
  },
  (table) => [
    check(
      "memory_items_scope_ck",
      sql`(
        (${table.scopeType} = 'global' AND ${table.ownerUserId} IS NULL AND ${table.workspaceId} IS NULL AND ${table.projectId} IS NULL AND ${table.operationId} IS NULL AND ${table.taskId} IS NULL AND ${table.agentRunId} IS NULL) OR
        (${table.scopeType} = 'user' AND ${table.ownerUserId} IS NOT NULL AND ${table.workspaceId} IS NULL AND ${table.projectId} IS NULL AND ${table.operationId} IS NULL AND ${table.taskId} IS NULL AND ${table.agentRunId} IS NULL) OR
        (${table.scopeType} = 'workspace' AND ${table.ownerUserId} IS NULL AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NULL AND ${table.operationId} IS NULL AND ${table.taskId} IS NULL AND ${table.agentRunId} IS NULL) OR
        (${table.scopeType} = 'project' AND ${table.ownerUserId} IS NULL AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NOT NULL AND ${table.operationId} IS NULL AND ${table.taskId} IS NULL AND ${table.agentRunId} IS NULL) OR
        (${table.scopeType} = 'operation' AND ${table.ownerUserId} IS NULL AND ${table.workspaceId} IS NOT NULL AND ${table.operationId} IS NOT NULL AND ${table.taskId} IS NULL AND ${table.agentRunId} IS NULL) OR
        (${table.scopeType} = 'task' AND ${table.ownerUserId} IS NULL AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NOT NULL AND ${table.operationId} IS NOT NULL AND ${table.taskId} IS NOT NULL AND ${table.agentRunId} IS NULL) OR
        (${table.scopeType} = 'run' AND ${table.ownerUserId} IS NULL AND ${table.workspaceId} IS NOT NULL AND ${table.agentRunId} IS NOT NULL)
      )`,
    ),
    oneOf(table.scopeType, MEMORY_SCOPES, "memory_items_scope_type_ck"),
    oneOf(table.knowledgeClass, KNOWLEDGE_CLASSES, "memory_items_knowledge_ck"),
    oneOf(table.status, RECORD_STATUSES, "memory_items_status_ck"),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "memory_items_project_workspace_fk",
    }),
    foreignKey({
      columns: [table.operationId, table.workspaceId],
      foreignColumns: [operations.id, operations.workspaceId],
      name: "memory_items_operation_workspace_fk",
    }),
    foreignKey({
      columns: [table.taskId, table.operationId, table.projectId, table.workspaceId],
      foreignColumns: [tasks.id, tasks.operationId, tasks.projectId, tasks.workspaceId],
      name: "memory_items_task_scope_fk",
    }),
    foreignKey({
      columns: [table.agentRunId, table.workspaceId],
      foreignColumns: [agentRuns.id, agentRuns.workspaceId],
      name: "memory_items_run_workspace_fk",
    }),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    operationId: uuid("operation_id").references(() => operations.id),
    title: text("title").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason").notNull(),
    language: text("language"),
    status: text("status").notNull(),
    supersedesId: uuid("supersedes_id"),
    ...timestamps,
  },
  (table) => [
    oneOf(table.status, RECORD_STATUSES, "decisions_status_ck"),
    unique("decisions_id_workspace_uq").on(table.id, table.workspaceId),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "decisions_project_workspace_fk",
    }),
    foreignKey({
      columns: [table.operationId, table.workspaceId],
      foreignColumns: [operations.id, operations.workspaceId],
      name: "decisions_operation_workspace_fk",
    }),
    foreignKey({
      columns: [table.supersedesId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
      name: "decisions_supersedes_workspace_fk",
    }),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    taskId: uuid("task_id").references(() => tasks.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    recommendation: text("recommendation"),
    language: text("language"),
    knowledgeClass: text("knowledge_class").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    oneOf(table.knowledgeClass, KNOWLEDGE_CLASSES, "findings_knowledge_ck"),
    oneOf(table.status, RECORD_STATUSES, "findings_status_ck"),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "findings_project_workspace_fk",
    }),
  ],
);

export const checkpoints = pgTable(
  "checkpoints",
  {
    id: uuid("id").primaryKey(),
    orchestratorId: uuid("orchestrator_id")
      .notNull()
      .references(() => orchestrators.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    runtimeSessionId: uuid("runtime_session_id").references(() => runtimeSessions.id),
    operationId: uuid("operation_id").references(() => operations.id),
    taskId: uuid("task_id").references(() => tasks.id),
    correlationId: uuid("correlation_id").notNull(),
    trigger: text("trigger").notNull(),
    state: jsonb("state").$type<CheckpointState>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    oneOf(table.trigger, CHECKPOINT_TRIGGERS, "checkpoints_trigger_ck"),
    check("checkpoints_task_requires_operation_ck", sql`${table.taskId} is null or ${table.operationId} is not null`),
    foreignKey({
      columns: [table.orchestratorId, table.workspaceId],
      foreignColumns: [orchestrators.id, orchestrators.workspaceId],
      name: "checkpoints_orchestrator_workspace_fk",
    }),
    foreignKey({
      columns: [table.operationId, table.workspaceId],
      foreignColumns: [operations.id, operations.workspaceId],
      name: "checkpoints_operation_workspace_fk",
    }),
    foreignKey({
      columns: [table.taskId, table.workspaceId],
      foreignColumns: [tasks.id, tasks.workspaceId],
      name: "checkpoints_task_workspace_fk",
    }),
    foreignKey({
      columns: [table.taskId, table.operationId],
      foreignColumns: [tasks.id, tasks.operationId],
      name: "checkpoints_task_operation_fk",
    }),
    foreignKey({
      columns: [table.runtimeSessionId, table.orchestratorId],
      foreignColumns: [runtimeSessions.id, runtimeSessions.orchestratorId],
      name: "checkpoints_session_orchestrator_fk",
    }),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    causationId: uuid("causation_id").references((): AnyPgColumn => events.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    runtimeSessionId: uuid("runtime_session_id").references(() => runtimeSessions.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("events_correlation_idx").on(table.correlationId),
    index("events_aggregate_idx").on(table.aggregateType, table.aggregateId),
    index("events_workspace_time_idx").on(table.workspaceId, table.occurredAt),
  ],
);

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  mediaType: text("media_type"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const policyRules = pgTable(
  "policy_rules",
  {
    id: uuid("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    action: text("action").notNull(),
    effect: text("effect").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "policy_rules_scope_ck",
      sql`(
        (${table.scopeType} = 'global' AND ${table.workspaceId} IS NULL AND ${table.projectId} IS NULL) OR
        (${table.scopeType} = 'workspace' AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NULL) OR
        (${table.scopeType} = 'project' AND ${table.workspaceId} IS NOT NULL AND ${table.projectId} IS NOT NULL)
      )`,
    ),
    oneOf(table.scopeType, POLICY_SCOPES, "policy_rules_scope_type_ck"),
    oneOf(table.effect, POLICY_EFFECTS, "policy_rules_effect_ck"),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey(),
    policyRuleId: uuid("policy_rule_id").references(() => policyRules.id),
    action: text("action").notNull(),
    status: text("status").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id").references(() => projects.id),
    operationId: uuid("operation_id").references(() => operations.id),
    taskId: uuid("task_id").references(() => tasks.id),
    requestedByRunId: uuid("requested_by_run_id").references(() => agentRuns.id),
    correlationId: uuid("correlation_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    oneOf(table.status, APPROVAL_STATUSES, "approvals_status_ck"),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "approvals_project_workspace_fk",
    }),
  ],
);

export const worktrees = pgTable(
  "worktrees",
  {
    id: uuid("id").primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    executionNodeId: uuid("execution_node_id")
      .notNull()
      .references(() => executionNodes.id),
    branch: text("branch").notNull(),
    path: text("path").notNull(),
    baseRef: text("base_ref").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [oneOf(table.status, WORKTREE_STATUSES, "worktrees_status_ck")],
);
