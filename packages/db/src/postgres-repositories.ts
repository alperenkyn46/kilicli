import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { asId, DomainError } from "@kilic/shared";
import type {
  AccessMode,
  AgentRun,
  AgentRunKind,
  AgentRunStatus,
  Approval,
  ApprovalStatus,
  Artifact,
  Checkpoint,
  CheckpointState,
  CheckpointTrigger,
  ConfigScope,
  Decision,
  ExecutionNode,
  ExecutionNodeKind,
  ExecutionNodeStatus,
  ExecutionProfile,
  Finding,
  Harness,
  IsolationPlan,
  KilicEvent,
  KnowledgeClass,
  MembershipRole,
  MemoryItem,
  MemoryScope,
  Model,
  Operation,
  OperationStatus,
  Orchestrator,
  OrchestratorKind,
  OrchestratorStatus,
  PolicyEffect,
  PolicyRule,
  PolicyScope,
  Project,
  ProjectRelation,
  RecordStatus,
  Repositories,
  Repository,
  RoleRoute,
  RoutingPolicy,
  RuntimeSession,
  RuntimeSessionPurpose,
  RuntimeSessionStatus,
  Task,
  TaskStatus,
  User,
  Workspace,
  WorkspaceMember,
  Worktree,
  WorktreeStatus,
} from "@kilic/domain";
import * as schema from "./schema.js";
import { matchesMemoryQuery } from "./memory-query.js";

export type Database = PostgresJsDatabase<typeof schema>;

const id = <Brand extends string>(label: Brand, value: string) => asId<Brand>(value, label);
const maybe = <Brand extends string>(label: Brand, value: string | null) =>
  value === null ? null : asId<Brand>(value, label);

export function createPostgresRepositories(db: Database): Repositories {
  return bind(db);
}

