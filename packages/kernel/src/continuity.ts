import type { RuntimeCapabilities, RuntimeFailureStatus, RuntimeLifecycleSignal } from "@kilic/runtime-contract";

/** Provider-neutral fallback when a runtime omits a lifecycle signal. */
export function selectLifecycleFlush(input: {
  capabilities: RuntimeCapabilities;
  purpose: "worker" | "orchestrator_mind";
  outcome: "completed" | "failed" | "interrupted";
  failureStatus?: RuntimeFailureStatus | null;
  observed: ReadonlySet<RuntimeLifecycleSignal>;
}): RuntimeLifecycleSignal | null {
  const signal: RuntimeLifecycleSignal = input.outcome === "completed"
    ? input.purpose === "worker" ? "session_ending" : "turn_completed"
    : input.failureStatus === "QUOTA_EXHAUSTED" ? "quota_exhausted"
    : input.failureStatus === "RATE_LIMITED" ? "rate_limited" : "runtime_failure";
  if (input.observed.has(signal)) return null;
  if (signal === "turn_completed" && (input.observed.has("session_ending") ||
    (input.capabilities.supportsPreCompactionSignal && input.observed.has("pre_compaction")))) return null;
  return signal;
}
