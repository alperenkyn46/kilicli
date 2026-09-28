import type { SessionStartRequest } from "./bootstrap.js";

export const RUNTIME_STATUSES = [
  "AVAILABLE",
  "RATE_LIMITED",
  "QUOTA_EXHAUSTED",
  "AUTH_REQUIRED",
  "FAILED",
  "OFFLINE",
] as const;

export type RuntimeStatus = (typeof RUNTIME_STATUSES)[number];

export type RuntimeFailureStatus = Exclude<RuntimeStatus, "AVAILABLE">;

export type RuntimeCapabilities = {
  supportsSessionResume: boolean;
  supportsTurnPauseResume: boolean;
  /** No effect-capable tool executes before the broker resolves its exact request. */
  supportsToolInterception: boolean;
  supportsPreCompactionSignal: boolean;
  supportsSessionEndSignal: boolean;
  supportsStreaming: boolean;
  supportsInterrupt: boolean;
};

export type StartSessionOptions = SessionStartRequest;

/** Adapter-local handle. This is not the control-plane RuntimeSession id. */
export type RuntimeSessionHandle = {
  readonly adapterSessionId: string;
  readonly harnessKey: string;
};

export type RuntimeMessage = {
  text: string;
  executionId: string;
  idempotencyKey: string;
};

export type RuntimeEvent =
  | { type: "started" }
  | { type: "output"; text: string }
  | { type: "completed"; text?: string }
  | { type: "interrupted" }
  | { type: "effect_requested"; request: EffectRequest }
  | { type: "lifecycle"; signal: RuntimeLifecycleSignal; checkpointState?: RuntimeCheckpointState; digest?: RuntimeDigestSource }
  | { type: "failed"; status: RuntimeFailureStatus; message: string };

export type RuntimeLifecycleSignal = "pre_compaction" | "session_ending" | "runtime_failure" | "quota_exhausted" | "rate_limited" | "explicit_switch" | "turn_completed" | "approval_pause";

export type RuntimeCheckpointState = {
  phase: string | null;
  completed: string[];
  remaining: string[];
  importantFiles: string[];
  risks: string[];
  notes: string | null;
};

export type RuntimeDigestSource = {
  sourceCursor: string;
  sourceBytes: string;
  summary: string;
  observedDecisions: string[];
  observedFindings: string[];
  touchedArtifacts: string[];
  verificationResult: string | null;
  openQuestions: string[];
};

export type EffectRequest = {
  idempotencyKey: string;
  action: string;
  resource: string;
  description: string;
};

export type EffectResolution =
  | { decision: "allow"; grantId: string; result?: unknown }
  | { decision: "deny"; reason: string }
  | { decision: "require_approval"; approvalId: string };

export class RuntimeAdapterError extends Error {
  override readonly name = "RuntimeAdapterError";

  constructor(
    readonly status: RuntimeFailureStatus,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class RuntimeSessionClosedError extends Error {
  override readonly name = "RuntimeSessionClosedError";
  readonly code = "SESSION_CLOSED" as const;

  constructor(adapterSessionId: string) {
    super(`Runtime session ${adapterSessionId} is closed`);
  }
}

export function retryability(status: RuntimeFailureStatus): boolean {
  switch (status) {
    case "RATE_LIMITED":
    case "OFFLINE":
    case "FAILED":
      return true;
    case "QUOTA_EXHAUSTED":
    case "AUTH_REQUIRED":
      return false;
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function runtimeAdapterError(status: RuntimeFailureStatus, message: string): RuntimeAdapterError {
  return new RuntimeAdapterError(status, message, retryability(status));
}

export function isRuntimeStatus(value: string): value is RuntimeStatus {
  return (RUNTIME_STATUSES as readonly string[]).includes(value);
}

/**
 * Provider-neutral execution port.
 * Kernel and the daemon depend on this interface. Claude, Codex, and Cursor
 * implementations must live in their own adapter packages.
 */
export interface RuntimeAdapter {
  readonly harnessKey: string;
  capabilities(): RuntimeCapabilities;
  status(): Promise<RuntimeStatus>;
  sessionHealth(handle: RuntimeSessionHandle): Promise<"alive" | "dead" | "unknown">;
  start(options: StartSessionOptions): Promise<RuntimeSessionHandle>;
  /** Resolves only after the bootstrap and tool surface are usable by this session. */
  ready(handle: RuntimeSessionHandle): Promise<void>;
  resumeSession(handle: RuntimeSessionHandle): Promise<RuntimeSessionHandle>;
  send(handle: RuntimeSessionHandle, message: RuntimeMessage): AsyncIterable<RuntimeEvent>;
  resolveEffect(handle: RuntimeSessionHandle, requestKey: string, resolution: EffectResolution): Promise<void>;
  interrupt(handle: RuntimeSessionHandle): Promise<void>;
  close(handle: RuntimeSessionHandle): Promise<void>;
}
