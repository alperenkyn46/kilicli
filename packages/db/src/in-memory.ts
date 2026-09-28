import { DomainError } from "@kilic/shared";
import { matchesMemoryQuery } from "./memory-query.js";
import type {
  AgentRun,
  Approval,
  Artifact,
  Checkpoint,
  Decision,
  ExecutionNode,
  Finding,
  Harness,
  KilicEvent,
  MemoryItem,
  Model,
  Operation,
  Orchestrator,
  PolicyRule,
  Project,
  ProjectRelation,
  Repositories,
  Repository,
  RepositoryCheckout,
  RoleRoute,
  RoutingPolicy,
  RuntimeSession,
  Task,
  TaskDependency,
  User,
  UserId,
  Workspace,
  WorkspaceId,
  Worktree,
} from "@kilic/domain";

export function createInMemoryRepositories(): Repositories {
  const users = new Map<string, User>();
  const workspaces = new Map<string, Workspace>();
  const memberships = new Map<string, { workspaceId: WorkspaceId; userId: UserId; role: "owner" | "member"; createdAt: Date }>();
  const executionNodes = new Map<string, ExecutionNode>();
  const projects = new Map<string, Project>();
  const repositories = new Map<string, Repository>();
  const repositoryCheckouts = new Map<string, RepositoryCheckout>();
  const projectRelations = new Map<string, ProjectRelation>();
  const orchestrators = new Map<string, Orchestrator>();
  const operations = new Map<string, Operation>();
  const tasks = new Map<string, Task>();
  const taskDependencies: TaskDependency[] = [];
  const harnesses = new Map<string, Harness>();
  const models = new Map<string, Model>();
  const routingPolicies = new Map<string, RoutingPolicy>();
  const roleRoutes = new Map<string, RoleRoute>();
  const runtimeSessions = new Map<string, RuntimeSession>();
  const agentRuns = new Map<string, AgentRun>();
  const memoryItems = new Map<string, MemoryItem>();
  const decisions = new Map<string, Decision>();
  const findings = new Map<string, Finding>();
  const checkpoints = new Map<string, Checkpoint>();
  const events = new Map<string, KilicEvent>();
  const artifacts = new Map<string, Artifact>();
  const policyRules = new Map<string, PolicyRule>();
  const approvals = new Map<string, Approval>();
  const worktrees = new Map<string, Worktree>();

  const txn: Array<{
    users: Map<string, User>;
    workspaces: Map<string, Workspace>;
    memberships: Map<string, { workspaceId: WorkspaceId; userId: UserId; role: "owner" | "member"; createdAt: Date }>;
    executionNodes: Map<string, ExecutionNode>;
    projects: Map<string, Project>;
    repositories: Map<string, Repository>;
    repositoryCheckouts: Map<string, RepositoryCheckout>;
    projectRelations: Map<string, ProjectRelation>;
    orchestrators: Map<string, Orchestrator>;
    operations: Map<string, Operation>;
    tasks: Map<string, Task>;
    taskDependencies: TaskDependency[];
    harnesses: Map<string, Harness>;
    models: Map<string, Model>;
    routingPolicies: Map<string, RoutingPolicy>;
    roleRoutes: Map<string, RoleRoute>;
    runtimeSessions: Map<string, RuntimeSession>;
    agentRuns: Map<string, AgentRun>;
    memoryItems: Map<string, MemoryItem>;
    decisions: Map<string, Decision>;
    findings: Map<string, Finding>;
    checkpoints: Map<string, Checkpoint>;
    events: Map<string, KilicEvent>;
    artifacts: Map<string, Artifact>;
    policyRules: Map<string, PolicyRule>;
    approvals: Map<string, Approval>;
    worktrees: Map<string, Worktree>;
  }> = [];

  const cloneMap = <T>(map: Map<string, T>) => new Map([...map].map(([key, value]) => [key, structuredClone(value)]));
  const takeSnapshot = () => ({
    users: cloneMap(users),
    workspaces: cloneMap(workspaces),
    memberships: cloneMap(memberships),
    executionNodes: cloneMap(executionNodes),
    projects: cloneMap(projects),
    repositories: cloneMap(repositories),
    repositoryCheckouts: cloneMap(repositoryCheckouts),
    projectRelations: cloneMap(projectRelations),
    orchestrators: cloneMap(orchestrators),
    operations: cloneMap(operations),
    tasks: cloneMap(tasks),
    taskDependencies: structuredClone(taskDependencies),
    harnesses: cloneMap(harnesses),
    models: cloneMap(models),
    routingPolicies: cloneMap(routingPolicies),
    roleRoutes: cloneMap(roleRoutes),
    runtimeSessions: cloneMap(runtimeSessions),
    agentRuns: cloneMap(agentRuns),
    memoryItems: cloneMap(memoryItems),
    decisions: cloneMap(decisions),
    findings: cloneMap(findings),
    checkpoints: cloneMap(checkpoints),
    events: cloneMap(events),
    artifacts: cloneMap(artifacts),
    policyRules: cloneMap(policyRules),
    approvals: cloneMap(approvals),
    worktrees: cloneMap(worktrees),
  });
  const restoreMap = <T>(target: Map<string, T>, source: Map<string, T>) => {
    target.clear();
    for (const [key, value] of source) target.set(key, value);
  };
  const restore = (snap: ReturnType<typeof takeSnapshot>) => {
    restoreMap(users, snap.users);
    restoreMap(workspaces, snap.workspaces);
    restoreMap(memberships, snap.memberships);
    restoreMap(executionNodes, snap.executionNodes);
    restoreMap(projects, snap.projects);
    restoreMap(repositories, snap.repositories);
    restoreMap(repositoryCheckouts, snap.repositoryCheckouts);
    restoreMap(projectRelations, snap.projectRelations);
    restoreMap(orchestrators, snap.orchestrators);
    restoreMap(operations, snap.operations);
    restoreMap(tasks, snap.tasks);
    taskDependencies.splice(0, taskDependencies.length, ...snap.taskDependencies);
    restoreMap(harnesses, snap.harnesses);
    restoreMap(models, snap.models);
    restoreMap(routingPolicies, snap.routingPolicies);
    restoreMap(roleRoutes, snap.roleRoutes);
    restoreMap(runtimeSessions, snap.runtimeSessions);
    restoreMap(agentRuns, snap.agentRuns);
    restoreMap(memoryItems, snap.memoryItems);
    restoreMap(decisions, snap.decisions);
    restoreMap(findings, snap.findings);
    restoreMap(checkpoints, snap.checkpoints);
    restoreMap(events, snap.events);
    restoreMap(artifacts, snap.artifacts);
    restoreMap(policyRules, snap.policyRules);
    restoreMap(approvals, snap.approvals);
    restoreMap(worktrees, snap.worktrees);
  };

  const requireRow = <T>(map: Map<string, T>, id: string, label: string): T => {
    const row = map.get(id);
    if (!row) throw new DomainError("NOT_FOUND", `${label} ${id} was not found`);
    return row;
  };

  const repos: Repositories = {
    async transaction(work) {
      const snap = takeSnapshot();
      txn.push(snap);
      try {
        const result = await work(repos);
        txn.pop();
        return result;
      } catch (error) {
        const saved = txn.pop();
        if (saved) restore(saved);
        throw error;
      }
    },
    users: {
      async insert(user) {
        if (users.has(user.id)) throw new DomainError("CONFLICT", "User already exists");
        users.set(user.id, user);
      },
      async get(id) {
        return users.get(id) ?? null;
      },
    },
    workspaces: {
      async insert(workspace) {
        if (workspaces.has(workspace.id)) throw new DomainError("CONFLICT", "Workspace already exists");
        workspaces.set(workspace.id, workspace);
      },
      async get(id) {
        return workspaces.get(id) ?? null;
      },
    },
    memberships: {
      async insert(member) {
        const key = `${member.workspaceId}:${member.userId}`;
        if (memberships.has(key)) throw new DomainError("CONFLICT", "Membership already exists");
        memberships.set(key, member);
      },
      async get(workspaceId, userId) {
        return memberships.get(`${workspaceId}:${userId}`) ?? null;
      },
    },
    executionNodes: {
      async upsert(node) {
        const existing = [...executionNodes.values()].find((item) => item.machineKey === node.machineKey);
        if (existing && existing.id !== node.id) throw new DomainError("CONFLICT", "Machine key already exists");
        executionNodes.set(node.id, node);
        return node;
      },
      async get(id) {
        return executionNodes.get(id) ?? null;
      },
      async getByMachineKey(machineKey) {
        return [...executionNodes.values()].find((node) => node.machineKey === machineKey) ?? null;
      },
      async setBoot(id, bootId, updatedAt) {
        const current = requireRow(executionNodes, id, "Execution node");
        executionNodes.set(id, { ...current, bootId, updatedAt });
      },
    },
    projects: {
      async insert(project) {
        const duplicate = [...projects.values()].find(
          (item) => item.workspaceId === project.workspaceId && item.slug === project.slug,
        );
        if (duplicate) throw new DomainError("CONFLICT", "Project slug already exists in the workspace");
        projects.set(project.id, project);
      },
      async get(id) {
        return projects.get(id) ?? null;
      },
      async listByWorkspace(workspaceId) {
        return [...projects.values()].filter((project) => project.workspaceId === workspaceId);
      },
    },
    repositories: {
      async insert(repository) {
        repositories.set(repository.id, repository);
      },
      async get(id) {
        return repositories.get(id) ?? null;
      },
      async listByProject(projectId) {
        return [...repositories.values()].filter((repository) => repository.projectId === projectId);
      },
    },
    repositoryCheckouts: {
      async insert(checkout) {
        const duplicate = [...repositoryCheckouts.values()].find(
          (item) => item.repositoryId === checkout.repositoryId && item.executionNodeId === checkout.executionNodeId,
        );
        if (duplicate) throw new DomainError("CONFLICT", "Checkout already exists for this node");
        repositoryCheckouts.set(checkout.id, checkout);
      },
      async get(id) {
        return repositoryCheckouts.get(id) ?? null;
      },
      async find(repositoryId, executionNodeId) {
        return (
          [...repositoryCheckouts.values()].find(
            (item) => item.repositoryId === repositoryId && item.executionNodeId === executionNodeId,
          ) ?? null
        );
      },
    },
    projectRelations: {
      async insert(relation) {
        projectRelations.set(relation.id, relation);
      },
      async listByWorkspace(workspaceId) {
        return [...projectRelations.values()].filter((relation) => relation.workspaceId === workspaceId);
      },
      async get(id) {
        return projectRelations.get(id) ?? null;
      },
    },
    orchestrators: {
      async insert(orchestrator) {
        const duplicate = [...orchestrators.values()].find((item) =>
          orchestrator.kind === "workspace"
            ? item.kind === "workspace" && item.workspaceId === orchestrator.workspaceId
            : item.kind === "project" && item.projectId === orchestrator.projectId,
        );
        if (duplicate) throw new DomainError("CONFLICT", "Orchestrator already exists for this scope");
        orchestrators.set(orchestrator.id, orchestrator);
      },
      async get(id) {
        return orchestrators.get(id) ?? null;
      },
      async findByKind(input) {
        return (
          [...orchestrators.values()].find((item) =>
            input.kind === "workspace"
              ? item.kind === "workspace" && item.workspaceId === input.workspaceId
              : item.kind === "project" && item.projectId === input.projectId,
          ) ?? null
        );
      },
      async setStatus(id, status, updatedAt) {
        const current = requireRow(orchestrators, id, "Orchestrator");
        orchestrators.set(id, { ...current, status, updatedAt });
      },
    },
    operations: {
      async insert(operation) {
        operations.set(operation.id, operation);
      },
      async get(id) {
        return operations.get(id) ?? null;
      },
      async setStatus(id, status, updatedAt) {
        const current = requireRow(operations, id, "Operation");
        operations.set(id, { ...current, status, updatedAt });
      },
    },
    tasks: {
      async insert(task) {
        tasks.set(task.id, task);
      },
      async get(id) {
        return tasks.get(id) ?? null;
      },
      async listByOperation(operationId) {
        return [...tasks.values()].filter((task) => task.operationId === operationId);
      },
      async setStatus(id, status, updatedAt) {
        const current = requireRow(tasks, id, "Task");
        tasks.set(id, { ...current, status, updatedAt });
      },
    },
    taskDependencies: {
      async insert(dependency) {
        const exists = taskDependencies.some(
          (item) => item.taskId === dependency.taskId && item.dependsOnTaskId === dependency.dependsOnTaskId,
        );
        if (exists) throw new DomainError("CONFLICT", "Task dependency already exists");
        taskDependencies.push(dependency);
      },
      async listAll() {
        return [...taskDependencies];
      },
      async listDependencies(taskId) {
        return taskDependencies.filter((item) => item.taskId === taskId);
      },
      async listDependents(taskId) {
        return taskDependencies.filter((item) => item.dependsOnTaskId === taskId);
      },
    },
    harnesses: {
      async insert(harness) {
        if ([...harnesses.values()].some((item) => item.key === harness.key)) {
          throw new DomainError("CONFLICT", "Harness key already exists");
        }
        harnesses.set(harness.id, harness);
      },
      async get(id) {
        return harnesses.get(id) ?? null;
      },
      async getByKey(key) {
        return [...harnesses.values()].find((item) => item.key === key) ?? null;
      },
      async list() {
        return [...harnesses.values()];
      },
    },
    models: {
      async insert(model) {
        if ([...models.values()].some((item) => item.harnessId === model.harnessId && item.key === model.key)) {
          throw new DomainError("CONFLICT", "Model key already exists for this harness");
        }
        models.set(model.id, model);
      },
      async get(id) {
        return models.get(id) ?? null;
      },
      async findByHarnessAndKey(harnessId, key) {
        return [...models.values()].find((item) => item.harnessId === harnessId && item.key === key) ?? null;
      },
      async list() {
        return [...models.values()];
      },
    },
    routingPolicies: {
      async insert(policy) {
        routingPolicies.set(policy.id, policy);
      },
      async listEnabled() {
        return [...routingPolicies.values()].filter((policy) => policy.enabled);
      },
      async get(id) {
        return routingPolicies.get(id) ?? null;
      },
    },
    roleRoutes: {
      async insert(route) {
        roleRoutes.set(route.id, route);
      },
      async list() {
        return [...roleRoutes.values()];
      },
      async get(id) {
        return roleRoutes.get(id) ?? null;
      },
    },
    runtimeSessions: {
      async insert(session) {
        runtimeSessions.set(session.id, session);
      },
      async get(id) {
        return runtimeSessions.get(id) ?? null;
      },
      async latestForOrchestrator(orchestratorId, purpose) {
        return (
          [...runtimeSessions.values()]
            .filter((session) => session.orchestratorId === orchestratorId && session.purpose === purpose)
            .sort(
              (left, right) =>
                right.startedAt.getTime() - left.startedAt.getTime() ||
                right.createdAt.getTime() - left.createdAt.getTime(),
            )[0] ?? null
        );
      },
      async listByNode(executionNodeId) {
        return [...runtimeSessions.values()].filter((session) => session.executionNodeId === executionNodeId);
      },
      async setStatus(id, patch) {
        const current = requireRow(runtimeSessions, id, "Runtime session");
        runtimeSessions.set(id, { ...current, ...patch });
      },
      async attachAdapter(id, adapterSessionId, executionEpoch, updatedAt) {
        const current = requireRow(runtimeSessions, id, "Runtime session");
        runtimeSessions.set(id, { ...current, adapterSessionId, executionEpoch, updatedAt });
      },
      async rearm(id, updatedAt) {
        const current = requireRow(runtimeSessions, id, "Runtime session");
        runtimeSessions.set(id, {
          ...current,
          status: "starting",
          adapterSessionId: null,
          executionEpoch: null,
          closeReason: null,
          endedAt: null,
          updatedAt,
        });
      },
    },
    agentRuns: {
      async insert(run) {
        agentRuns.set(run.id, run);
      },
      async get(id) {
        return agentRuns.get(id) ?? null;
      },
      async listBySession(sessionId) {
        return [...agentRuns.values()].filter((run) => run.runtimeSessionId === sessionId);
      },
      async setStatus(id, status, updatedAt, endedAt) {
        const current = requireRow(agentRuns, id, "Agent run");
        agentRuns.set(id, { ...current, status, updatedAt, endedAt });
      },
      async rearm(id, updatedAt) {
        const current = requireRow(agentRuns, id, "Agent run");
        agentRuns.set(id, { ...current, status: "planned", endedAt: null, updatedAt });
      },
      async attachSession(id, runtimeSessionId, updatedAt) {
        const current = requireRow(agentRuns, id, "Agent run");
        agentRuns.set(id, { ...current, runtimeSessionId, updatedAt });
      },
    },
    memoryItems: {
      async insert(item) {
        memoryItems.set(item.id, item);
      },
      async get(id) {
        return memoryItems.get(id) ?? null;
      },
      async search(query) {
        return [...memoryItems.values()].filter((item) => item.status === "active" && matchesMemoryQuery(item, query));
      },
      async setStatus(id, status, supersededById, updatedAt) {
        const current = requireRow(memoryItems, id, "Memory item");
        memoryItems.set(id, { ...current, status, supersededById, updatedAt });
      },
    },
    decisions: {
      async insert(decision) {
        decisions.set(decision.id, decision);
      },
      async get(id) {
        return decisions.get(id) ?? null;
      },
      async markSuperseded(id, updatedAt) {
        const current = requireRow(decisions, id, "Decision");
        decisions.set(id, { ...current, status: "superseded", updatedAt });
      },
    },
    findings: {
      async insert(finding) {
        findings.set(finding.id, finding);
      },
      async get(id) {
        return findings.get(id) ?? null;
      },
    },
    checkpoints: {
      async insert(checkpoint) {
        checkpoints.set(checkpoint.id, checkpoint);
      },
      async get(id) {
        return checkpoints.get(id) ?? null;
      },
      async latestForOrchestrator(orchestratorId) {
        return (
          [...checkpoints.values()]
            .filter((checkpoint) => checkpoint.orchestratorId === orchestratorId)
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
        );
      },
    },
    events: {
      async append(event) {
        if (events.has(event.id)) throw new DomainError("CONFLICT", "Event already exists");
        events.set(event.id, event);
      },
      async get(id) {
        return events.get(id) ?? null;
      },
      async listByCorrelation(correlationId) {
        return sortEvents([...events.values()].filter((event) => event.correlationId === correlationId));
      },
      async listByAggregate(aggregateType, aggregateId) {
        return sortEvents(
          [...events.values()].filter((event) => event.aggregateType === aggregateType && event.aggregateId === aggregateId),
        );
      },
    },
    artifacts: {
      async insert(artifact) {
        artifacts.set(artifact.id, artifact);
      },
      async get(id) {
        return artifacts.get(id) ?? null;
      },
    },
    policyRules: {
      async insert(rule) {
        policyRules.set(rule.id, rule);
      },
      async list() {
        return [...policyRules.values()];
      },
      async findGlobal(action) {
        return [...policyRules.values()].find((rule) => rule.scopeType === "global" && rule.action === action) ?? null;
      },
      async get(id) {
        return policyRules.get(id) ?? null;
      },
    },
    approvals: {
      async insert(approval) {
        approvals.set(approval.id, approval);
      },
      async get(id) {
        return approvals.get(id) ?? null;
      },
      async decide(id, status, decidedAt) {
        const current = requireRow(approvals, id, "Approval");
        approvals.set(id, { ...current, status, decidedAt });
      },
    },
    worktrees: {
      async insert(worktree) {
        worktrees.set(worktree.id, worktree);
      },
      async get(id) {
        return worktrees.get(id) ?? null;
      },
      async markRemoved(id, removedAt) {
        const current = requireRow(worktrees, id, "Worktree");
        worktrees.set(id, { ...current, status: "removed", removedAt });
      },
    },
  };

  return repos;
}

function sortEvents(items: KilicEvent[]): KilicEvent[] {
  return items.sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id),
  );
}
