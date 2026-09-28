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
  Repository,
  RepositoryCheckout,
  RoleRoute,
  RoutingPolicy,
  RuntimeSession,
  Task,
  TaskDependency,
  User,
  Workspace,
  WorkspaceMember,
  Worktree,
} from "./entities.js";
import type {
  AgentRunId,
  ExecutionJobId,
  ExecutionDigestId,
  EffectGrantId,
  RuntimeHandoffId,
  DigestIngestionId,
  ApprovalId,
  ArtifactId,
  CheckpointId,
  CorrelationId,
  DecisionId,
  EventId,
  ExecutionNodeId,
  FindingId,
  HarnessId,
  MemoryItemId,
  ModelId,
  OperationId,
  OrchestratorId,
  PolicyRuleId,
  ProjectId,
  ProjectRelationId,
  RepositoryCheckoutId,
  RepositoryId,
  RoleRouteId,
  RoutingPolicyId,
  RuntimeSessionId,
  TaskId,
  UserId,
  WorkspaceId,
  WorktreeId,
} from "./ids.js";
import type {
  AgentRunStatus,
  ExecutionJobStatus,
  RuntimeHandoffStatus,
  ApprovalStatus,
  OperationStatus,
  OrchestratorKind,
  RecordStatus,
  RuntimeSessionPurpose,
  RuntimeSessionStatus,
  TaskStatus,
} from "./statuses.js";

export type MemorySearchQuery = {
  includeSystemGlobal: boolean;
  ownerUserId?: UserId;
  workspaceId?: WorkspaceId;
  projectId?: ProjectId;
  operationId?: OperationId;
  taskId?: TaskId;
  agentRunId?: AgentRunId;
  text?: string;
  limit?: number;
};

/**
 * Persistence port. Kernel, memory, and the execution plane depend on this
 * contract. PostgreSQL is one implementation; tests use an in-memory one.
 * There is no update or delete for events.
 */
export interface Repositories {
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;

  users: {
    insert(user: User): Promise<void>;
    get(id: UserId): Promise<User | null>;
  };

  workspaces: {
    insert(workspace: Workspace): Promise<void>;
    get(id: WorkspaceId): Promise<Workspace | null>;
  };

  memberships: {
    insert(member: WorkspaceMember): Promise<void>;
    get(workspaceId: WorkspaceId, userId: UserId): Promise<WorkspaceMember | null>;
  };

  executionNodes: {
    upsert(node: ExecutionNode): Promise<ExecutionNode>;
    get(id: ExecutionNodeId): Promise<ExecutionNode | null>;
    getByMachineKey(machineKey: string): Promise<ExecutionNode | null>;
    setBoot(id: ExecutionNodeId, bootId: string, updatedAt: Date): Promise<void>;
  };

  projects: {
    insert(project: Project): Promise<void>;
    get(id: ProjectId): Promise<Project | null>;
    listByWorkspace(workspaceId: WorkspaceId): Promise<Project[]>;
  };

  repositories: {
    insert(repository: Repository): Promise<void>;
    get(id: RepositoryId): Promise<Repository | null>;
    listByProject(projectId: ProjectId): Promise<Repository[]>;
  };

  repositoryCheckouts: {
    insert(checkout: RepositoryCheckout): Promise<void>;
    get(id: RepositoryCheckoutId): Promise<RepositoryCheckout | null>;
    find(repositoryId: RepositoryId, executionNodeId: ExecutionNodeId): Promise<RepositoryCheckout | null>;
    listByNode(executionNodeId: ExecutionNodeId): Promise<RepositoryCheckout[]>;
  };

  projectRelations: {
    insert(relation: ProjectRelation): Promise<void>;
    listByWorkspace(workspaceId: WorkspaceId): Promise<ProjectRelation[]>;
    get(id: ProjectRelationId): Promise<ProjectRelation | null>;
  };

  orchestrators: {
    insert(orchestrator: Orchestrator): Promise<void>;
    get(id: OrchestratorId): Promise<Orchestrator | null>;
    findByKind(input: {
      workspaceId: WorkspaceId;
      kind: OrchestratorKind;
      projectId: ProjectId | null;
    }): Promise<Orchestrator | null>;
    setStatus(id: OrchestratorId, status: Orchestrator["status"], updatedAt: Date): Promise<void>;
  };

  operations: {
    insert(operation: Operation): Promise<void>;
    get(id: OperationId): Promise<Operation | null>;
    setStatus(id: OperationId, status: OperationStatus, updatedAt: Date): Promise<void>;
    transition(id: OperationId, from: OperationStatus, to: OperationStatus, updatedAt: Date): Promise<boolean>;
  };

