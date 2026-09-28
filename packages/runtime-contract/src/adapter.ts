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
  streaming: boolean;
  interrupt: boolean;
  tools: boolean;
};

export type StartSessionOptions = SessionStartRequest;

/** Adapter-local handle. This is not the control-plane RuntimeSession id. */
export type RuntimeSessionHandle = {
  readonly adapterSessionId: string;
  readonly harnessKey: string;
};

export type RuntimeMessage = {
  text: string;
};

export type RuntimeEvent =
  | { type: "output"; text: string }
  | { type: "completed"; text?: string }
  | { type: "interrupted" };

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
  start(options: StartSessionOptions): Promise<RuntimeSessionHandle>;
  send(handle: RuntimeSessionHandle, message: RuntimeMessage): AsyncIterable<RuntimeEvent>;
  interrupt(handle: RuntimeSessionHandle): Promise<void>;
  close(handle: RuntimeSessionHandle): Promise<void>;
}
