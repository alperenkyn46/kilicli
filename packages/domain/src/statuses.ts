export const ORCHESTRATOR_KINDS = ["workspace", "project"] as const;
export type OrchestratorKind = (typeof ORCHESTRATOR_KINDS)[number];

export const ORCHESTRATOR_STATUSES = ["active", "suspended", "archived"] as const;
export type OrchestratorStatus = (typeof ORCHESTRATOR_STATUSES)[number];

export const OPERATION_STATUSES = ["draft", "active", "blocked", "completed", "cancelled"] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const TASK_STATUSES = [
  "pending",
  "ready",
  "in_progress",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const RUNTIME_SESSION_PURPOSES = ["orchestrator_mind", "worker"] as const;
export type RuntimeSessionPurpose = (typeof RUNTIME_SESSION_PURPOSES)[number];

export const RUNTIME_SESSION_STATUSES = [
  "starting",
  "active",
  "interrupted",
  "closed",
  "failed",
  "rate_limited",
  "quota_exhausted",
  "auth_required",
] as const;
export type RuntimeSessionStatus = (typeof RUNTIME_SESSION_STATUSES)[number];

export const AGENT_RUN_KINDS = ["orchestrator_mind", "worker"] as const;
export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number];

export const AGENT_RUN_STATUSES = [
  "planned",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const ACCESS_MODES = ["read_only", "write", "none"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const MEMORY_SCOPES = [
  "global",
  "user",
  "workspace",
  "project",
  "operation",
  "task",
  "run",
] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const KNOWLEDGE_CLASSES = ["authoritative", "inferred", "historical"] as const;
export type KnowledgeClass = (typeof KNOWLEDGE_CLASSES)[number];

export const RECORD_STATUSES = ["active", "archived", "superseded"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const CONFIG_SCOPES = ["global", "workspace", "project", "operation"] as const;
export type ConfigScope = (typeof CONFIG_SCOPES)[number];

export const POLICY_SCOPES = ["global", "workspace", "project"] as const;
export type PolicyScope = (typeof POLICY_SCOPES)[number];

export const POLICY_EFFECTS = ["allow", "require_approval", "deny"] as const;
export type PolicyEffect = (typeof POLICY_EFFECTS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const EXECUTION_NODE_KINDS = ["local", "remote"] as const;
export type ExecutionNodeKind = (typeof EXECUTION_NODE_KINDS)[number];

export const EXECUTION_NODE_STATUSES = ["online", "offline"] as const;
export type ExecutionNodeStatus = (typeof EXECUTION_NODE_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const EXECUTION_PROFILES = ["quality", "balanced", "cheap", "emergency"] as const;
export type ExecutionProfile = (typeof EXECUTION_PROFILES)[number];

export const WORKTREE_STATUSES = ["active", "removed"] as const;
export type WorktreeStatus = (typeof WORKTREE_STATUSES)[number];

export const CHECKOUT_STATUSES = ["present", "missing"] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export const CHECKPOINT_TRIGGERS = [
  "major_decision",
  "phase_completed",
  "before_compaction",
  "before_runtime_switch",
  "after_failed_attempt",
  "before_risky_change",
  "before_user_visible_completion",
] as const;
export type CheckpointTrigger = (typeof CHECKPOINT_TRIGGERS)[number];

export const CONTEXT_HEALTH = ["healthy", "degraded"] as const;
export type ContextHealth = (typeof CONTEXT_HEALTH)[number];

export const PROJECT_RELATION_TYPES = [
  "api_provider",
  "package_dependency",
  "generated_types_provider",
  "shared_database",
  "event_producer",
  "event_consumer",
  "shared_library",
  "deployment_dependency",
  "schema_provider",
] as const;

export const POLICY_ACTIONS = [
  "file_write",
  "build",
  "test",
  "lint",
  "local_analysis",
  "git_push",
  "git_merge",
  "force_push",
  "production_deploy",
  "destructive_database_migration",
  "production_data_deletion",
  "secret_rotation",
  "branch_deletion",
  "destructive_infrastructure_operation",
  "irreversible_external_action",
] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];
