import { asId, DomainError, newId } from "@kilic/shared";
import type { KilicEvent } from "./entities.js";
import type {
  AgentRunId,
  CorrelationId,
  EventId,
  ProjectId,
  RuntimeSessionId,
  WorkspaceId,
} from "./ids.js";

export const EVENT_TYPES = [
  "workspace.created",
  "project.created",
  "orchestrator.created",
  "operation.created",
  "operation.status_changed",
  "task.created",
  "task.status_changed",
  "runtime_session.opened",
  "runtime_session.planned",
  "runtime_session.resume_requested",
  "runtime_session.reused",
  "runtime_session.closed",
  "checkpoint.created",
  "workforce.dispatch_planned",
  "workforce.approval_required",
  "approval.decided",
  "memory.recorded",
  "decision.recorded",
  "finding.recorded",
  "worktree.registered",
  "worktree.removed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type EventDraft = {
  type: string;
  workspaceId?: WorkspaceId | null;
  projectId?: ProjectId | null;
  aggregateType: string;
  aggregateId: string;
  correlationId: CorrelationId;
  causationId?: EventId | null;
  agentRunId?: AgentRunId | null;
  runtimeSessionId?: RuntimeSessionId | null;
  payload?: Record<string, unknown>;
  occurredAt: Date;
};

export function newCorrelationId(): CorrelationId {
  return newId<"CorrelationId">();
}

export function buildEvent(draft: EventDraft): KilicEvent {
  const type = draft.type.trim();
  const aggregateType = draft.aggregateType.trim();
  const aggregateId = draft.aggregateId.trim();
  if (!type || !aggregateType || !aggregateId) {
    throw new DomainError("INVALID_EVENT", "Event type, aggregate type, and aggregate id are required");
  }
  if (!isPlainObject(draft.payload ?? {})) {
    throw new DomainError("INVALID_EVENT", "Event payload must be a plain object");
  }

  return {
    id: newId<"EventId">(),
    type,
    workspaceId: draft.workspaceId ?? null,
    projectId: draft.projectId ?? null,
    aggregateType,
    aggregateId,
    correlationId: draft.correlationId,
    causationId: draft.causationId ?? null,
    agentRunId: draft.agentRunId ?? null,
    runtimeSessionId: draft.runtimeSessionId ?? null,
    payload: draft.payload ?? {},
    occurredAt: draft.occurredAt,
  };
}

export function eventId(value: string): EventId {
  return asId<"EventId">(value, "event id");
}

export function correlationId(value: string): CorrelationId {
  return asId<"CorrelationId">(value, "correlation id");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
