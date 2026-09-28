import { describe, expect, it } from "vitest";
import { decideSessionReuse } from "./session-reuse.js";

const session = {
  status: "active" as const,
  harnessId: "h1",
  modelId: "m1",
  executionEpoch: "boot-1",
  adapterSessionId: "adapter-1",
};

describe("decideSessionReuse", () => {
  it("reuses a healthy active session on the same route", () => {
    expect(
      decideSessionReuse({
        session,
        nodeBootId: "boot-1",
        selected: { harnessId: "h1", modelId: "m1" },
        harnessStatus: "AVAILABLE",
        contextHealth: "healthy",
        explicitSwitch: false,
      }).action,
    ).toBe("reuse");
  });

  it("reconstructs when context degrades or the harness is unavailable", () => {
    expect(
      decideSessionReuse({
        session,
        nodeBootId: "boot-1",
        selected: { harnessId: "h1", modelId: "m1" },
        harnessStatus: "AVAILABLE",
        contextHealth: "degraded",
        explicitSwitch: false,
      }),
    ).toMatchObject({ action: "reconstruct", reason: "context_degraded" });

    expect(
      decideSessionReuse({
        session,
        nodeBootId: "boot-1",
        selected: { harnessId: "h1", modelId: "m1" },
        harnessStatus: "QUOTA_EXHAUSTED",
        contextHealth: "healthy",
        explicitSwitch: false,
      }),
    ).toMatchObject({ action: "reconstruct", reason: "harness_unavailable" });

    expect(
      decideSessionReuse({
        session,
        nodeBootId: "boot-2",
        selected: { harnessId: "h1", modelId: "m1" },
        harnessStatus: "AVAILABLE",
        contextHealth: "healthy",
        explicitSwitch: false,
      }),
    ).toMatchObject({ action: "reconstruct", reason: "execution_expired" });
  });
});
