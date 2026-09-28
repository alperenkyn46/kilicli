import { DomainError, newId, type Clock } from "@kilic/shared";
import type { Logger } from "@kilic/observability";
import type { RuntimeStatus } from "@kilic/runtime-contract";
import {
  assertConfidence,
  assertNoDependencyCycle,
  assertOperationTransition,
  assertOrchestratorShape,
  assertProjectRelation,
  assertRelationType,
  assertSlug,
  assertTaskTransition,
  buildEvent,
  newCorrelationId,
  optionalLanguage,
  optionalText,
  requireText,
  requireTitle,
  taskStatusAfterDependencies,
  type AccessMode,
  type AgentRun,
  type Approval,
  type ApprovalStatus,
  type Checkpoint,
  type CheckpointState,
  type CheckpointTrigger,
  type ContextHealth,
  type EventDraft,
  type ExecutionNode,
  type ExecutionNodeKind,
  type ExecutionNodeStatus,
  type ExecutionProfile,
  type KnowledgeClass,
  type Operation,
  type OperationStatus,
  type Orchestrator,
  type OrchestratorKind,
  type PolicyEffect,
  type Project,
  type ProjectId,
  type ProjectRelation,
  type Repositories,
  type Repository,
  type RuntimeSession,
  type Task,
  type TaskStatus,
  type User,
  type Workspace,
  type AgentRunId,
  type ApprovalId,
  type ExecutionNodeId,
  type HarnessId,
  type OperationId,
  type OrchestratorId,
  type PolicyRuleId,
  type RepositoryId,
  type RuntimeSessionId,
  type TaskId,
  type UserId,
  type WorkspaceId,
} from "@kilic/domain";
import type { RuntimeStatusProbe } from "./gateway.js";
import { planIsolation } from "./isolation.js";
import { evaluatePolicy } from "./policy.js";
import { selectRoute, type RouteCandidate } from "./routing.js";
import { decideSessionReuse } from "./session-reuse.js";

export type KernelDeps = {
  repos: Repositories;
  runtime: RuntimeStatusProbe;
  clock: Clock;
  logger: Logger;
};

export type DispatchResult =
  | { status: "planned"; run: AgentRun; session: RuntimeSession; route: RouteCandidate }
  | { status: "approval_required"; approval: Approval }
  | { status: "no_route"; reason: "no_matching_policy" | "no_available_harness" };

export type MindPlan =
  | { action: "resume"; reason: null; session: RuntimeSession }
  | { action: "open"; reason: string; session: RuntimeSession; closePreviousSessionId: RuntimeSessionId | null };

export class Kernel {
  constructor(private readonly deps: KernelDeps) {}

  async createUser(input: { displayName: string }): Promise<User> {
    const now = this.deps.clock();
    const user: User = {
      id: newId<"UserId">(),
      displayName: requireText(input.displayName, "displayName"),
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.users.insert(user);
    return user;
  }

  async createWorkspace(input: { name: string; slug: string; ownerUserId: UserId }): Promise<Workspace> {
    await this.mustUser(input.ownerUserId);
    const now = this.deps.clock();
    const workspace: Workspace = {
      id: newId<"WorkspaceId">(),
      name: requireText(input.name, "name"),
      slug: assertSlug(input.slug),
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.workspaces.insert(workspace);
      await repos.memberships.insert({
        workspaceId: workspace.id,
        userId: input.ownerUserId,
        role: "owner",
        createdAt: now,
      });
      await this.emit(repos, {
        type: "workspace.created",
        workspaceId: workspace.id,
        aggregateType: "workspace",
        aggregateId: workspace.id,
        correlationId: newCorrelationId(),
        occurredAt: now,
        payload: { slug: workspace.slug },
      });
    });
    return workspace;
  }

