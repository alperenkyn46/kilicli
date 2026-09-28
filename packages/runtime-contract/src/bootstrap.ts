export type BootstrapCheckpointState = {
  phase: string | null;
  completed: string[];
  remaining: string[];
  importantFiles: string[];
  risks: string[];
  notes: string | null;
};

/**
 * Provider-neutral context for a mind or worker turn.
 * This is not a prompt and it is not a chat transcript.
 */
export type BootstrapContext = {
  doctrinePath: string;
  doctrineText: string;
  identity: {
    orchestratorId: string;
    kind: "workspace" | "project";
    displayName: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  project: {
    id: string;
    name: string;
    slug: string;
  } | null;
  operation: {
    id: string;
    title: string;
    status: string;
    language: string | null;
  } | null;
  task: {
    id: string;
    title: string;
    status: string;
    acceptanceCriteria: string | null;
    language: string | null;
  } | null;
  checkpoint: {
    id: string;
    trigger: string;
    state: BootstrapCheckpointState;
    createdAt: string;
  } | null;
  policies: Array<{ action: string; effect: "allow" | "deny" | "require_approval"; scopeType: string }>;
  memories: Array<{
    id: string;
    scopeType: string;
    title: string;
    body: string;
    language: string | null;
    knowledgeClass: string;
  }>;
  runtime: {
    purpose: "orchestrator_mind" | "worker";
    role: string;
    executionNodeId: string;
    correlationId: string;
  };
};

export type ToolSurface = {
  memory: boolean;
  workforce: boolean;
  /** Effect-capable tools must be installed through the execution broker. */
  effectExecution: "brokered_only";
};

export type SessionStartRequest = {
  role: string;
  modelKey?: string;
  cwd?: string;
  bootstrap: BootstrapContext;
  tools: ToolSurface;
};
