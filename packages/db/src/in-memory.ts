import { DomainError } from "@kilic/shared";
import { matchesMemoryQuery } from "./memory-query.js";
import type {
  AgentRun,
  ExecutionJob,
  ExecutionDigest,
  EffectGrant,
  RuntimeHandoff,
  DigestIngestion,
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
  const executionJobs = new Map<string, ExecutionJob>();
  const executionDigests = new Map<string, ExecutionDigest>();
  const effectGrants = new Map<string, EffectGrant>();
  const runtimeHandoffs = new Map<string, RuntimeHandoff>();
  const digestIngestions = new Map<string, DigestIngestion>();
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
    executionJobs: Map<string, ExecutionJob>;
    executionDigests: Map<string, ExecutionDigest>;
    effectGrants: Map<string, EffectGrant>;
    runtimeHandoffs: Map<string, RuntimeHandoff>;
    digestIngestions: Map<string, DigestIngestion>;
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
    executionJobs: cloneMap(executionJobs),
    executionDigests: cloneMap(executionDigests),
    effectGrants: cloneMap(effectGrants),
    runtimeHandoffs: cloneMap(runtimeHandoffs),
    digestIngestions: cloneMap(digestIngestions),
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
    restoreMap(executionJobs, snap.executionJobs);
    restoreMap(executionDigests, snap.executionDigests);
    restoreMap(effectGrants, snap.effectGrants);
    restoreMap(runtimeHandoffs, snap.runtimeHandoffs);
    restoreMap(digestIngestions, snap.digestIngestions);
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
      async listByNode(executionNodeId) { return [...repositoryCheckouts.values()].filter((item) => item.executionNodeId === executionNodeId); },
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
      async transition(id, from, to, updatedAt) {
        const current = operations.get(id);
        if (!current || current.status !== from) return false;
        operations.set(id, { ...current, status: to, updatedAt });
        return true;
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
      async transition(id, from, to, updatedAt) {
        const current = tasks.get(id);
        if (!current || current.status !== from) return false;
        tasks.set(id, { ...current, status: to, updatedAt });
        return true;
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
      async transition(id, from, patch) {
        const current = runtimeSessions.get(id);
        if (!current || current.status !== from) return false;
        runtimeSessions.set(id, { ...current, ...patch });
        return true;
      },
      async attachAdapter(id, adapterSessionId, executionEpoch, updatedAt) {
        const current = runtimeSessions.get(id);
        if (!current || current.status !== "starting" || current.adapterSessionId !== null) return false;
        runtimeSessions.set(id, { ...current, adapterSessionId, executionEpoch, updatedAt });
        return true;
      },
      async rearm(id, updatedAt) {
        const current = requireRow(runtimeSessions, id, "Runtime session");
        if (current.status !== "failed" && current.status !== "interrupted") throw new DomainError("INVALID_TRANSITION", "Session is not retryable");
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
      async transition(id, from, to, updatedAt, endedAt) {
        const current = agentRuns.get(id);
        if (!current || current.status !== from) return false;
        agentRuns.set(id, { ...current, status: to, updatedAt, endedAt });
        return true;
      },
      async rearm(id, updatedAt) {
        const current = requireRow(agentRuns, id, "Agent run");
        if (current.status !== "failed") throw new DomainError("INVALID_TRANSITION", "Run is not retryable");
        agentRuns.set(id, { ...current, status: "planned", endedAt: null, updatedAt });
      },
      async attachSession(id, runtimeSessionId, updatedAt) {
        const current = requireRow(agentRuns, id, "Agent run");
        agentRuns.set(id, { ...current, runtimeSessionId, updatedAt });
      },
    },
    executionJobs: {
      async insert(job) {
        const existing = [...executionJobs.values()].find((item) => item.workspaceId === job.workspaceId && item.idempotencyKey === job.idempotencyKey);
        if (existing) {
          if (existing.requestFingerprint !== job.requestFingerprint) throw new DomainError("CONFLICT", "Idempotency key has different request content");
          return existing;
        }
        executionJobs.set(job.id, job);
        return job;
      },
      async get(id) { return executionJobs.get(id) ?? null; },
      async getByIdempotencyKey(workspaceId, key) { return [...executionJobs.values()].find((item) => item.workspaceId === workspaceId && item.idempotencyKey === key) ?? null; },
      async getByRun(runId) { return [...executionJobs.values()].find((item) => item.agentRunId === runId) ?? null; },
      async listByNode(nodeId) { return [...executionJobs.values()].filter((item) => item.executionNodeId === nodeId); },
      async claim(id, nodeId, epoch, leaseUntil, now) {
        const job = executionJobs.get(id);
        if (!job || job.status !== "planned" || job.executionNodeId !== nodeId || executionNodes.get(nodeId)?.bootId !== epoch) return false;
        executionJobs.set(id, { ...job, status: "claimed", claimEpoch: epoch, leaseUntil, updatedAt: now });
        return true;
      },
      async renew(id, nodeId, epoch, leaseUntil, now) {
        const job = executionJobs.get(id);
        if (!job || job.executionNodeId !== nodeId || job.claimEpoch !== epoch || !job.leaseUntil || job.leaseUntil <= now || executionNodes.get(nodeId)?.bootId !== epoch || !["claimed", "bootstrapping", "running", "awaiting_approval"].includes(job.status)) return false;
        executionJobs.set(id, { ...job, leaseUntil, updatedAt: now });
        return true;
      },
      async transition(id, from, to, patch, now) {
        const job = executionJobs.get(id);
        if (!job || job.status !== from) return false;
        executionJobs.set(id, { ...job, ...patch, status: to, updatedAt: now });
        return true;
      },
    },
    executionDigests: {
      async insert(digest) {
        const prior = [...executionDigests.values()].find((item) => item.executionJobId === digest.executionJobId && item.sourceDigest === digest.sourceDigest);
        if (prior) return prior;
        executionDigests.set(digest.id, digest);
        return digest;
      },
      async get(id) { return executionDigests.get(id) ?? null; },
      async getBySource(jobId, sourceDigest) { return [...executionDigests.values()].find((item) => item.executionJobId === jobId && item.sourceDigest === sourceDigest) ?? null; },
    },
    effectGrants: {
      async insert(grant) {
        const prior = [...effectGrants.values()].find((item) => item.executionJobId === grant.executionJobId && item.requestKey === grant.requestKey);
        if (prior) return prior;
        effectGrants.set(grant.id, grant);
        return grant;
      },
      async get(id) { return effectGrants.get(id) ?? null; },
      async getByRequest(jobId, requestKey) { return [...effectGrants.values()].find((item) => item.executionJobId === jobId && item.requestKey === requestKey) ?? null; },
      async consume(id, now) {
        const grant = effectGrants.get(id);
        if (!grant || grant.consumedAt || grant.expiresAt <= now) return false;
        effectGrants.set(id, { ...grant, consumedAt: now });
        return true;
      },
    },
    runtimeHandoffs: {
      async insert(handoff) { runtimeHandoffs.set(handoff.id, handoff); },
      async get(id) { return runtimeHandoffs.get(id) ?? null; },
      async listByNode(nodeId) { return [...runtimeHandoffs.values()].filter((item) => runtimeSessions.get(item.predecessorSessionId)?.executionNodeId === nodeId); },
      async latestForPredecessor(sessionId) { return [...runtimeHandoffs.values()].filter((item) => item.predecessorSessionId === sessionId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null; },
      async findBySuccessor(sessionId) { return [...runtimeHandoffs.values()].find((item) => item.successorSessionId === sessionId) ?? null; },
      async transition(id, from, to, patch, now) {
        const current = runtimeHandoffs.get(id);
        if (!current || current.status !== from) return false;
        runtimeHandoffs.set(id, { ...current, ...patch, status: to, updatedAt: now });
        return true;
      },
    },
    digestIngestions: {
      async enqueue(item) {
        const prior = [...digestIngestions.values()].find((value) => value.executionJobId === item.executionJobId && value.sourceDigest === item.sourceDigest);
        if (prior) return prior;
        digestIngestions.set(item.id, item);
        return item;
      },
      async get(id) { return digestIngestions.get(id) ?? null; },
      async claimDue(now) {
        const item = [...digestIngestions.values()].filter((value) =>
          ((value.status === "pending" || value.status === "retry") && value.nextAttemptAt <= now) ||
          (value.status === "processing" && value.updatedAt.getTime() <= now.getTime() - 5 * 60_000),
        ).sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())[0];
        if (!item) return null;
        const claimed = { ...item, status: "processing" as const, attempts: item.attempts + 1, updatedAt: now };
        digestIngestions.set(item.id, claimed);
        return claimed;
      },
      async complete(id, digestId, attempts, now) {
        const item = requireRow(digestIngestions, id, "Digest ingestion");
        if (item.status !== "processing" || item.attempts !== attempts) throw new DomainError("CONFLICT", "Digest claim changed before completion");
        digestIngestions.set(id, { ...item, status: "completed", digestId, updatedAt: now });
      },
      async retry(id, error, nextAttemptAt, attempts, now) {
        const item = requireRow(digestIngestions, id, "Digest ingestion");
        if (item.status !== "processing" || item.attempts !== attempts) throw new DomainError("CONFLICT", "Digest claim changed before retry");
        digestIngestions.set(id, { ...item, status: "retry", lastError: error, nextAttemptAt, updatedAt: now });
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
        return [...memoryItems.values()].filter((item) => item.status === "active" && matchesMemoryQuery(item, query)).slice(0, query.limit ?? 20);
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
      async latestRelevant(orchestratorId, operationId, taskId) {
        const ranked = [...checkpoints.values()]
          .filter((item) => item.orchestratorId === orchestratorId && (
            (taskId && item.taskId === taskId) ||
            (operationId && item.taskId === null && item.operationId === operationId) ||
            (item.taskId === null && item.operationId === null)
          ))
          .sort((a, b) => {
            const rank = (item: Checkpoint) => item.taskId === taskId && taskId ? 0 : item.operationId === operationId && operationId ? 1 : 2;
            return rank(a) - rank(b) || b.createdAt.getTime() - a.createdAt.getTime();
          });
        return ranked[0] ?? null;
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
      async findEffectRequest(jobId, requestKey) {
        return [...approvals.values()].find((item) => item.payload.executionJobId === jobId && item.payload.requestKey === requestKey) ?? null;
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
      async listByNode(executionNodeId) { return [...worktrees.values()].filter((item) => item.executionNodeId === executionNodeId); },
      async findActiveByRun(agentRunId) { return [...worktrees.values()].find((item) => item.agentRunId === agentRunId && item.status === "active") ?? null; },
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