  async registerExecutionNode(input: {
    machineKey: string;
    displayName: string;
    hostname?: string | null;
    kind: ExecutionNodeKind;
    status: ExecutionNodeStatus;
  }): Promise<ExecutionNode> {
    const machineKey = requireText(input.machineKey, "machineKey");
    const now = this.deps.clock();
    const existing = await this.deps.repos.executionNodes.getByMachineKey(machineKey);
    const node: ExecutionNode = {
      id: existing?.id ?? newId<"ExecutionNodeId">(),
      machineKey,
      displayName: requireText(input.displayName, "displayName"),
      hostname: optionalText(input.hostname),
      kind: input.kind,
      status: input.status,
      bootId: existing?.bootId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return this.deps.repos.executionNodes.upsert(node);
  }

  async createProject(input: { workspaceId: WorkspaceId; name: string; slug: string }): Promise<Project> {
    await this.mustWorkspace(input.workspaceId);
    const now = this.deps.clock();
    const project: Project = {
      id: newId<"ProjectId">(),
      workspaceId: input.workspaceId,
      name: requireText(input.name, "name"),
      slug: assertSlug(input.slug),
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.projects.insert(project);
      await this.emit(repos, {
        type: "project.created",
        workspaceId: project.workspaceId,
        projectId: project.id,
        aggregateType: "project",
        aggregateId: project.id,
        correlationId: newCorrelationId(),
        occurredAt: now,
        payload: { slug: project.slug },
      });
    });
    return project;
  }

  async attachRepository(input: {
    projectId: ProjectId;
    name: string;
    defaultBranch: string;
    remoteUrl?: string | null;
  }): Promise<Repository> {
    await this.mustProject(input.projectId);
    const now = this.deps.clock();
    const repository: Repository = {
      id: newId<"RepositoryId">(),
      projectId: input.projectId,
      name: requireText(input.name, "name"),
      defaultBranch: requireText(input.defaultBranch, "defaultBranch"),
      remoteUrl: optionalText(input.remoteUrl),
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.repositories.insert(repository);
    return repository;
  }

  async registerCheckout(input: {
    repositoryId: RepositoryId;
    executionNodeId: ExecutionNodeId;
    localPath: string;
  }): Promise<import("@kilic/domain").RepositoryCheckout> {
    const repository = await this.deps.repos.repositories.get(input.repositoryId);
    if (!repository) throw new DomainError("NOT_FOUND", `Repository ${input.repositoryId} was not found`);
    await this.mustExecutionNode(input.executionNodeId);
    const now = this.deps.clock();
    const checkout = {
      id: newId<"RepositoryCheckoutId">(),
      repositoryId: repository.id,
      executionNodeId: input.executionNodeId,
      localPath: requireText(input.localPath, "localPath"),
      status: "present" as const,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.repositoryCheckouts.insert(checkout);
    return checkout;
  }

  async addProjectRelation(input: {
    workspaceId: WorkspaceId;
    sourceProjectId: ProjectId;
    targetProjectId: ProjectId;
    relationType: string;
    knowledgeClass: KnowledgeClass;
    confidence?: number | null;
  }): Promise<ProjectRelation> {
    const source = await this.mustProject(input.sourceProjectId);
    const target = await this.mustProject(input.targetProjectId);
    if (source.workspaceId !== input.workspaceId || target.workspaceId !== input.workspaceId) {
      throw new DomainError("INVARIANT", "Related projects must belong to the same workspace");
    }
    const relation: ProjectRelation = {
      id: newId<"ProjectRelationId">(),
      workspaceId: input.workspaceId,
      sourceProjectId: input.sourceProjectId,
      targetProjectId: input.targetProjectId,
      relationType: assertRelationType(input.relationType),
      knowledgeClass: input.knowledgeClass,
      confidence: assertConfidence(input.confidence ?? null),
      createdAt: this.deps.clock(),
      updatedAt: this.deps.clock(),
    };
    assertProjectRelation(relation);
    await this.deps.repos.projectRelations.insert(relation);
    return relation;
  }

  async ensureOrchestrator(input: {
    workspaceId: WorkspaceId;
    kind: OrchestratorKind;
    projectId?: ProjectId | null;
    displayName?: string;
  }): Promise<Orchestrator> {
    const projectId = input.projectId ?? null;
    assertOrchestratorShape({ kind: input.kind, projectId });
    await this.mustWorkspace(input.workspaceId);
    if (projectId) {
      const project = await this.mustProject(projectId);
      if (project.workspaceId !== input.workspaceId) {
        throw new DomainError("INVARIANT", "Project orchestrator must stay inside its workspace");
      }
    }

    const existing = await this.deps.repos.orchestrators.findByKind({
      workspaceId: input.workspaceId,
      kind: input.kind,
      projectId,
    });
    if (existing) return existing;

    const now = this.deps.clock();
    const orchestrator: Orchestrator = {
      id: newId<"OrchestratorId">(),
      workspaceId: input.workspaceId,
      projectId,
      kind: input.kind,
      displayName: requireText(
        input.displayName ?? (input.kind === "workspace" ? "Workspace Orchestrator" : "Project Orchestrator"),
        "displayName",
      ),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.orchestrators.insert(orchestrator);
      await this.emit(repos, {
        type: "orchestrator.created",
        workspaceId: orchestrator.workspaceId,
        projectId: orchestrator.projectId,
        aggregateType: "orchestrator",
        aggregateId: orchestrator.id,
        correlationId: newCorrelationId(),
        occurredAt: now,
        payload: { kind: orchestrator.kind },
      });
    });
    return orchestrator;
  }

  async createOperation(input: {
    workspaceId: WorkspaceId;
    title: string;
    description?: string | null;
    language?: string | null;
  }): Promise<Operation> {
    await this.mustWorkspace(input.workspaceId);
    const now = this.deps.clock();
    const operation: Operation = {
      id: newId<"OperationId">(),
      workspaceId: input.workspaceId,
      correlationId: newCorrelationId(),
      title: requireTitle(input.title),
      description: optionalText(input.description),
      language: optionalLanguage(input.language),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.operations.insert(operation);
      await this.emit(repos, {
        type: "operation.created",
        workspaceId: operation.workspaceId,
        aggregateType: "operation",
        aggregateId: operation.id,
        correlationId: operation.correlationId,
        occurredAt: now,
        payload: { title: operation.title, language: operation.language },
      });
    });
    return operation;
  }

