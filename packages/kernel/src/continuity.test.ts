import { describe, expect, it } from "vitest";
import type { RuntimeCapabilities, RuntimeLifecycleSignal } from "@kilic/runtime-contract";
import { selectLifecycleFlush } from "./continuity.js";

const capabilities: RuntimeCapabilities = {
  supportsSessionResume: true, supportsTurnPauseResume: true, supportsToolInterception: true,
  supportsPreCompactionSignal: false, supportsSessionEndSignal: false,
  supportsStreaming: true, supportsInterrupt: true,
};

describe("runtime continuity fallback", () => {
  it("flushes at turn boundaries when pre-compaction signals are unavailable", () => {
    expect(selectLifecycleFlush({ capabilities, purpose: "orchestrator_mind", outcome: "completed",
      observed: new Set<RuntimeLifecycleSignal>() })).toBe("turn_completed");
    expect(selectLifecycleFlush({ capabilities: { ...capabilities, supportsPreCompactionSignal: true },
      purpose: "orchestrator_mind", outcome: "completed", observed: new Set(["pre_compaction"]) })).toBeNull();
    expect(selectLifecycleFlush({ capabilities, purpose: "worker", outcome: "completed",
      observed: new Set<RuntimeLifecycleSignal>() })).toBe("session_ending");
    expect(selectLifecycleFlush({ capabilities, purpose: "orchestrator_mind", outcome: "failed",
      failureStatus: "QUOTA_EXHAUSTED", observed: new Set<RuntimeLifecycleSignal>() })).toBe("quota_exhausted");
  });
});
