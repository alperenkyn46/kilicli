import { asId, DomainError } from "@kilic/shared";
import type { AccessMode } from "@kilic/domain";
import type { Kernel } from "@kilic/kernel";

export const WORKFORCE_TOOL_NAMES = ["workforce.spawn"] as const;

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

/** Protocol adapter over the kernel dispatch contract. It does not choose a provider. */
export async function handleWorkforceTool(kernel: Kernel, name: string, args: unknown): Promise<ToolResult> {
  if (name !== "workforce.spawn") {
    throw new DomainError("UNKNOWN_TOOL", `Unknown workforce tool ${name}`);
  }
  const input = record(args);
  const result = await kernel.dispatchWorker({
    taskId: asId<"TaskId">(requiredString(input.taskId, "taskId"), "taskId"),
    role: requiredString(input.role, "role"),
    access: requiredString(input.access, "access") as AccessMode,
    action: requiredString(input.action, "action"),
    executionNodeId: asId<"ExecutionNodeId">(requiredString(input.executionNodeId, "executionNodeId"), "executionNodeId"),
    baseRef: typeof input.baseRef === "string" ? input.baseRef : null,
    approvalId: typeof input.approvalId === "string" ? asId<"ApprovalId">(input.approvalId, "approvalId") : null,
  });
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