  async transitionOperation(id: OperationId, status: OperationStatus): Promise<Operation> {
    const operation = await this.mustOperation(id);
    assertOperationTransition(operation.status, status);
    const now = this.deps.clock();
    await this.deps.repos.transaction(async (repos) => {
      await repos.operations.setStatus(id, status, now);
      await this.emit(repos, {
        type: "operation.status_changed",
        workspaceId: operation.workspaceId,
        aggregateType: "operation",
        aggregateId: operation.id,
        correlationId: operation.correlationId,
        occurredAt: now,
        payload: { from: operation.status, to: status },
      });
    });
    return this.mustOperation(id);
  }

  async createTask(input: {
    operationId: OperationId;
    projectId: ProjectId;
    title: string;
    description?: string | null;
    language?: string | null;
    acceptanceCriteria?: string | null;
  }): Promise<Task> {
    const operation = await this.mustOperation(input.operationId);
    const project = await this.mustProject(input.projectId);
    if (project.workspaceId !== operation.workspaceId) {
      throw new DomainError("INVARIANT", "Task project must belong to the operation workspace");
    }
    const orchestrator = await this.deps.repos.orchestrators.findByKind({
      workspaceId: operation.workspaceId,
      kind: "project",
      projectId: project.id,
    });
    if (!orchestrator) {
      throw new DomainError("NOT_FOUND", "Project orchestrator does not exist for this project");
    }

    const now = this.deps.clock();
    const task: Task = {
      id: newId<"TaskId">(),
      operationId: operation.id,
      projectId: project.id,
      orchestratorId: orchestrator.id,
      workspaceId: operation.workspaceId,
      correlationId: operation.correlationId,
      title: requireTitle(input.title),
      description: optionalText(input.description),
      language: optionalLanguage(input.language),
      acceptanceCriteria: optionalText(input.acceptanceCriteria),
      status: "ready",
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.tasks.insert(task);
      await this.emit(repos, {
        type: "task.created",
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        aggregateType: "task",
        aggregateId: task.id,
        correlationId: task.correlationId,
        occurredAt: now,
        payload: { title: task.title, orchestratorId: task.orchestratorId },
      });
    });
    return task;
  }

  async addTaskDependency(taskId: TaskId, dependsOnTaskId: TaskId): Promise<void> {
    const task = await this.mustTask(taskId);
    const dependency = await this.mustTask(dependsOnTaskId);
    if (task.operationId !== dependency.operationId) {
      throw new DomainError("INVARIANT", "Task dependencies must stay inside one operation");
    }
    const existing = await this.deps.repos.taskDependencies.listAll();
    const operationTaskIds = new Set((await this.deps.repos.tasks.listByOperation(task.operationId)).map((item) => item.id));
    assertNoDependencyCycle(
      existing.filter((edge) => operationTaskIds.has(edge.taskId)),
      { taskId, dependsOnTaskId },
    );
    await this.deps.repos.taskDependencies.insert({
      taskId,
      dependsOnTaskId,
      createdAt: this.deps.clock(),
    });
    if (dependency.status !== "completed" && (task.status === "ready" || task.status === "pending")) {
      await this.transitionTask(taskId, "pending");
    }
  }

  async transitionTask(id: TaskId, status: TaskStatus): Promise<Task> {
    const task = await this.mustTask(id);
    if (task.status === status) return task;
    assertTaskTransition(task.status, status);
    const now = this.deps.clock();
    await this.deps.repos.transaction(async (repos) => {
      await repos.tasks.setStatus(id, status, now);
      await this.emit(repos, {
        type: "task.status_changed",
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        aggregateType: "task",
        aggregateId: task.id,
        correlationId: task.correlationId,
        occurredAt: now,
        payload: { from: task.status, to: status },
      });
    });
    if (status === "completed") await this.promoteDependents(id);
    return this.mustTask(id);
  }

  async evaluateAction(input: {
    action: string;
    workspaceId: WorkspaceId;
    projectId?: ProjectId | null;
  }): Promise<{ effect: PolicyEffect; ruleId: PolicyRuleId | null }> {
    const rules = await this.deps.repos.policyRules.list();
    return evaluatePolicy({
      action: input.action,
      rules,
      context: { workspaceId: input.workspaceId, projectId: input.projectId ?? null },
    });
  }

  async dispatchWorker(input: {
    taskId: TaskId;
    role: string;
    access: AccessMode;
    action: string;
    executionNodeId: ExecutionNodeId;
    baseRef?: string | null;
    profile?: ExecutionProfile | null;
    approvalId?: ApprovalId | null;
  }): Promise<DispatchResult> {
    if (input.access === "none") {
      throw new DomainError("INVARIANT", "A worker dispatch needs read_only or write access");
    }
    const task = await this.mustTask(input.taskId);
    const executionNode = await this.mustExecutionNode(input.executionNodeId);
    const decision = await this.evaluateAction({
      action: input.action,
      workspaceId: task.workspaceId,
      projectId: task.projectId,
    });

    if (decision.effect === "deny") {
      throw new DomainError("FORBIDDEN", `Policy denies ${input.action}`);
    }

    if (decision.effect === "require_approval") {
      if (input.approvalId) {
        const granted = await this.grantedApproval(input.approvalId, input.action, task.id);
        if (!granted) {
          throw new DomainError("FORBIDDEN", "Approval does not grant this action");
        }
      } else {
        const now = this.deps.clock();
        const approval: Approval = {
          id: newId<"ApprovalId">(),
          policyRuleId: decision.ruleId,
          action: input.action,
          status: "pending",
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          operationId: task.operationId,
          taskId: task.id,
          requestedByRunId: null,
          correlationId: task.correlationId,
          payload: { role: input.role, access: input.access, executionNodeId: executionNode.id },
          createdAt: now,
          decidedAt: null,
        };
        await this.deps.repos.transaction(async (repos) => {
          await repos.approvals.insert(approval);
          await this.emit(repos, {
            type: "workforce.approval_required",
            workspaceId: task.workspaceId,
            projectId: task.projectId,
            aggregateType: "approval",
            aggregateId: approval.id,
            correlationId: task.correlationId,
            occurredAt: now,
            payload: { action: input.action, taskId: task.id },
          });
        });
        return { status: "approval_required", approval };
      }
    }

    const route = await this.chooseRoute({
      role: requireText(input.role, "role"),
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      operationId: task.operationId,
      profile: input.profile ?? null,
    });
    if (!route.ok) return { status: "no_route", reason: route.reason };

    const now = this.deps.clock();
    const runId = newId<"AgentRunId">();
    const baseRef = optionalText(input.baseRef);
    if (input.access === "write" && !baseRef) {
      throw new DomainError("INVALID_TEXT", "baseRef is required for a write-capable worker");
    }
    const session: RuntimeSession = {
      id: newId<"RuntimeSessionId">(),
      orchestratorId: task.orchestratorId,
      executionNodeId: executionNode.id,
      harnessId: route.candidate.harnessId,
      modelId: route.candidate.modelId,
      purpose: "worker",
      status: "starting",
      adapterSessionId: null,
      executionEpoch: null,
      closeReason: null,
      correlationId: task.correlationId,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const run: AgentRun = {
      id: runId,
      runtimeSessionId: session.id,
      orchestratorId: task.orchestratorId,
      taskId: task.id,
      parentRunId: null,
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      operationId: task.operationId,
      correlationId: task.correlationId,
      kind: "worker",
      role: input.role.trim(),
      access: input.access,
      status: "planned",
      isolation: planIsolation({
        access: input.access,
        taskId: task.id,
        runId,
        baseRef: baseRef ?? "HEAD",
      }),
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.repos.transaction(async (repos) => {
      await repos.runtimeSessions.insert(session);
      await repos.agentRuns.insert(run);
      await this.emit(repos, {
        type: "workforce.dispatch_planned",
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        aggregateType: "agent_run",
        aggregateId: run.id,
        correlationId: task.correlationId,
        agentRunId: run.id,
        runtimeSessionId: session.id,
        occurredAt: now,
        payload: {
          role: run.role,
          access: run.access,
          harnessKey: route.candidate.harnessKey,
          modelKey: route.candidate.modelKey,
          isolation: run.isolation,
        },
      });
    });

    return { status: "planned", run, session, route: route.candidate };
  }

  async planMindSession(input: {
    orchestratorId: OrchestratorId;
    executionNodeId: ExecutionNodeId;
    contextHealth: ContextHealth;
    explicitSwitch: boolean;
    operationId?: OperationId | null;
    role?: string;
    profile?: ExecutionProfile | null;
  }): Promise<MindPlan> {
    const orchestrator = await this.mustOrchestrator(input.orchestratorId);
    if (orchestrator.status !== "active") {
      throw new DomainError("INVARIANT", "Only an active orchestrator can open a mind session");
    }
    const node = await this.mustExecutionNode(input.executionNodeId);
    const operation = input.operationId ? await this.mustOperation(input.operationId) : null;
    if (operation && operation.workspaceId !== orchestrator.workspaceId) {
      throw new DomainError("INVARIANT", "Operation is outside the orchestrator workspace");
    }
    const role = input.role?.trim() || "orchestrator";
    const route = await this.chooseRoute({
      role,
      workspaceId: orchestrator.workspaceId,
      projectId: orchestrator.projectId,
      operationId: operation?.id ?? null,
      profile: input.profile ?? null,
    });
    const existing = await this.deps.repos.runtimeSessions.latestForOrchestrator(orchestrator.id, "orchestrator_mind");
    const selected = route.ok ? { harnessId: route.candidate.harnessId, modelId: route.candidate.modelId } : null;
    const harnessStatus = route.ok ? await this.deps.runtime.status(route.candidate.harnessKey) : null;
    const decision = decideSessionReuse({
      session: existing,
      nodeBootId: node.bootId,
      selected,
      harnessStatus,
      contextHealth: input.contextHealth,
      explicitSwitch: input.explicitSwitch,
    });
    if (decision.action === "reuse") {
      if (!existing) throw new DomainError("INVARIANT", "Session reuse requires an existing session");
      const now = this.deps.clock();
      await this.emit(this.deps.repos, {
        type: "runtime_session.resume_requested",
        workspaceId: orchestrator.workspaceId,
        projectId: orchestrator.projectId,
        aggregateType: "runtime_session",
        aggregateId: existing.id,
        correlationId: existing.correlationId,
        runtimeSessionId: existing.id,
        occurredAt: now,
        payload: {},
      });
      return { action: "resume", reason: null, session: existing };
    }
    if (!route.ok || !selected) {
      throw new DomainError("NO_ROUTE", `No available runtime for role ${role}`);
    }
    const now = this.deps.clock();
    const session: RuntimeSession = {
      id: newId<"RuntimeSessionId">(),
      orchestratorId: orchestrator.id,
      executionNodeId: node.id,
      harnessId: route.candidate.harnessId,
      modelId: route.candidate.modelId,
      purpose: "orchestrator_mind",
      status: "starting",
      adapterSessionId: null,
      executionEpoch: null,
      closeReason: null,
      correlationId: operation?.correlationId ?? newCorrelationId(),
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.runtimeSessions.insert(session);
      await this.emit(repos, {
        type: "runtime_session.planned",
        workspaceId: orchestrator.workspaceId,
        projectId: orchestrator.projectId,
        aggregateType: "runtime_session",
        aggregateId: session.id,
        correlationId: session.correlationId,
        runtimeSessionId: session.id,
        occurredAt: now,
        payload: { reason: decision.reason, harnessKey: route.candidate.harnessKey },
      });
    });
    const previous = existing && (existing.status === "active" || existing.status === "starting") ? existing.id : null;
    return { action: "open", reason: decision.reason, session, closePreviousSessionId: previous };
  }

  async recordCheckpoint(input: {
    orchestratorId: OrchestratorId;
    runtimeSessionId?: RuntimeSessionId | null;
    operationId?: OperationId | null;
    taskId?: TaskId | null;
    trigger: CheckpointTrigger;
    state: CheckpointState;
  }): Promise<Checkpoint> {
    const orchestrator = await this.mustOrchestrator(input.orchestratorId);
    const operation = input.operationId ? await this.mustOperation(input.operationId) : null;
    const task = input.taskId ? await this.mustTask(input.taskId) : null;
    const session = input.runtimeSessionId ? await this.mustSession(input.runtimeSessionId) : null;
    if (operation && operation.workspaceId !== orchestrator.workspaceId) {
      throw new DomainError("INVARIANT", "Checkpoint operation is outside the orchestrator workspace");
    }
    if (task && operation && task.operationId !== operation.id) {
      throw new DomainError("INVARIANT", "Checkpoint task is outside the operation");
    }
    if (task && task.workspaceId !== orchestrator.workspaceId) {
      throw new DomainError("INVARIANT", "Checkpoint task is outside the orchestrator workspace");
    }
    if (orchestrator.kind === "project" && task && task.projectId !== orchestrator.projectId) {
      throw new DomainError("INVARIANT", "Project orchestrator checkpoint cannot reference another project");
    }
    if (orchestrator.kind === "workspace" && task && task.projectId && orchestrator.projectId) {
      throw new DomainError("INVARIANT", "Workspace orchestrator checkpoint cannot be bound to a project");
    }
    if (session && session.orchestratorId !== orchestrator.id) {
      throw new DomainError("INVARIANT", "Checkpoint session belongs to another orchestrator");
    }
    assertCheckpointState(input.state);
    const now = this.deps.clock();
    const checkpoint: Checkpoint = {
      id: newId<"CheckpointId">(),
      orchestratorId: orchestrator.id,
      workspaceId: orchestrator.workspaceId,
      runtimeSessionId: session?.id ?? null,
      operationId: operation?.id ?? null,
      taskId: task?.id ?? null,
      correlationId: operation?.correlationId ?? task?.correlationId ?? newCorrelationId(),
      trigger: input.trigger,
      state: input.state,
      createdAt: now,
    };
    await this.deps.repos.transaction(async (repos) => {
      await repos.checkpoints.insert(checkpoint);
      await this.emit(repos, {
        type: "checkpoint.created",
        workspaceId: orchestrator.workspaceId,
        projectId: orchestrator.projectId,
        aggregateType: "checkpoint",
        aggregateId: checkpoint.id,
        correlationId: checkpoint.correlationId,
        runtimeSessionId: checkpoint.runtimeSessionId,
        occurredAt: now,
        payload: { trigger: checkpoint.trigger },
      });
    });
    return checkpoint;
  }

  async decideApproval(id: ApprovalId, status: Exclude<ApprovalStatus, "pending">): Promise<Approval> {
    const approval = await this.mustApproval(id);
    if (approval.status !== "pending") {
      throw new DomainError("INVALID_TRANSITION", "Only a pending approval can be decided");
    }
    const now = this.deps.clock();
    await this.deps.repos.transaction(async (repos) => {
      await repos.approvals.decide(id, status, now);
      await this.emit(repos, {
        type: "approval.decided",
        workspaceId: approval.workspaceId,
        projectId: approval.projectId,
        aggregateType: "approval",
        aggregateId: approval.id,
        correlationId: approval.correlationId,
        occurredAt: now,
        payload: { status, action: approval.action },
      });
    });
    return this.mustApproval(id);
  }

  private async chooseRoute(input: {
    role: string;
    workspaceId: WorkspaceId;
    projectId: ProjectId | null;
    operationId: OperationId | null;
    profile: ExecutionProfile | null;
  }) {
    const [policies, routes, harnesses, models] = await Promise.all([
      this.deps.repos.routingPolicies.listEnabled(),
      this.deps.repos.roleRoutes.list(),
      this.deps.repos.harnesses.list(),
      this.deps.repos.models.list(),
    ]);
    const statusByHarnessKey: Record<string, RuntimeStatus> = {};
    for (const harness of harnesses) {
      statusByHarnessKey[harness.key] = await this.deps.runtime.status(harness.key);
    }
    return selectRoute({
      role: input.role,
      context: input,
      policies,
      routes,
      harnesses,
      models,
      statusByHarnessKey,
    });
  }

  private async grantedApproval(approvalId: ApprovalId, action: string, taskId: TaskId): Promise<boolean> {
    const approval = await this.mustApproval(approvalId);
    return approval.status === "approved" && approval.action === action && approval.taskId === taskId;
  }

  private async promoteDependents(completedTaskId: TaskId): Promise<void> {
    const dependents = await this.deps.repos.taskDependencies.listDependents(completedTaskId);
    for (const edge of dependents) {
      const dependent = await this.mustTask(edge.taskId);
      const dependencies = await this.deps.repos.taskDependencies.listDependencies(dependent.id);
      const statuses: TaskStatus[] = [];
      for (const dependency of dependencies) {
        statuses.push((await this.mustTask(dependency.dependsOnTaskId)).status);
      }
      const next = taskStatusAfterDependencies({ status: dependent.status, dependencyStatuses: statuses });
      if (next !== dependent.status) await this.transitionTask(dependent.id, next);
    }
  }

  private async emit(repos: Repositories, draft: EventDraft): Promise<void> {
    await repos.events.append(buildEvent(draft));
  }

  private async mustUser(id: UserId): Promise<User> {
    const user = await this.deps.repos.users.get(id);
    if (!user) throw new DomainError("NOT_FOUND", `User ${id} was not found`);
    return user;
  }

  private async mustWorkspace(id: WorkspaceId): Promise<Workspace> {
    const workspace = await this.deps.repos.workspaces.get(id);
    if (!workspace) throw new DomainError("NOT_FOUND", `Workspace ${id} was not found`);
    return workspace;
  }

  private async mustProject(id: ProjectId): Promise<Project> {
    const project = await this.deps.repos.projects.get(id);
    if (!project) throw new DomainError("NOT_FOUND", `Project ${id} was not found`);
    return project;
  }

  private async mustOperation(id: OperationId): Promise<Operation> {
    const operation = await this.deps.repos.operations.get(id);
    if (!operation) throw new DomainError("NOT_FOUND", `Operation ${id} was not found`);
    return operation;
  }

  private async mustTask(id: TaskId): Promise<Task> {
    const task = await this.deps.repos.tasks.get(id);
    if (!task) throw new DomainError("NOT_FOUND", `Task ${id} was not found`);
    return task;
  }

  private async mustOrchestrator(id: OrchestratorId): Promise<Orchestrator> {
    const orchestrator = await this.deps.repos.orchestrators.get(id);
    if (!orchestrator) throw new DomainError("NOT_FOUND", `Orchestrator ${id} was not found`);
    return orchestrator;
  }

  private async mustSession(id: RuntimeSessionId): Promise<RuntimeSession> {
    const session = await this.deps.repos.runtimeSessions.get(id);
    if (!session) throw new DomainError("NOT_FOUND", `Runtime session ${id} was not found`);
    return session;
  }

  private async mustRun(id: AgentRunId): Promise<AgentRun> {
    const run = await this.deps.repos.agentRuns.get(id);
    if (!run) throw new DomainError("NOT_FOUND", `Agent run ${id} was not found`);
    return run;
  }

  private async mustExecutionNode(id: ExecutionNodeId): Promise<ExecutionNode> {
    const node = await this.deps.repos.executionNodes.get(id);
    if (!node) throw new DomainError("NOT_FOUND", `Execution node ${id} was not found`);
    return node;
  }

  private async mustHarness(id: HarnessId) {
    const harness = await this.deps.repos.harnesses.get(id);
    if (!harness) throw new DomainError("NOT_FOUND", `Harness ${id} was not found`);
    return harness;
  }

  private async mustApproval(id: ApprovalId): Promise<Approval> {
    const approval = await this.deps.repos.approvals.get(id);
    if (!approval) throw new DomainError("NOT_FOUND", `Approval ${id} was not found`);
    return approval;
  }
}

function assertCheckpointState(state: CheckpointState): void {
  const lists = [state.completed, state.remaining, state.importantFiles, state.risks];
  for (const list of lists) {
    if (!Array.isArray(list) || list.some((item) => typeof item !== "string")) {
      throw new DomainError("INVALID_CHECKPOINT", "Checkpoint lists must contain strings");
    }
  }
}