  tasks: {
    insert(task: Task): Promise<void>;
    get(id: TaskId): Promise<Task | null>;
    listByOperation(operationId: OperationId): Promise<Task[]>;
    setStatus(id: TaskId, status: TaskStatus, updatedAt: Date): Promise<void>;
    transition(id: TaskId, from: TaskStatus, to: TaskStatus, updatedAt: Date): Promise<boolean>;
  };

  taskDependencies: {
    insert(dependency: TaskDependency): Promise<void>;
    listAll(): Promise<TaskDependency[]>;
    listDependencies(taskId: TaskId): Promise<TaskDependency[]>;
    listDependents(taskId: TaskId): Promise<TaskDependency[]>;
  };

  harnesses: {
    insert(harness: Harness): Promise<void>;
    get(id: HarnessId): Promise<Harness | null>;
    getByKey(key: string): Promise<Harness | null>;
    list(): Promise<Harness[]>;
  };

  models: {
    insert(model: Model): Promise<void>;
    get(id: ModelId): Promise<Model | null>;
    findByHarnessAndKey(harnessId: HarnessId, key: string): Promise<Model | null>;
    list(): Promise<Model[]>;
  };

  routingPolicies: {
    insert(policy: RoutingPolicy): Promise<void>;
    listEnabled(): Promise<RoutingPolicy[]>;
    get(id: RoutingPolicyId): Promise<RoutingPolicy | null>;
  };

  roleRoutes: {
    insert(route: RoleRoute): Promise<void>;
    list(): Promise<RoleRoute[]>;
    get(id: RoleRouteId): Promise<RoleRoute | null>;
  };

  runtimeSessions: {
    insert(session: RuntimeSession): Promise<void>;
    get(id: RuntimeSessionId): Promise<RuntimeSession | null>;
    latestForOrchestrator(
      orchestratorId: OrchestratorId,
      purpose: RuntimeSessionPurpose,
    ): Promise<RuntimeSession | null>;
    listByNode(executionNodeId: ExecutionNodeId): Promise<RuntimeSession[]>;
    setStatus(
      id: RuntimeSessionId,
      patch: {
        status: RuntimeSessionStatus;
        closeReason: string | null;
        endedAt: Date | null;
        updatedAt: Date;
      },
    ): Promise<void>;
    transition(id: RuntimeSessionId, from: RuntimeSessionStatus, patch: { status: RuntimeSessionStatus; closeReason: string | null; endedAt: Date | null; updatedAt: Date }): Promise<boolean>;
    attachAdapter(id: RuntimeSessionId, adapterSessionId: string, executionEpoch: string, updatedAt: Date): Promise<boolean>;
    rearm(id: RuntimeSessionId, updatedAt: Date): Promise<void>;
  };

  agentRuns: {
    insert(run: AgentRun): Promise<void>;
    get(id: AgentRunId): Promise<AgentRun | null>;
    listBySession(sessionId: RuntimeSessionId): Promise<AgentRun[]>;
    setStatus(id: AgentRunId, status: AgentRunStatus, updatedAt: Date, endedAt: Date | null): Promise<void>;
    transition(id: AgentRunId, from: AgentRunStatus, to: AgentRunStatus, updatedAt: Date, endedAt: Date | null): Promise<boolean>;
    rearm(id: AgentRunId, updatedAt: Date): Promise<void>;
    attachSession(id: AgentRunId, runtimeSessionId: RuntimeSessionId, updatedAt: Date): Promise<void>;
  };

  executionJobs: {
    insert(job: ExecutionJob): Promise<ExecutionJob>;
    get(id: ExecutionJobId): Promise<ExecutionJob | null>;
    getByIdempotencyKey(workspaceId: WorkspaceId, key: string): Promise<ExecutionJob | null>;
    getByRun(runId: AgentRunId): Promise<ExecutionJob | null>;
    listByNode(nodeId: ExecutionNodeId): Promise<ExecutionJob[]>;
    claim(id: ExecutionJobId, nodeId: ExecutionNodeId, epoch: string, leaseUntil: Date, now: Date): Promise<boolean>;
    renew(id: ExecutionJobId, nodeId: ExecutionNodeId, epoch: string, leaseUntil: Date, now: Date): Promise<boolean>;
    transition(id: ExecutionJobId, from: ExecutionJobStatus, to: ExecutionJobStatus, patch: Partial<Pick<ExecutionJob, "startedAt" | "endedAt" | "outcome" | "leaseUntil" | "claimEpoch" | "pendingApprovalId">>, now: Date): Promise<boolean>;
  };

