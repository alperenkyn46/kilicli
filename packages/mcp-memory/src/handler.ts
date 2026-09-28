import { asId, DomainError } from "@kilic/shared";
import type { MemoryService } from "@kilic/memory";
import type { KnowledgeClass, MemoryScope } from "@kilic/domain";

export const MEMORY_TOOL_NAMES = [
  "memory.search",
  "memory.get",
  "memory.remember_fact",
  "decision.record",
  "finding.record",
] as const;

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

/**
 * Protocol adapter. It validates tool arguments and calls the memory service.
 * It does not own storage or SQL.
 */
export async function handleMemoryTool(memory: MemoryService, name: string, args: unknown): Promise<ToolResult> {
  const input = record(args);
  switch (name) {
    case "memory.search":
      return text(await memory.search({
        userId: asId<"UserId">(requiredString(input.userId, "userId"), "userId"),
        workspaceId: asId<"WorkspaceId">(requiredString(input.workspaceId, "workspaceId"), "workspaceId"),
        ...(typeof input.projectId === "string" ? { projectId: asId<"ProjectId">(input.projectId, "projectId") } : {}),
        ...(typeof input.operationId === "string" ? { operationId: asId<"OperationId">(input.operationId, "operationId") } : {}),
        ...(typeof input.taskId === "string" ? { taskId: asId<"TaskId">(input.taskId, "taskId") } : {}),
        ...(typeof input.text === "string" ? { text: input.text } : {}),
      }));
    case "memory.get":
      return text(await memory.get(asId<"MemoryItemId">(requiredString(input.id, "id"), "id")));
    case "memory.remember_fact":
      return text(await memory.remember({
        scopeType: requiredString(input.scopeType, "scopeType") as MemoryScope,
        ownerUserId: optionalUuid(input.ownerUserId, "UserId", "ownerUserId"),
        workspaceId: optionalUuid(input.workspaceId, "WorkspaceId", "workspaceId"),
        projectId: optionalUuid(input.projectId, "ProjectId", "projectId"),
        operationId: optionalUuid(input.operationId, "OperationId", "operationId"),
        taskId: optionalUuid(input.taskId, "TaskId", "taskId"),
        agentRunId: optionalUuid(input.agentRunId, "AgentRunId", "agentRunId"),
        kind: "fact",
        title: requiredString(input.title, "title"),
        body: requiredString(input.body, "body"),
        language: typeof input.language === "string" ? input.language : null,
        knowledgeClass: requiredString(input.knowledgeClass, "knowledgeClass") as KnowledgeClass,
      }));
    case "decision.record":
      return text(await memory.recordDecision({
        workspaceId: asId<"WorkspaceId">(requiredString(input.workspaceId, "workspaceId"), "workspaceId"),
        projectId: optionalUuid(input.projectId, "ProjectId", "projectId"),
        operationId: optionalUuid(input.operationId, "OperationId", "operationId"),
        title: requiredString(input.title, "title"),
        decision: requiredString(input.decision, "decision"),
        reason: requiredString(input.reason, "reason"),
        language: typeof input.language === "string" ? input.language : null,
        supersedesId: optionalUuid(input.supersedesId, "DecisionId", "supersedesId"),
      }));
    case "finding.record":
      return text(await memory.recordFinding({
        workspaceId: asId<"WorkspaceId">(requiredString(input.workspaceId, "workspaceId"), "workspaceId"),
        projectId: asId<"ProjectId">(requiredString(input.projectId, "projectId"), "projectId"),
        taskId: optionalUuid(input.taskId, "TaskId", "taskId"),
        agentRunId: optionalUuid(input.agentRunId, "AgentRunId", "agentRunId"),
        title: requiredString(input.title, "title"),
        body: requiredString(input.body, "body"),
        recommendation: typeof input.recommendation === "string" ? input.recommendation : null,
        language: typeof input.language === "string" ? input.language : null,
        knowledgeClass: requiredString(input.knowledgeClass, "knowledgeClass") as KnowledgeClass,
      }));
    default:
      throw new DomainError("UNKNOWN_TOOL", `Unknown memory tool ${name}`);
  }
}

function text(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainError("INVALID_TOOL_ARGS", "Tool arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError("INVALID_TOOL_ARGS", `${field} is required`);
  }
  return value;
}

function optionalUuid<Brand extends string>(value: unknown, label: Brand, field: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new DomainError("INVALID_TOOL_ARGS", `${field} must be a string`);
  return asId<Brand>(value, field);
}
