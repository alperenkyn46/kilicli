import type { MemoryItem, MemorySearchQuery } from "@kilic/domain";

export function matchesMemoryQuery(item: MemoryItem, query: MemorySearchQuery): boolean {
  const scoped =
    (query.includeSystemGlobal && item.scopeType === "global" && item.ownerUserId === null) ||
    (query.ownerUserId !== undefined && item.scopeType === "user" && item.ownerUserId === query.ownerUserId) ||
    (query.workspaceId !== undefined && item.scopeType === "workspace" && item.workspaceId === query.workspaceId) ||
    (query.projectId !== undefined && item.scopeType === "project" && item.projectId === query.projectId && item.workspaceId === query.workspaceId) ||
    (query.operationId !== undefined && item.scopeType === "operation" && item.operationId === query.operationId && item.workspaceId === query.workspaceId) ||
    (query.taskId !== undefined && item.scopeType === "task" && item.taskId === query.taskId && item.workspaceId === query.workspaceId && item.projectId === query.projectId && item.operationId === query.operationId) ||
    (query.agentRunId !== undefined && item.scopeType === "run" && item.agentRunId === query.agentRunId && item.workspaceId === query.workspaceId && (query.projectId === undefined || item.projectId === query.projectId));
  if (!scoped) return false;
  if (!query.text) return true;
  const haystack = `${item.title}\n${item.body}`.toLocaleLowerCase("tr-TR");
  return haystack.includes(query.text.toLocaleLowerCase("tr-TR"));
}
