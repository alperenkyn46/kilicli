import type { BootstrapContext } from "@kilic/runtime-contract";
import type {
  AgentRunId,
  OperationId,
  OrchestratorId,
  Repositories,
  RuntimeSessionId,
  TaskId,
  UserId,
} from "@kilic/domain";
import { DomainError } from "@kilic/shared";

export const RUNTIME_DOCTRINE_PATH = "identity/AGENTS.md";

export async function buildBootstrapContext(
  repos: Repositories,
  input: {
    orchestratorId: OrchestratorId;
    userId: UserId;
    purpose: "orchestrator_mind" | "worker";
    role: string;
    executionNodeId: string;
    correlationId: string;
    operationId?: OperationId | null;
    taskId?: TaskId | null;
    runtimeSessionId?: RuntimeSessionId | null;
    agentRunId?: AgentRunId | null;
  },
): Promise<BootstrapContext> {
  const orchestrator = await repos.orchestrators.get(input.orchestratorId);
  if (!orchestrator) throw new DomainError("NOT_FOUND", "Orchestrator was not found");
  const workspace = await repos.workspaces.get(orchestrator.workspaceId);
  if (!workspace) throw new DomainError("NOT_FOUND", "Workspace was not found");
  const project = orchestrator.projectId ? await repos.projects.get(orchestrator.projectId) : null;
  const operation = input.operationId ? await repos.operations.get(input.operationId) : null;
  const task = input.taskId ? await repos.tasks.get(input.taskId) : null;
  const checkpoint = await repos.checkpoints.latestForOrchestrator(orchestrator.id);
  const memories = await repos.memoryItems.search({
    includeSystemGlobal: true,
    ownerUserId: input.userId,
    workspaceId: workspace.id,
    ...(project ? { projectId: project.id } : {}),
    ...(operation ? { operationId: operation.id } : {}),
    ...(task ? { taskId: task.id } : {}),
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
  });

  return {
    doctrinePath: RUNTIME_DOCTRINE_PATH,
    identity: {
      orchestratorId: orchestrator.id,
      kind: orchestrator.kind,
      displayName: orchestrator.displayName,
    },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    project: project ? { id: project.id, name: project.name, slug: project.slug } : null,
    operation: operation
      ? { id: operation.id, title: operation.title, status: operation.status, language: operation.language }
      : null,
    task: task
      ? {
          id: task.id,
          title: task.title,
          status: task.status,
          acceptanceCriteria: task.acceptanceCriteria,
          language: task.language,
        }
      : null,
    checkpoint: checkpoint
      ? {
          id: checkpoint.id,
          trigger: checkpoint.trigger,
          state: checkpoint.state,
          createdAt: checkpoint.createdAt.toISOString(),
        }
      : null,
    memories: memories.map((item) => ({
      id: item.id,
      scopeType: item.scopeType,
      title: item.title,
      body: item.body,
      language: item.language,
      knowledgeClass: item.knowledgeClass,
    })),
    runtime: {
      purpose: input.purpose,
      role: input.role,
      executionNodeId: input.executionNodeId,
      correlationId: input.correlationId,
    },
  };
}
