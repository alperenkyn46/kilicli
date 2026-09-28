import { DomainError } from "@kilic/shared";
import type { Orchestrator, ProjectRelation, RoutingPolicy } from "./entities.js";
import type { MemoryScopeRef } from "./entities.js";
import type { OperationStatus, TaskStatus } from "./statuses.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATION_TYPE_PATTERN = /^[a-z0-9_]+$/;
const TITLE_LIMIT = 200;
const BODY_LIMIT = 20_000;

export function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DomainError("INVALID_TEXT", `${field} is required`);
  }
  return trimmed;
}

export function requireTitle(value: string, field = "title"): string {
  const title = requireText(value, field);
  if (title.length > TITLE_LIMIT) {
    throw new DomainError("INVALID_TEXT", `${field} must be at most ${TITLE_LIMIT} characters`);
  }
  return title;
}

export function requireBody(value: string, field: string): string {
  const body = requireText(value, field);
  if (body.length > BODY_LIMIT) {
    throw new DomainError(
      "INVALID_TEXT",
      `${field} must be at most ${BODY_LIMIT} characters. Distill the record instead of storing raw logs.`,
    );
  }
  return body;
}

export function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function optionalLanguage(value: string | null | undefined): string | null {
  const language = optionalText(value);
  if (language && language.length > 35) {
    throw new DomainError("INVALID_TEXT", "language must be a BCP 47 tag");
  }
  return language;
}

export function assertSlug(slug: string): string {
  const normalized = slug.trim();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new DomainError("INVALID_SLUG", "Slug must be lowercase kebab-case");
  }
  return normalized;
}

export function assertRelationType(relationType: string): string {
  const normalized = relationType.trim();
  if (!RELATION_TYPE_PATTERN.test(normalized)) {
    throw new DomainError("INVALID_RELATION", "Relation type must be a lowercase identifier");
  }
  return normalized;
}

export function assertConfidence(confidence: number | null): number | null {
  if (confidence == null) return null;
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new DomainError("INVALID_CONFIDENCE", "Confidence must be an integer from 0 to 100");
  }
  return confidence;
}

export function assertOrchestratorShape(
  orchestrator: Pick<Orchestrator, "kind" | "projectId">,
): void {
  if (orchestrator.kind === "workspace" && orchestrator.projectId !== null) {
    throw new DomainError(
      "INVARIANT",
      "A workspace orchestrator cannot be bound to a project",
    );
  }
  if (orchestrator.kind === "project" && orchestrator.projectId === null) {
    throw new DomainError("INVARIANT", "A project orchestrator requires a project");
  }
}

export function assertMemoryScope(scope: MemoryScopeRef): void {
  const { scopeType, ownerUserId, workspaceId, projectId, operationId, taskId, agentRunId } = scope;
  const lowerEmpty = projectId === null && operationId === null && taskId === null && agentRunId === null;

  switch (scopeType) {
    case "global":
      if (ownerUserId !== null || workspaceId !== null || !lowerEmpty) {
        throw new DomainError("INVARIANT", "System-global memory cannot carry an owner or a narrower scope id");
      }
      return;
    case "user":
      if (ownerUserId === null || workspaceId !== null || !lowerEmpty) {
        throw new DomainError("INVARIANT", "User memory requires only an owner user id");
      }
      return;
    case "workspace":
      if (ownerUserId !== null || workspaceId === null || !lowerEmpty) {
        throw new DomainError("INVARIANT", "Workspace memory requires only a workspace id");
      }
      return;
    case "project":
      if (ownerUserId !== null || workspaceId === null || projectId === null || operationId !== null || taskId !== null || agentRunId !== null) {
        throw new DomainError("INVARIANT", "Project memory requires workspace and project ids");
      }
      return;
    case "operation":
      if (ownerUserId !== null || workspaceId === null || operationId === null || taskId !== null || agentRunId !== null) {
        throw new DomainError("INVARIANT", "Operation memory requires workspace and operation ids");
      }
      return;
    case "task":
      if (ownerUserId !== null || workspaceId === null || projectId === null || operationId === null || taskId === null || agentRunId !== null) {
        throw new DomainError("INVARIANT", "Task memory requires workspace, project, operation, and task ids");
      }
      return;
    case "run":
      if (ownerUserId !== null || workspaceId === null || agentRunId === null) {
        throw new DomainError("INVARIANT", "Run memory requires workspace and run ids");
      }
      return;
    default: {
      const unreachable: never = scopeType;
      throw new DomainError("INVARIANT", `Unknown memory scope ${String(unreachable)}`);
    }
  }
}

