import { asId, DomainError } from "@kilic/shared";
import type { MemoryService } from "@kilic/memory";
import type { KnowledgeClass, MemoryScope } from "@kilic/domain";
import type { ScopedToolPrincipal } from "@kilic/domain";

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
export async function handleMemoryTool(memory: MemoryService, name: string, args: unknown, principal: ScopedToolPrincipal): Promise<ToolResult> {
  const input = record(args);
  const context = {
    ...(principal.userId ? { userId: principal.userId } : {}),
    workspaceId: principal.workspaceId,
    ...(principal.projectId ? { projectId: principal.projectId } : {}),
    ...(principal.operationId ? { operationId: principal.operationId } : {}),
    ...(principal.taskId ? { taskId: principal.taskId } : {}),
    ...(principal.agentRunId ? { agentRunId: principal.agentRunId } : {}),
  };
  switch (name) {
    case "memory.search":
      return text(await memory.search({
        ...context,
        ...(typeof input.text === "string" ? { text: input.text } : {}),
      }));
    case "memory.get":
      return text(await memory.getInContext(asId<"MemoryItemId">(requiredString(input.id, "id"), "id"), context));
    case "memory.remember_fact":
      if (!["workspace", "project", "operation", "task", "run"].includes(requiredString(input.scopeType, "scopeType"))) throw new DomainError("FORBIDDEN", "Tool cannot write system or user memory");
      return text(await memory.remember({
        scopeType: requiredString(input.scopeType, "scopeType") as MemoryScope,
        workspaceId: principal.workspaceId,
        projectId: ["project", "task", "run"].includes(String(input.scopeType)) ? principal.projectId : null,
        operationId: ["operation", "task", "run"].includes(String(input.scopeType)) ? principal.operationId : null,
        taskId: ["task", "run"].includes(String(input.scopeType)) ? principal.taskId : null,
        agentRunId: input.scopeType === "run" ? principal.agentRunId : null,
        kind: "fact",
        title: requiredString(input.title, "title"),
        body: requiredString(input.body, "body"),
        language: typeof input.language === "string" ? input.language : null,
        knowledgeClass: requiredString(input.knowledgeClass, "knowledgeClass") as KnowledgeClass,
      }));
    case "decision.record":
      return text(await memory.recordDecision({
        workspaceId: principal.workspaceId,
        projectId: principal.projectId,
        operationId: principal.operationId,
        title: requiredString(input.title, "title"),
        decision: requiredString(input.decision, "decision"),
        reason: requiredString(input.reason, "reason"),
        language: typeof input.language === "string" ? input.language : null,
        supersedesId: optionalUuid(input.supersedesId, "DecisionId", "supersedesId"),
      }));
    case "finding.record":
      if (!principal.projectId) throw new DomainError("FORBIDDEN", "Finding requires project scope");
      return text(await memory.recordFinding({
        workspaceId: principal.workspaceId,
        projectId: principal.projectId,
        taskId: principal.taskId,
        agentRunId: principal.agentRunId,
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
