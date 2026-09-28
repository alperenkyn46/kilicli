import type { AgentRunId, ExecutionJobId, ExecutionNodeId, OperationId, ProjectId, TaskId, UserId, WorkspaceId } from "./ids.js";

export type UserPrincipal = { kind: "user"; userId: UserId };
export type ServicePrincipal = { kind: "service"; serviceKey: string };
export type ExecutionNodePrincipal = { kind: "execution_node"; nodeId: ExecutionNodeId; bootId: string };
export type ScopedToolPrincipal = {
  kind: "tool";
  executionJobId: ExecutionJobId;
  agentRunId: AgentRunId | null;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  taskId: TaskId | null;
  userId?: UserId;
};

export type Principal = UserPrincipal | ServicePrincipal | ExecutionNodePrincipal | ScopedToolPrincipal;

export function principalKey(principal: Principal): string {
  switch (principal.kind) {
    case "user": return `user:${principal.userId}`;
    case "service": return `service:${principal.serviceKey}`;
    case "execution_node": return `node:${principal.nodeId}:${principal.bootId}`;
    case "tool": return `tool:${principal.executionJobId}`;
  }
}
