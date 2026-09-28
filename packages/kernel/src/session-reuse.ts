import type { RuntimeStatus } from "@kilic/runtime-contract";
import type { ContextHealth, RuntimeSessionStatus } from "@kilic/domain";

export type SessionReuseReason =
  | "no_session"
  | "no_route"
  | "explicit_switch"
  | "context_degraded"
  | "session_not_active"
  | "harness_unavailable"
  | "route_changed"
  | "execution_expired"
  | "no_adapter_session";

export type SessionReuseDecision =
  | { action: "reuse" }
  | { action: "reconstruct"; reason: SessionReuseReason };

export function decideSessionReuse(input: {
  session: {
    status: RuntimeSessionStatus;
    harnessId: string;
    modelId: string;
    executionEpoch: string | null;
    adapterSessionId: string | null;
  } | null;
  nodeBootId: string | null;
  selected: { harnessId: string; modelId: string } | null;
  harnessStatus: RuntimeStatus | null;
  contextHealth: ContextHealth;
  explicitSwitch: boolean;
}): SessionReuseDecision {
  if (!input.session) return { action: "reconstruct", reason: "no_session" };
  if (!input.selected) return { action: "reconstruct", reason: "no_route" };
  if (input.explicitSwitch) return { action: "reconstruct", reason: "explicit_switch" };
  if (input.contextHealth === "degraded") return { action: "reconstruct", reason: "context_degraded" };
  if (input.session.status !== "active") return { action: "reconstruct", reason: "session_not_active" };
  if (!input.session.adapterSessionId) return { action: "reconstruct", reason: "no_adapter_session" };
  if (!input.nodeBootId || input.session.executionEpoch !== input.nodeBootId) {
    return { action: "reconstruct", reason: "execution_expired" };
  }
  if (input.harnessStatus !== "AVAILABLE") return { action: "reconstruct", reason: "harness_unavailable" };
  if (input.session.harnessId !== input.selected.harnessId || input.session.modelId !== input.selected.modelId) {
    return { action: "reconstruct", reason: "route_changed" };
  }
  return { action: "reuse" };
}