function bind(db: Database): Repositories {
  return {
    transaction(work) {
      return db.transaction(async (tx) => work(bind(tx as unknown as Database)));
    },
    users: {
      async insert(user) {
        await attempt(() => db.insert(schema.users).values(user));
      },
      async get(userId) {
        const row = await one(db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1));
        return row ? mapUser(row) : null;
      },
    },
    workspaces: {
      async insert(workspace) {
        await attempt(() => db.insert(schema.workspaces).values(workspace));
      },
      async get(workspaceId) {
        const row = await one(db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1));
        return row ? mapWorkspace(row) : null;
      },
    },
    memberships: {
      async insert(member) {
        await attempt(() => db.insert(schema.workspaceMembers).values(member));
      },
      async get(workspaceId, userId) {
        const row = await one(
          db
            .select()
            .from(schema.workspaceMembers)
            .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)))
            .limit(1),
        );
        return row ? mapMember(row) : null;
      },
    },
    executionNodes: {
      async upsert(node) {
        await attempt(() =>
          db
            .insert(schema.executionNodes)
            .values(node)
            .onConflictDoUpdate({
              target: schema.executionNodes.machineKey,
              set: {
                displayName: node.displayName,
                hostname: node.hostname,
                kind: node.kind,
                status: node.status,
                bootId: node.bootId,
                updatedAt: node.updatedAt,
              },
            }),
        );
        const stored = await one(
          db.select().from(schema.executionNodes).where(eq(schema.executionNodes.machineKey, node.machineKey)).limit(1),
        );
        if (!stored) throw new DomainError("NOT_FOUND", "Execution node was not stored");
        return mapNode(stored);
      },
      async get(nodeId) {
        const row = await one(db.select().from(schema.executionNodes).where(eq(schema.executionNodes.id, nodeId)).limit(1));
        return row ? mapNode(row) : null;
      },
      async getByMachineKey(machineKey) {
        const row = await one(
          db.select().from(schema.executionNodes).where(eq(schema.executionNodes.machineKey, machineKey)).limit(1),
        );
        return row ? mapNode(row) : null;
      },
      async setBoot(nodeId, bootId, updatedAt) {
        await updated(
          db
            .update(schema.executionNodes)
            .set({ bootId, updatedAt })
            .where(eq(schema.executionNodes.id, nodeId))
            .returning({ id: schema.executionNodes.id }),
          "Execution node",
          nodeId,
        );
      },
    },
    projects: {
      async insert(project) {
        await attempt(() => db.insert(schema.projects).values(project));
      },
      async get(projectId) {
        const row = await one(db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1));
        return row ? mapProject(row) : null;
      },
      async listByWorkspace(workspaceId) {
        const rows = await db.select().from(schema.projects).where(eq(schema.projects.workspaceId, workspaceId));
        return rows.map(mapProject);
      },
    },
    repositories: {
      async insert(repository) {
        await attempt(() => db.insert(schema.repositories).values(repository));
      },
      async get(repositoryId) {
        const row = await one(db.select().from(schema.repositories).where(eq(schema.repositories.id, repositoryId)).limit(1));
        return row ? mapRepository(row) : null;
      },
      async listByProject(projectId) {
        const rows = await db.select().from(schema.repositories).where(eq(schema.repositories.projectId, projectId));
        return rows.map(mapRepository);
      },
    },
    repositoryCheckouts: {
      async insert(checkout) {
        await attempt(() => db.insert(schema.repositoryCheckouts).values(checkout));
      },
      async get(checkoutId) {
        const row = await one(
          db.select().from(schema.repositoryCheckouts).where(eq(schema.repositoryCheckouts.id, checkoutId)).limit(1),
        );
        return row ? mapCheckout(row) : null;
      },
      async find(repositoryId, executionNodeId) {
        const row = await one(
          db
            .select()
            .from(schema.repositoryCheckouts)
            .where(
              and(
                eq(schema.repositoryCheckouts.repositoryId, repositoryId),
                eq(schema.repositoryCheckouts.executionNodeId, executionNodeId),
              ),
            )
            .limit(1),
        );
        return row ? mapCheckout(row) : null;
      },
    },
    projectRelations: {
      async insert(relation) {
        await attempt(() => db.insert(schema.projectRelations).values(relation));
      },
      async listByWorkspace(workspaceId) {
        const rows = await db.select().from(schema.projectRelations).where(eq(schema.projectRelations.workspaceId, workspaceId));
        return rows.map(mapRelation);
      },
      async get(relationId) {
        const row = await one(db.select().from(schema.projectRelations).where(eq(schema.projectRelations.id, relationId)).limit(1));
        return row ? mapRelation(row) : null;
      },
    },
    orchestrators: {
      async insert(orchestrator) {
        await attempt(() => db.insert(schema.orchestrators).values(orchestrator));
      },
      async get(orchestratorId) {
        const row = await one(db.select().from(schema.orchestrators).where(eq(schema.orchestrators.id, orchestratorId)).limit(1));
        return row ? mapOrchestrator(row) : null;
      },
      async findByKind(input) {
        const rows = await db.select().from(schema.orchestrators).where(eq(schema.orchestrators.workspaceId, input.workspaceId));
        const found = rows
          .map(mapOrchestrator)
          .find((item) =>
            input.kind === "workspace"
              ? item.kind === "workspace"
              : item.kind === "project" && item.projectId === input.projectId,
          );
        return found ?? null;
      },
      async setStatus(orchestratorId, status, updatedAt) {
        await updated(
          db
            .update(schema.orchestrators)
            .set({ status, updatedAt })
            .where(eq(schema.orchestrators.id, orchestratorId))
            .returning({ id: schema.orchestrators.id }),
          "Orchestrator",
          orchestratorId,
        );
      },
    },
    operations: {
      async insert(operation) {
        await attempt(() => db.insert(schema.operations).values(operation));
      },
      async get(operationId) {
        const row = await one(db.select().from(schema.operations).where(eq(schema.operations.id, operationId)).limit(1));
        return row ? mapOperation(row) : null;
      },
      async setStatus(operationId, status, updatedAt) {
        await updated(
          db.update(schema.operations).set({ status, updatedAt }).where(eq(schema.operations.id, operationId)).returning({ id: schema.operations.id }),
          "Operation",
          operationId,
        );
      },
    },
    tasks: {
      async insert(task) {
        await attempt(() => db.insert(schema.tasks).values(task));
      },
      async get(taskId) {
        const row = await one(db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1));
        return row ? mapTask(row) : null;
      },
      async listByOperation(operationId) {
        const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.operationId, operationId));
        return rows.map(mapTask);
      },
      async setStatus(taskId, status, updatedAt) {
        await updated(
          db.update(schema.tasks).set({ status, updatedAt }).where(eq(schema.tasks.id, taskId)).returning({ id: schema.tasks.id }),
          "Task",
          taskId,
        );
      },
    },
    taskDependencies: {
      async insert(dependency) {
        await attempt(() => db.insert(schema.taskDependencies).values(dependency));
      },
      async listAll() {
        const rows = await db.select().from(schema.taskDependencies);
        return rows.map(mapDependency);
      },
      async listDependencies(taskId) {
        const rows = await db.select().from(schema.taskDependencies).where(eq(schema.taskDependencies.taskId, taskId));
        return rows.map(mapDependency);
      },
      async listDependents(taskId) {
        const rows = await db.select().from(schema.taskDependencies).where(eq(schema.taskDependencies.dependsOnTaskId, taskId));
        return rows.map(mapDependency);
      },
    },
    harnesses: {
      async insert(harness) {
        await attempt(() => db.insert(schema.harnesses).values(harness));
      },
      async get(harnessId) {
        const row = await one(db.select().from(schema.harnesses).where(eq(schema.harnesses.id, harnessId)).limit(1));
        return row ? mapHarness(row) : null;
      },
      async getByKey(key) {
        const row = await one(db.select().from(schema.harnesses).where(eq(schema.harnesses.key, key)).limit(1));
        return row ? mapHarness(row) : null;
      },
      async list() {
        return (await db.select().from(schema.harnesses)).map(mapHarness);
      },
    },
    models: {
      async insert(model) {
        await attempt(() => db.insert(schema.models).values(model));
      },
      async get(modelId) {
        const row = await one(db.select().from(schema.models).where(eq(schema.models.id, modelId)).limit(1));
        return row ? mapModel(row) : null;
      },
      async findByHarnessAndKey(harnessId, key) {
        const rows = await db.select().from(schema.models).where(eq(schema.models.harnessId, harnessId));
        return rows.map(mapModel).find((model) => model.key === key) ?? null;
      },
      async list() {
        return (await db.select().from(schema.models)).map(mapModel);
      },
    },
    routingPolicies: {
      async insert(policy) {
        await attempt(() => db.insert(schema.routingPolicies).values(policy));
      },
      async listEnabled() {
        const rows = await db.select().from(schema.routingPolicies).where(eq(schema.routingPolicies.enabled, true));
        return rows.map(mapPolicy);
      },
      async get(policyId) {
        const row = await one(db.select().from(schema.routingPolicies).where(eq(schema.routingPolicies.id, policyId)).limit(1));
        return row ? mapPolicy(row) : null;
      },
    },
    roleRoutes: {
      async insert(route) {
        await attempt(() => db.insert(schema.roleRoutes).values(route));
      },
      async list() {
        return (await db.select().from(schema.roleRoutes)).map(mapRoute);
      },
      async get(routeId) {
        const row = await one(db.select().from(schema.roleRoutes).where(eq(schema.roleRoutes.id, routeId)).limit(1));
        return row ? mapRoute(row) : null;
      },
    },
    runtimeSessions: {
      async insert(session) {
        await attempt(() => db.insert(schema.runtimeSessions).values(session));
      },
      async get(sessionId) {
        const row = await one(db.select().from(schema.runtimeSessions).where(eq(schema.runtimeSessions.id, sessionId)).limit(1));
        return row ? mapSession(row) : null;
      },
      async latestForOrchestrator(orchestratorId, purpose) {
        const rows = await db
          .select()
          .from(schema.runtimeSessions)
          .where(and(eq(schema.runtimeSessions.orchestratorId, orchestratorId), eq(schema.runtimeSessions.purpose, purpose)))
          .orderBy(desc(schema.runtimeSessions.startedAt), desc(schema.runtimeSessions.createdAt))
          .limit(1);
        const row = rows[0];
        return row ? mapSession(row) : null;
      },
      async listByNode(executionNodeId) {
        const rows = await db
          .select()
          .from(schema.runtimeSessions)
          .where(eq(schema.runtimeSessions.executionNodeId, executionNodeId));
        return rows.map(mapSession);
      },
      async setStatus(sessionId, patch) {
        await updated(
          db
            .update(schema.runtimeSessions)
            .set(patch)
            .where(eq(schema.runtimeSessions.id, sessionId))
            .returning({ id: schema.runtimeSessions.id }),
          "Runtime session",
          sessionId,
        );
      },
      async attachAdapter(sessionId, adapterSessionId, executionEpoch, updatedAt) {
        await updated(
          db
            .update(schema.runtimeSessions)
            .set({ adapterSessionId, executionEpoch, updatedAt })
            .where(eq(schema.runtimeSessions.id, sessionId))
            .returning({ id: schema.runtimeSessions.id }),
          "Runtime session",
          sessionId,
        );
      },
      async rearm(sessionId, updatedAt) {
        await updated(
          db
            .update(schema.runtimeSessions)
            .set({
              status: "starting",
              adapterSessionId: null,
              executionEpoch: null,
              closeReason: null,
              endedAt: null,
              updatedAt,
            })
            .where(eq(schema.runtimeSessions.id, sessionId))
            .returning({ id: schema.runtimeSessions.id }),
          "Runtime session",
          sessionId,
        );
      },
    },
    agentRuns: {
      async insert(run) {
        await attempt(() => db.insert(schema.agentRuns).values(run));
      },
      async get(runId) {
        const row = await one(db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId)).limit(1));
        return row ? mapRun(row) : null;
      },
      async listBySession(sessionId) {
        const rows = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.runtimeSessionId, sessionId));
        return rows.map(mapRun);
      },
      async setStatus(runId, status, updatedAt, endedAt) {
        await updated(
          db
            .update(schema.agentRuns)
            .set({ status, updatedAt, endedAt })
            .where(eq(schema.agentRuns.id, runId))
            .returning({ id: schema.agentRuns.id }),
          "Agent run",
          runId,
        );
      },
      async rearm(runId, updatedAt) {
        await updated(
          db
            .update(schema.agentRuns)
            .set({ status: "planned", endedAt: null, updatedAt })
            .where(eq(schema.agentRuns.id, runId))
            .returning({ id: schema.agentRuns.id }),
          "Agent run",
          runId,
        );
      },
      async attachSession(runId, runtimeSessionId, updatedAt) {
        await updated(
          db
            .update(schema.agentRuns)
            .set({ runtimeSessionId, updatedAt })
            .where(eq(schema.agentRuns.id, runId))
            .returning({ id: schema.agentRuns.id }),
          "Agent run",
          runId,
        );
      },
    },
    memoryItems: {
      async insert(item) {
        await attempt(() => db.insert(schema.memoryItems).values(item));
      },
      async get(itemId) {
        const row = await one(db.select().from(schema.memoryItems).where(eq(schema.memoryItems.id, itemId)).limit(1));
        return row ? mapMemory(row) : null;
      },
      async search(query) {
        const rows = await db.select().from(schema.memoryItems).where(eq(schema.memoryItems.status, "active"));
        return rows.map(mapMemory).filter((item) => matchesMemoryQuery(item, query));
      },
      async setStatus(itemId, status, supersededById, updatedAt) {
        await updated(
          db
            .update(schema.memoryItems)
            .set({ status, supersededById, updatedAt })
            .where(eq(schema.memoryItems.id, itemId))
            .returning({ id: schema.memoryItems.id }),
          "Memory item",
          itemId,
        );
      },
    },
    decisions: {
      async insert(decision) {
        await attempt(() => db.insert(schema.decisions).values(decision));
      },
      async get(decisionId) {
        const row = await one(db.select().from(schema.decisions).where(eq(schema.decisions.id, decisionId)).limit(1));
        return row ? mapDecision(row) : null;
      },
      async markSuperseded(decisionId, updatedAt) {
        await updated(
          db
            .update(schema.decisions)
            .set({ status: "superseded", updatedAt })
            .where(eq(schema.decisions.id, decisionId))
            .returning({ id: schema.decisions.id }),
          "Decision",
          decisionId,
        );
      },
    },
    findings: {
      async insert(finding) {
        await attempt(() => db.insert(schema.findings).values(finding));
      },
      async get(findingId) {
        const row = await one(db.select().from(schema.findings).where(eq(schema.findings.id, findingId)).limit(1));
        return row ? mapFinding(row) : null;
      },
    },
    checkpoints: {
      async insert(checkpoint) {
        await attempt(() => db.insert(schema.checkpoints).values(checkpoint));
      },
      async get(checkpointId) {
        const row = await one(db.select().from(schema.checkpoints).where(eq(schema.checkpoints.id, checkpointId)).limit(1));
        return row ? mapCheckpoint(row) : null;
      },
      async latestForOrchestrator(orchestratorId) {
        const row = await one(
          db
            .select()
            .from(schema.checkpoints)
            .where(eq(schema.checkpoints.orchestratorId, orchestratorId))
            .orderBy(desc(schema.checkpoints.createdAt))
            .limit(1),
        );
        return row ? mapCheckpoint(row) : null;
      },
    },
    events: {
      async append(event) {
        await attempt(() => db.insert(schema.events).values(event));
      },
      async get(eventId) {
        const row = await one(db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1));
        return row ? mapEvent(row) : null;
      },
      async listByCorrelation(correlationId) {
        const rows = await db
          .select()
          .from(schema.events)
          .where(eq(schema.events.correlationId, correlationId))
          .orderBy(asc(schema.events.occurredAt), asc(schema.events.id));
        return rows.map(mapEvent);
      },
      async listByAggregate(aggregateType, aggregateId) {
        const rows = await db
          .select()
          .from(schema.events)
          .where(and(eq(schema.events.aggregateType, aggregateType), eq(schema.events.aggregateId, aggregateId)))
          .orderBy(asc(schema.events.occurredAt), asc(schema.events.id));
        return rows.map(mapEvent);
      },
    },
    artifacts: {
      async insert(artifact) {
        await attempt(() => db.insert(schema.artifacts).values(artifact));
      },
      async get(artifactId) {
        const row = await one(db.select().from(schema.artifacts).where(eq(schema.artifacts.id, artifactId)).limit(1));
        return row ? mapArtifact(row) : null;
      },
    },
    policyRules: {
      async insert(rule) {
        await attempt(() => db.insert(schema.policyRules).values(rule));
      },
      async list() {
        return (await db.select().from(schema.policyRules)).map(mapRule);
      },
      async findGlobal(action) {
        const rows = await db.select().from(schema.policyRules).where(eq(schema.policyRules.action, action));
        return rows.map(mapRule).find((rule) => rule.scopeType === "global") ?? null;
      },
      async get(ruleId) {
        const row = await one(db.select().from(schema.policyRules).where(eq(schema.policyRules.id, ruleId)).limit(1));
        return row ? mapRule(row) : null;
      },
    },
    approvals: {
      async insert(approval) {
        await attempt(() => db.insert(schema.approvals).values(approval));
      },
      async get(approvalId) {
        const row = await one(db.select().from(schema.approvals).where(eq(schema.approvals.id, approvalId)).limit(1));
        return row ? mapApproval(row) : null;
      },
      async decide(approvalId, status, decidedAt) {
        await updated(
          db
            .update(schema.approvals)
            .set({ status, decidedAt })
            .where(eq(schema.approvals.id, approvalId))
            .returning({ id: schema.approvals.id }),
          "Approval",
          approvalId,
        );
      },
    },
    worktrees: {
      async insert(worktree) {
        await attempt(() => db.insert(schema.worktrees).values(worktree));
      },
      async get(worktreeId) {
        const row = await one(db.select().from(schema.worktrees).where(eq(schema.worktrees.id, worktreeId)).limit(1));
        return row ? mapWorktree(row) : null;
      },
      async markRemoved(worktreeId, removedAt) {
        await updated(
          db
            .update(schema.worktrees)
            .set({ status: "removed", removedAt })
            .where(eq(schema.worktrees.id, worktreeId))
            .returning({ id: schema.worktrees.id }),
          "Worktree",
          worktreeId,
        );
      },
    },
  };
}

