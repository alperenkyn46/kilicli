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
  AccessMode,
  AgentRunKind,
  AgentRunStatus,
  ApprovalStatus,
  CheckpointTrigger,
  CheckoutStatus,
  ConfigScope,
  ExecutionNodeKind,
  ExecutionNodeStatus,
  ExecutionJobStatus,
  RuntimeHandoffStatus,
  DigestIngestionStatus,
  ExecutionProfile,
  KnowledgeClass,
  MembershipRole,
  MemoryScope,
  OperationStatus,
  OrchestratorKind,
  OrchestratorStatus,
  PolicyEffect,
  PolicyScope,
  RecordStatus,
  RuntimeSessionPurpose,
  RuntimeSessionStatus,
  TaskStatus,
  WorktreeStatus,
} from "./statuses.js";

export type User = {
  id: UserId;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Workspace = {
  id: WorkspaceId;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkspaceMember = {
  workspaceId: WorkspaceId;
  userId: UserId;
  role: MembershipRole;
  createdAt: Date;
};

export type ExecutionNode = {
  id: ExecutionNodeId;
  machineKey: string;
  displayName: string;
  hostname: string | null;
  kind: ExecutionNodeKind;
  status: ExecutionNodeStatus;
  bootId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Project = {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Repository = {
  id: RepositoryId;
  projectId: ProjectId;
  name: string;
  defaultBranch: string;
  remoteUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RepositoryCheckout = {
  id: RepositoryCheckoutId;
  repositoryId: RepositoryId;
  executionNodeId: ExecutionNodeId;
  localPath: string;
  status: CheckoutStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectRelation = {
  id: ProjectRelationId;
  workspaceId: WorkspaceId;
  sourceProjectId: ProjectId;
  targetProjectId: ProjectId;
  relationType: string;
  knowledgeClass: KnowledgeClass;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Persistent orchestrator identity.
 * A workspace Kılıç or project Kılıç is this row, not a live model session.
 */
export type Orchestrator = {
  id: OrchestratorId;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  kind: OrchestratorKind;
  displayName: string;
  status: OrchestratorStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type Operation = {
  id: OperationId;
  workspaceId: WorkspaceId;
  correlationId: CorrelationId;
  title: string;
  description: string | null;
  language: string | null;
  status: OperationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type Task = {
  id: TaskId;
  operationId: OperationId;
  projectId: ProjectId;
  orchestratorId: OrchestratorId;
  workspaceId: WorkspaceId;
  correlationId: CorrelationId;
  title: string;
  description: string | null;
  language: string | null;
  acceptanceCriteria: string | null;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskDependency = {
  taskId: TaskId;
  dependsOnTaskId: TaskId;
  createdAt: Date;
};

export type Harness = {
  id: HarnessId;
  key: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Model = {
  id: ModelId;
  harnessId: HarnessId;
  key: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RoutingPolicy = {
  id: RoutingPolicyId;
  name: string;
  scopeType: ConfigScope;
  workspaceId: WorkspaceId | null;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  executionProfile: ExecutionProfile | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RoleRoute = {
  id: RoleRouteId;
  routingPolicyId: RoutingPolicyId;
  role: string;
  harnessId: HarnessId;
  modelId: ModelId;
  priority: number;
  createdAt: Date;
};

export type RuntimeSession = {
  id: RuntimeSessionId;
  orchestratorId: OrchestratorId;
  executionNodeId: ExecutionNodeId;
  harnessId: HarnessId;
  modelId: ModelId;
  purpose: RuntimeSessionPurpose;
  status: RuntimeSessionStatus;
  adapterSessionId: string | null;
  executionEpoch: string | null;
  closeReason: string | null;
  correlationId: CorrelationId;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IsolationPlan =
  | { mode: "read_only" }
  | { mode: "worktree"; branch: string; baseRef: string };

export type AgentRun = {
  id: AgentRunId;
  runtimeSessionId: RuntimeSessionId | null;
  orchestratorId: OrchestratorId;
  taskId: TaskId | null;
  parentRunId: AgentRunId | null;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  correlationId: CorrelationId;
  kind: AgentRunKind;
  role: string;
  access: AccessMode;
  status: AgentRunStatus;
  isolation: IsolationPlan | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExecutionJob = {
  id: ExecutionJobId;
  idempotencyKey: string;
  requestFingerprint: string;
  runtimeSessionId: RuntimeSessionId;
  agentRunId: AgentRunId | null;
  orchestratorId: OrchestratorId;
  executionNodeId: ExecutionNodeId;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  taskId: TaskId | null;
  repositoryId: RepositoryId | null;
  correlationId: CorrelationId;
  causationId: EventId | null;
  handoffCheckpointId: CheckpointId | null;
  pendingApprovalId: ApprovalId | null;
  status: ExecutionJobStatus;
  claimEpoch: string | null;
  leaseUntil: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExecutionDigest = {
  id: ExecutionDigestId;
  executionJobId: ExecutionJobId;
  runtimeSessionId: RuntimeSessionId;
  agentRunId: AgentRunId | null;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  taskId: TaskId | null;
  sourceDigest: string;
  sourceCursor: string | null;
  summary: string;
  observedDecisions: string[];
  observedFindings: string[];
  touchedArtifacts: string[];
  verificationResult: string | null;
  openQuestions: string[];
  createdAt: Date;
};

export type EffectGrant = {
  id: EffectGrantId;
  principalKey: string;
  executionJobId: ExecutionJobId;
  agentRunId: AgentRunId | null;
  action: string;
  resource: string;
  requestKey: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type RuntimeHandoff = {
  id: RuntimeHandoffId;
  predecessorSessionId: RuntimeSessionId;
  successorSessionId: RuntimeSessionId | null;
  orchestratorId: OrchestratorId;
  workspaceId: WorkspaceId;
  operationId: OperationId | null;
  taskId: TaskId | null;
  checkpointId: CheckpointId | null;
  digestId: ExecutionDigestId | null;
  repositoryState: Record<string, unknown>;
  reason: string;
  status: RuntimeHandoffStatus;
  correlationId: CorrelationId;
  causationId: EventId | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DigestIngestion = {
  id: DigestIngestionId;
  executionJobId: ExecutionJobId;
  sourceDigest: string;
  sourceCursor: string | null;
  payload: Omit<ExecutionDigest, "id" | "createdAt">;
  status: DigestIngestionStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  digestId: ExecutionDigestId | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryScopeRef = {
  scopeType: MemoryScope;
  ownerUserId: UserId | null;
  workspaceId: WorkspaceId | null;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  taskId: TaskId | null;
  agentRunId: AgentRunId | null;
};

export type MemoryItem = MemoryScopeRef & {
  id: MemoryItemId;
  kind: string;
  title: string;
  body: string;
  language: string | null;
  knowledgeClass: KnowledgeClass;
  status: RecordStatus;
  supersededById: MemoryItemId | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Decision = {
  id: DecisionId;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  title: string;
  decision: string;
  reason: string;
  language: string | null;
  status: RecordStatus;
  supersedesId: DecisionId | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Finding = {
  id: FindingId;
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  taskId: TaskId | null;
  agentRunId: AgentRunId | null;
  title: string;
  body: string;
  recommendation: string | null;
  language: string | null;
  knowledgeClass: KnowledgeClass;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckpointState = {
  phase: string | null;
  completed: string[];
  remaining: string[];
  importantFiles: string[];
  risks: string[];
  notes: string | null;
};

export type Checkpoint = {
  id: CheckpointId;
  orchestratorId: OrchestratorId;
  workspaceId: WorkspaceId;
  runtimeSessionId: RuntimeSessionId | null;
  operationId: OperationId | null;
  taskId: TaskId | null;
  correlationId: CorrelationId;
  trigger: CheckpointTrigger;
  state: CheckpointState;
  createdAt: Date;
};

export type KilicEvent = {
  id: EventId;
  type: string;
  workspaceId: WorkspaceId | null;
  projectId: ProjectId | null;
  aggregateType: string;
  aggregateId: string;
  correlationId: CorrelationId;
  causationId: EventId | null;
  agentRunId: AgentRunId | null;
  runtimeSessionId: RuntimeSessionId | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

export type Artifact = {
  id: ArtifactId;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  taskId: TaskId | null;
  agentRunId: AgentRunId | null;
  kind: string;
  storageKey: string;
  mediaType: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type PolicyRule = {
  id: PolicyRuleId;
  scopeType: PolicyScope;
  workspaceId: WorkspaceId | null;
  projectId: ProjectId | null;
  action: string;
  effect: PolicyEffect;
  createdAt: Date;
  updatedAt: Date;
};

export type Approval = {
  id: ApprovalId;
  policyRuleId: PolicyRuleId | null;
  action: string;
  status: ApprovalStatus;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  operationId: OperationId | null;
  taskId: TaskId | null;
  requestedByRunId: AgentRunId | null;
  correlationId: CorrelationId;
  payload: Record<string, unknown>;
  createdAt: Date;
  decidedAt: Date | null;
};

export type Worktree = {
  id: WorktreeId;
  repositoryId: RepositoryId;
  agentRunId: AgentRunId;
  executionNodeId: ExecutionNodeId;
  branch: string;
  path: string;
  baseRef: string;
  status: WorktreeStatus;
  createdAt: Date;
  removedAt: Date | null;
};