  executionDigests: {
    insert(digest: ExecutionDigest): Promise<ExecutionDigest>;
    get(id: ExecutionDigestId): Promise<ExecutionDigest | null>;
    getBySource(executionJobId: ExecutionJobId, sourceDigest: string): Promise<ExecutionDigest | null>;
  };

  effectGrants: {
    insert(grant: EffectGrant): Promise<EffectGrant>;
    get(id: EffectGrantId): Promise<EffectGrant | null>;
    getByRequest(executionJobId: ExecutionJobId, requestKey: string): Promise<EffectGrant | null>;
    consume(id: EffectGrantId, now: Date): Promise<boolean>;
  };

  runtimeHandoffs: {
    insert(handoff: RuntimeHandoff): Promise<void>;
    get(id: RuntimeHandoffId): Promise<RuntimeHandoff | null>;
    listByNode(nodeId: ExecutionNodeId): Promise<RuntimeHandoff[]>;
    latestForPredecessor(sessionId: RuntimeSessionId): Promise<RuntimeHandoff | null>;
    findBySuccessor(sessionId: RuntimeSessionId): Promise<RuntimeHandoff | null>;
    transition(id: RuntimeHandoffId, from: RuntimeHandoffStatus, to: RuntimeHandoffStatus, patch: Partial<Pick<RuntimeHandoff, "successorSessionId" | "checkpointId" | "digestId">>, now: Date): Promise<boolean>;
  };

  digestIngestions: {
    enqueue(item: DigestIngestion): Promise<DigestIngestion>;
    get(id: DigestIngestionId): Promise<DigestIngestion | null>;
    claimDue(now: Date): Promise<DigestIngestion | null>;
    complete(id: DigestIngestionId, digestId: ExecutionDigestId, attempts: number, now: Date): Promise<void>;
    retry(id: DigestIngestionId, error: string, nextAttemptAt: Date, attempts: number, now: Date): Promise<void>;
  };

  memoryItems: {
    insert(item: MemoryItem): Promise<void>;
    get(id: MemoryItemId): Promise<MemoryItem | null>;
    search(query: MemorySearchQuery): Promise<MemoryItem[]>;
    setStatus(id: MemoryItemId, status: RecordStatus, supersededById: MemoryItemId | null, updatedAt: Date): Promise<void>;
  };

  decisions: {
    insert(decision: Decision): Promise<void>;
    get(id: DecisionId): Promise<Decision | null>;
    markSuperseded(id: DecisionId, updatedAt: Date): Promise<void>;
  };

  findings: {
    insert(finding: Finding): Promise<void>;
    get(id: FindingId): Promise<Finding | null>;
  };

  checkpoints: {
    insert(checkpoint: Checkpoint): Promise<void>;
    get(id: CheckpointId): Promise<Checkpoint | null>;
    latestForOrchestrator(orchestratorId: OrchestratorId): Promise<Checkpoint | null>;
    latestRelevant(orchestratorId: OrchestratorId, operationId: OperationId | null, taskId: TaskId | null): Promise<Checkpoint | null>;
  };

  events: {
    append(event: KilicEvent): Promise<void>;
    get(id: EventId): Promise<KilicEvent | null>;
    listByCorrelation(correlationId: CorrelationId): Promise<KilicEvent[]>;
    listByAggregate(aggregateType: string, aggregateId: string): Promise<KilicEvent[]>;
  };

  artifacts: {
    insert(artifact: Artifact): Promise<void>;
    get(id: ArtifactId): Promise<Artifact | null>;
  };

  policyRules: {
    insert(rule: PolicyRule): Promise<void>;
    list(): Promise<PolicyRule[]>;
    findGlobal(action: string): Promise<PolicyRule | null>;
    get(id: PolicyRuleId): Promise<PolicyRule | null>;
  };

  approvals: {
    insert(approval: Approval): Promise<void>;
    get(id: ApprovalId): Promise<Approval | null>;
    findEffectRequest(executionJobId: ExecutionJobId, requestKey: string): Promise<Approval | null>;
    decide(id: ApprovalId, status: Exclude<ApprovalStatus, "pending">, decidedAt: Date): Promise<void>;
  };

  worktrees: {
    insert(worktree: Worktree): Promise<void>;
    get(id: WorktreeId): Promise<Worktree | null>;
    listByNode(executionNodeId: ExecutionNodeId): Promise<Worktree[]>;
    findActiveByRun(agentRunId: AgentRunId): Promise<Worktree | null>;
    markRemoved(id: WorktreeId, removedAt: Date): Promise<void>;
  };
}
