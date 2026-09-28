import { DomainError, newId, type Clock } from "@kilic/shared";
import {
  assertMemoryScope,
  buildEvent,
  newCorrelationId,
  optionalLanguage,
  optionalText,
  requireBody,
  requireTitle,
  type AgentRunId,
  type Decision,
  type DecisionId,
  type Finding,
  type KnowledgeClass,
  type MemoryItem,
  type MemoryScope,
  type MemorySearchQuery,
  type OperationId,
  type ProjectId,
  type Repositories,
  type TaskId,
  type UserId,
  type WorkspaceId,
} from "@kilic/domain";

export type MemoryContext = {
  userId: UserId;
  workspaceId: WorkspaceId;
  projectId?: ProjectId;
  operationId?: OperationId;
  taskId?: TaskId;
  agentRunId?: AgentRunId;
  text?: string;
};

export function searchQueryFor(context: MemoryContext): MemorySearchQuery {
  return {
    includeSystemGlobal: true,
    ownerUserId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.operationId ? { operationId: context.operationId } : {}),
    ...(context.taskId ? { taskId: context.taskId } : {}),
    ...(context.agentRunId ? { agentRunId: context.agentRunId } : {}),
    ...(context.text ? { text: context.text } : {}),
  };
}

export class MemoryService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock,
  ) {}

  async remember(input: {
    scopeType: MemoryScope;
    ownerUserId?: UserId | null;
    workspaceId?: WorkspaceId | null;
    projectId?: ProjectId | null;
    operationId?: OperationId | null;
    taskId?: TaskId | null;
    agentRunId?: AgentRunId | null;
    kind: string;
    title: string;
    body: string;
    language?: string | null;
    knowledgeClass: KnowledgeClass;
  }): Promise<MemoryItem> {
    const scope = {
      scopeType: input.scopeType,
      ownerUserId: input.ownerUserId ?? null,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      operationId: input.operationId ?? null,
      taskId: input.taskId ?? null,
      agentRunId: input.agentRunId ?? null,
    };
    assertMemoryScope(scope);
    await this.assertMemoryLinks(scope);
    const now = this.clock();
    const item: MemoryItem = {
      id: newId<"MemoryItemId">(),
      ...scope,
      kind: requireTitle(input.kind, "kind"),
      title: requireTitle(input.title),
      body: requireBody(input.body, "body"),
      language: optionalLanguage(input.language),
      knowledgeClass: input.knowledgeClass,
      status: "active",
      supersededById: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.transaction(async (repos) => {
      await repos.memoryItems.insert(item);
      await repos.events.append(
        buildEvent({
          type: "memory.recorded",
          workspaceId: item.workspaceId,
          projectId: item.projectId,
          aggregateType: "memory_item",
          aggregateId: item.id,
          correlationId: newCorrelationId(),
          occurredAt: now,
          payload: { scopeType: item.scopeType, kind: item.kind },
        }),
      );
    });
    return item;
  }

  async get(id: MemoryItem["id"]): Promise<MemoryItem | null> {
    return this.repos.memoryItems.get(id);
  }

  async search(context: MemoryContext): Promise<MemoryItem[]> {
    return this.repos.memoryItems.search(searchQueryFor(context));
  }

  async recordDecision(input: {
    workspaceId: WorkspaceId;
    projectId?: ProjectId | null;
    operationId?: OperationId | null;
    title: string;
    decision: string;
    reason: string;
    language?: string | null;
    supersedesId?: DecisionId | null;
  }): Promise<Decision> {
    if (input.supersedesId) {
      const previous = await this.repos.decisions.get(input.supersedesId);
      if (!previous) throw new DomainError("NOT_FOUND", `Decision ${input.supersedesId} was not found`);
      if (previous.workspaceId !== input.workspaceId) {
        throw new DomainError("INVARIANT", "A decision can only supersede another decision in the same workspace");
      }
    }
    const now = this.clock();
    const decision: Decision = {
      id: newId<"DecisionId">(),
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      operationId: input.operationId ?? null,
      title: requireTitle(input.title),
      decision: requireBody(input.decision, "decision"),
      reason: requireBody(input.reason, "reason"),
      language: optionalLanguage(input.language),
      status: "active",
      supersedesId: input.supersedesId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.transaction(async (repos) => {
      if (input.supersedesId) await repos.decisions.markSuperseded(input.supersedesId, now);
      await repos.decisions.insert(decision);
      await repos.events.append(
        buildEvent({
          type: "decision.recorded",
          workspaceId: decision.workspaceId,
          projectId: decision.projectId,
          aggregateType: "decision",
          aggregateId: decision.id,
          correlationId: newCorrelationId(),
          occurredAt: now,
          payload: { supersedesId: decision.supersedesId },
        }),
      );
    });
    return decision;
  }

  async recordFinding(input: {
    workspaceId: WorkspaceId;
    projectId: ProjectId;
    taskId?: TaskId | null;
    agentRunId?: AgentRunId | null;
    title: string;
    body: string;
    recommendation?: string | null;
    language?: string | null;
    knowledgeClass: KnowledgeClass;
  }): Promise<Finding> {
    const now = this.clock();
    const finding: Finding = {
      id: newId<"FindingId">(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      agentRunId: input.agentRunId ?? null,
      title: requireTitle(input.title),
      body: requireBody(input.body, "body"),
      recommendation: optionalText(input.recommendation),
      language: optionalLanguage(input.language),
      knowledgeClass: input.knowledgeClass,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.transaction(async (repos) => {
      await repos.findings.insert(finding);
      await repos.events.append(
        buildEvent({
          type: "finding.recorded",
          workspaceId: finding.workspaceId,
          projectId: finding.projectId,
          aggregateType: "finding",
          aggregateId: finding.id,
          correlationId: newCorrelationId(),
          agentRunId: finding.agentRunId,
          occurredAt: now,
          payload: { knowledgeClass: finding.knowledgeClass },
        }),
      );
    });
    return finding;
  }

  private async assertMemoryLinks(scope: {
    ownerUserId: UserId | null;
    workspaceId: WorkspaceId | null;
    projectId: ProjectId | null;
    operationId: OperationId | null;
    taskId: TaskId | null;
    agentRunId: AgentRunId | null;
  }): Promise<void> {
    if (scope.ownerUserId) {
      const user = await this.repos.users.get(scope.ownerUserId);
      if (!user) throw new DomainError("NOT_FOUND", "Memory owner was not found");
    }
    if (scope.projectId) {
      const project = await this.repos.projects.get(scope.projectId);
      if (!project || project.workspaceId !== scope.workspaceId) {
        throw new DomainError("INVARIANT", "Memory project is outside the workspace");
      }
    }
    if (scope.operationId) {
      const operation = await this.repos.operations.get(scope.operationId);
      if (!operation || operation.workspaceId !== scope.workspaceId) {
        throw new DomainError("INVARIANT", "Memory operation is outside the workspace");
      }
    }
    if (scope.taskId) {
      const task = await this.repos.tasks.get(scope.taskId);
      if (!task || task.workspaceId !== scope.workspaceId || task.operationId !== scope.operationId || task.projectId !== scope.projectId) {
        throw new DomainError("INVARIANT", "Memory task does not match the operation and project");
      }
    }
    if (scope.agentRunId) {
      const run = await this.repos.agentRuns.get(scope.agentRunId);
      if (!run || run.workspaceId !== scope.workspaceId) {
        throw new DomainError("INVARIANT", "Memory run is outside the workspace");
      }
      if (scope.projectId && run.projectId !== scope.projectId) {
        throw new DomainError("INVARIANT", "Memory run belongs to another project");
      }
      if (scope.taskId && run.taskId !== scope.taskId) {
        throw new DomainError("INVARIANT", "Memory run belongs to another task");
      }
    }
  }
}
