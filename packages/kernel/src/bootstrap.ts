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
export const BOOTSTRAP_MEMORY_LIMIT = 12;
export const BOOTSTRAP_MEMORY_BODY_LIMIT = 500;
export const BOOTSTRAP_POLICY_LIMIT = 12;

export async function buildBootstrapContext(
  repos: Repositories,
  input: {
    orchestratorId: OrchestratorId;
    userId?: UserId;
    doctrineText: string;
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
  if (!input.doctrineText.trim()) throw new DomainError("INVARIANT", "Runtime doctrine must be loaded before bootstrap");
  const orchestrator = await repos.orchestrators.get(input.orchestratorId);
  if (!orchestrator) throw new DomainError("NOT_FOUND", "Orchestrator was not found");
  const workspace = await repos.workspaces.get(orchestrator.workspaceId);
  if (!workspace) throw new DomainError("NOT_FOUND", "Workspace was not found");
  const project = orchestrator.projectId ? await repos.projects.get(orchestrator.projectId) : null;
  const operation = input.operationId ? await repos.operations.get(input.operationId) : null;
  const task = input.taskId ? await repos.tasks.get(input.taskId) : null;
  if (project && project.workspaceId !== workspace.id) throw new DomainError("INVARIANT", "Project is outside the orchestrator workspace");
  if (operation && operation.workspaceId !== workspace.id) throw new DomainError("INVARIANT", "Operation is outside the orchestrator workspace");
  if (task && (task.workspaceId !== workspace.id || task.operationId !== operation?.id || task.projectId !== project?.id)) {
    throw new DomainError("INVARIANT", "Task is outside the bootstrap operation or project");
  }
  const checkpoint = await repos.checkpoints.latestRelevant(orchestrator.id, operation?.id ?? null, task?.id ?? null);
  const policies = (await repos.policyRules.list())
    .filter((item) => item.scopeType === "global" ||
      (item.scopeType === "workspace" && item.workspaceId === workspace.id) ||
      (item.scopeType === "project" && item.projectId === project?.id))
    .sort((a, b) => {
      const rank = (effect: string) => effect === "deny" ? 0 : effect === "require_approval" ? 1 : 2;
      return rank(a.effect) - rank(b.effect) || a.action.localeCompare(b.action) || a.id.localeCompare(b.id);
    }).slice(0, BOOTSTRAP_POLICY_LIMIT);
  const memories = await repos.memoryItems.search({
    includeSystemGlobal: true,
    ...(input.userId ? { ownerUserId: input.userId } : {}),
    workspaceId: workspace.id,
    ...(project ? { projectId: project.id } : {}),
    ...(operation ? { operationId: operation.id } : {}),
    ...(task ? { taskId: task.id } : {}),
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    limit: BOOTSTRAP_MEMORY_LIMIT,
  });

  return {
    doctrinePath: RUNTIME_DOCTRINE_PATH,
    doctrineText: input.doctrineText,
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
    policies: policies.map((item) => ({ action: item.action, effect: item.effect, scopeType: item.scopeType })),
    memories: memories.map((item) => ({
      id: item.id,
      scopeType: item.scopeType,
      title: item.title,
      body: item.body.slice(0, BOOTSTRAP_MEMORY_BODY_LIMIT),
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