function mapUser(row: typeof schema.users.$inferSelect): User {
  return { ...row, id: id("UserId", row.id) };
}

function mapWorkspace(row: typeof schema.workspaces.$inferSelect): Workspace {
  return { ...row, id: id("WorkspaceId", row.id) };
}

function mapMember(row: typeof schema.workspaceMembers.$inferSelect): WorkspaceMember {
  return {
    workspaceId: id("WorkspaceId", row.workspaceId),
    userId: id("UserId", row.userId),
    role: row.role as MembershipRole,
    createdAt: row.createdAt,
  };
}

function mapNode(row: typeof schema.executionNodes.$inferSelect): ExecutionNode {
  return {
    ...row,
    id: id("ExecutionNodeId", row.id),
    kind: row.kind as ExecutionNodeKind,
    status: row.status as ExecutionNodeStatus,
  };
}

function mapProject(row: typeof schema.projects.$inferSelect): Project {
  return { ...row, id: id("ProjectId", row.id), workspaceId: id("WorkspaceId", row.workspaceId) };
}

function mapRepository(row: typeof schema.repositories.$inferSelect): Repository {
  return { ...row, id: id("RepositoryId", row.id), projectId: id("ProjectId", row.projectId) };
}

function mapCheckout(row: typeof schema.repositoryCheckouts.$inferSelect): import("@kilic/domain").RepositoryCheckout {
  return {
    ...row,
    id: id("RepositoryCheckoutId", row.id),
    repositoryId: id("RepositoryId", row.repositoryId),
    executionNodeId: id("ExecutionNodeId", row.executionNodeId),
    status: row.status as import("@kilic/domain").CheckoutStatus,
  };
}