export function assertRoutingPolicyShape(
  policy: Pick<RoutingPolicy, "scopeType" | "workspaceId" | "projectId" | "operationId">,
): void {
  switch (policy.scopeType) {
    case "global":
      if (policy.workspaceId || policy.projectId || policy.operationId) {
        throw new DomainError("INVARIANT", "A global routing policy cannot carry a scope id");
      }
      return;
    case "workspace":
      if (!policy.workspaceId || policy.projectId || policy.operationId) {
        throw new DomainError("INVARIANT", "A workspace routing policy requires only a workspace id");
      }
      return;
    case "project":
      if (!policy.workspaceId || !policy.projectId || policy.operationId) {
        throw new DomainError("INVARIANT", "A project routing policy requires workspace and project ids");
      }
      return;
    case "operation":
      if (!policy.workspaceId || !policy.operationId) {
        throw new DomainError("INVARIANT", "An operation routing policy requires workspace and operation ids");
      }
      return;
    default: {
      const unreachable: never = policy.scopeType;
      throw new DomainError("INVARIANT", `Unknown policy scope ${String(unreachable)}`);
    }
  }
}

export function assertProjectRelation(relation: Pick<ProjectRelation, "sourceProjectId" | "targetProjectId">): void {
  if (relation.sourceProjectId === relation.targetProjectId) {
    throw new DomainError("INVARIANT", "A project cannot relate to itself");
  }
}

const OPERATION_TRANSITIONS: Record<OperationStatus, readonly OperationStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["blocked", "completed", "cancelled"],
  blocked: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["ready", "cancelled"],
  ready: ["pending", "in_progress", "cancelled"],
  in_progress: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["ready", "cancelled"],
  failed: ["ready", "cancelled"],
  completed: [],
  cancelled: [],
};

export function assertOperationTransition(from: OperationStatus, to: OperationStatus): void {
  if (!OPERATION_TRANSITIONS[from].includes(to)) {
    throw new DomainError("INVALID_TRANSITION", `Operation cannot move from ${from} to ${to}`);
  }
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!TASK_TRANSITIONS[from].includes(to)) {
    throw new DomainError("INVALID_TRANSITION", `Task cannot move from ${from} to ${to}`);
  }
}

export function assertNoDependencyCycle(
  existing: ReadonlyArray<{ taskId: string; dependsOnTaskId: string }>,
  next: { taskId: string; dependsOnTaskId: string },
): void {
  if (next.taskId === next.dependsOnTaskId) {
    throw new DomainError("CYCLE", "A task cannot depend on itself");
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of [...existing, next]) {
    const dependencies = adjacency.get(edge.taskId) ?? [];
    dependencies.push(edge.dependsOnTaskId);
    adjacency.set(edge.taskId, dependencies);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) {
      throw new DomainError("CYCLE", "Task dependencies cannot contain a cycle");
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of adjacency.get(taskId) ?? []) visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const taskId of adjacency.keys()) visit(taskId);
}

export function taskStatusAfterDependencies(input: {
  status: TaskStatus;
  dependencyStatuses: readonly TaskStatus[];
}): TaskStatus {
  if (input.status !== "pending") return input.status;
  if (input.dependencyStatuses.length === 0) return "ready";
  return input.dependencyStatuses.every((status) => status === "completed") ? "ready" : "pending";
}