function mapRelation(row: typeof schema.projectRelations.$inferSelect): ProjectRelation {
  return {
    ...row,
    id: id("ProjectRelationId", row.id),
    workspaceId: id("WorkspaceId", row.workspaceId),
    sourceProjectId: id("ProjectId", row.sourceProjectId),
    targetProjectId: id("ProjectId", row.targetProjectId),
    knowledgeClass: row.knowledgeClass as KnowledgeClass,
  };
}

function mapOrchestrator(row: typeof schema.orchestrators.$inferSelect): Orchestrator {
  return {
    ...row,
    id: id("OrchestratorId", row.id),
    workspaceId: id("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    kind: row.kind as OrchestratorKind,
    status: row.status as OrchestratorStatus,
  };
}

function mapOperation(row: typeof schema.operations.$inferSelect): Operation {
  return {
    ...row,
    id: id("OperationId", row.id),
    workspaceId: id("WorkspaceId", row.workspaceId),
    correlationId: id("CorrelationId", row.correlationId),
    status: row.status as OperationStatus,
  };
}

function mapTask(row: typeof schema.tasks.$inferSelect): Task {
  return {
    ...row,
    id: id("TaskId", row.id),
    operationId: id("OperationId", row.operationId),
    projectId: id("ProjectId", row.projectId),
    orchestratorId: id("OrchestratorId", row.orchestratorId),
    workspaceId: id("WorkspaceId", row.workspaceId),
    correlationId: id("CorrelationId", row.correlationId),
    status: row.status as TaskStatus,
  };
}

function mapDependency(row: typeof schema.taskDependencies.$inferSelect) {
  return {
    taskId: id("TaskId", row.taskId),
    dependsOnTaskId: id("TaskId", row.dependsOnTaskId),
    createdAt: row.createdAt,
  };
}

function mapHarness(row: typeof schema.harnesses.$inferSelect): Harness {
  return { ...row, id: id("HarnessId", row.id) };
}

function mapModel(row: typeof schema.models.$inferSelect): Model {
  return { ...row, id: id("ModelId", row.id), harnessId: id("HarnessId", row.harnessId) };
}

function mapPolicy(row: typeof schema.routingPolicies.$inferSelect): RoutingPolicy {
  return {
    ...row,
    id: id("RoutingPolicyId", row.id),
    scopeType: row.scopeType as ConfigScope,
    workspaceId: maybe("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    operationId: maybe("OperationId", row.operationId),
    executionProfile: row.executionProfile as ExecutionProfile | null,
  };
}

function mapRoute(row: typeof schema.roleRoutes.$inferSelect): RoleRoute {
  return {
    ...row,
    id: id("RoleRouteId", row.id),
    routingPolicyId: id("RoutingPolicyId", row.routingPolicyId),
    harnessId: id("HarnessId", row.harnessId),
    modelId: id("ModelId", row.modelId),
  };
}

function mapSession(row: typeof schema.runtimeSessions.$inferSelect): RuntimeSession {
  return {
    ...row,
    id: id("RuntimeSessionId", row.id),
    orchestratorId: id("OrchestratorId", row.orchestratorId),
    executionNodeId: id("ExecutionNodeId", row.executionNodeId),
    harnessId: id("HarnessId", row.harnessId),
    modelId: id("ModelId", row.modelId),
    purpose: row.purpose as RuntimeSessionPurpose,
    status: row.status as RuntimeSessionStatus,
    correlationId: id("CorrelationId", row.correlationId),
  };
}

function mapRun(row: typeof schema.agentRuns.$inferSelect): AgentRun {
  return {
    ...row,
    id: id("AgentRunId", row.id),
    runtimeSessionId: maybe("RuntimeSessionId", row.runtimeSessionId),
    orchestratorId: id("OrchestratorId", row.orchestratorId),
    taskId: maybe("TaskId", row.taskId),
    parentRunId: maybe("AgentRunId", row.parentRunId),
    workspaceId: id("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    operationId: maybe("OperationId", row.operationId),
    correlationId: id("CorrelationId", row.correlationId),
    kind: row.kind as AgentRunKind,
    access: row.access as AccessMode,
    status: row.status as AgentRunStatus,
    isolation: (row.isolation ?? null) as IsolationPlan | null,
  };
}

function mapMemory(row: typeof schema.memoryItems.$inferSelect): MemoryItem {
  return {
    ...row,
    id: id("MemoryItemId", row.id),
    scopeType: row.scopeType as MemoryScope,
    ownerUserId: maybe("UserId", row.ownerUserId),
    workspaceId: maybe("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    operationId: maybe("OperationId", row.operationId),
    taskId: maybe("TaskId", row.taskId),
    agentRunId: maybe("AgentRunId", row.agentRunId),
    knowledgeClass: row.knowledgeClass as KnowledgeClass,
    status: row.status as RecordStatus,
    supersededById: maybe("MemoryItemId", row.supersededById),
  };
}

function mapDecision(row: typeof schema.decisions.$inferSelect): Decision {
  return {
    ...row,
    id: id("DecisionId", row.id),
    workspaceId: id("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    operationId: maybe("OperationId", row.operationId),
    status: row.status as RecordStatus,
    supersedesId: maybe("DecisionId", row.supersedesId),
  };
}

function mapFinding(row: typeof schema.findings.$inferSelect): Finding {
  return {
    ...row,
    id: id("FindingId", row.id),
    workspaceId: id("WorkspaceId", row.workspaceId),
    projectId: id("ProjectId", row.projectId),
    taskId: maybe("TaskId", row.taskId),
    agentRunId: maybe("AgentRunId", row.agentRunId),
    knowledgeClass: row.knowledgeClass as KnowledgeClass,
    status: row.status as RecordStatus,
  };
}

function mapCheckpoint(row: typeof schema.checkpoints.$inferSelect): Checkpoint {
  return {
    ...row,
    id: id("CheckpointId", row.id),
    orchestratorId: id("OrchestratorId", row.orchestratorId),
    workspaceId: id("WorkspaceId", row.workspaceId),
    runtimeSessionId: maybe("RuntimeSessionId", row.runtimeSessionId),
    operationId: maybe("OperationId", row.operationId),
    taskId: maybe("TaskId", row.taskId),
    correlationId: id("CorrelationId", row.correlationId),
    trigger: row.trigger as CheckpointTrigger,
    state: row.state as CheckpointState,
  };
}

function mapEvent(row: typeof schema.events.$inferSelect): KilicEvent {
  return {
    ...row,
    id: id("EventId", row.id),
    workspaceId: maybe("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    correlationId: id("CorrelationId", row.correlationId),
    causationId: maybe("EventId", row.causationId),
    agentRunId: maybe("AgentRunId", row.agentRunId),
    runtimeSessionId: maybe("RuntimeSessionId", row.runtimeSessionId),
    payload: row.payload ?? {},
  };
}

function mapArtifact(row: typeof schema.artifacts.$inferSelect): Artifact {
  return {
    ...row,
    id: id("ArtifactId", row.id),
    workspaceId: id("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    taskId: maybe("TaskId", row.taskId),
    agentRunId: maybe("AgentRunId", row.agentRunId),
    metadata: row.metadata ?? {},
  };
}

function mapRule(row: typeof schema.policyRules.$inferSelect): PolicyRule {
  return {
    ...row,
    id: id("PolicyRuleId", row.id),
    scopeType: row.scopeType as PolicyScope,
    workspaceId: maybe("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    effect: row.effect as PolicyEffect,
  };
}

function mapApproval(row: typeof schema.approvals.$inferSelect): Approval {
  return {
    ...row,
    id: id("ApprovalId", row.id),
    policyRuleId: maybe("PolicyRuleId", row.policyRuleId),
    status: row.status as ApprovalStatus,
    workspaceId: id("WorkspaceId", row.workspaceId),
    projectId: maybe("ProjectId", row.projectId),
    operationId: maybe("OperationId", row.operationId),
    taskId: maybe("TaskId", row.taskId),
    requestedByRunId: maybe("AgentRunId", row.requestedByRunId),
    correlationId: id("CorrelationId", row.correlationId),
    payload: row.payload ?? {},
  };
}

function mapWorktree(row: typeof schema.worktrees.$inferSelect): Worktree {
  return {
    ...row,
    id: id("WorktreeId", row.id),
    repositoryId: id("RepositoryId", row.repositoryId),
    agentRunId: id("AgentRunId", row.agentRunId),
    executionNodeId: id("ExecutionNodeId", row.executionNodeId),
    status: row.status as WorktreeStatus,
  };
}

async function one<T>(query: Promise<T[]>): Promise<T | null> {
  const rows = await query;
  return rows[0] ?? null;
}

async function updated(query: Promise<Array<{ id: string }>>, label: string, entityId: string): Promise<void> {
  const rows = await attempt(() => query);
  if (rows.length === 0) throw new DomainError("NOT_FOUND", `${label} ${entityId} was not found`);
}

async function attempt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isPostgres(error) && error.code === "23505") throw new DomainError("CONFLICT", "Unique constraint violated");
    if (isPostgres(error) && error.code === "23514") throw new DomainError("INVARIANT", "Database invariant rejected the write");
    if (isPostgres(error) && error.code === "P0001") throw new DomainError("APPEND_ONLY", error.message);
    throw error;
  }
}

function isPostgres(error: unknown): error is { code: string; message: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}
