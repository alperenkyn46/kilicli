import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import type { PolicyRule } from "@kilic/domain";
import { evaluatePolicy } from "./policy.js";

const now = new Date("2026-09-28T00:00:00Z");
const workspaceId = newId<"WorkspaceId">();

function rule(action: string, effect: PolicyRule["effect"], scopeType: PolicyRule["scopeType"] = "global"): PolicyRule {
  return {
    id: newId<"PolicyRuleId">(),
    scopeType,
    workspaceId: scopeType === "global" ? null : workspaceId,
    projectId: null,
    action,
    effect,
    createdAt: now,
    updatedAt: now,
  };
}

describe("evaluatePolicy", () => {
  it("fails closed when the action is unknown", () => {
    expect(evaluatePolicy({ action: "unknown", rules: [], context: { workspaceId, projectId: null } }).effect).toBe(
      "require_approval",
    );
  });

  it("uses the most specific rule", () => {
    const decision = evaluatePolicy({
      action: "git_push",
      rules: [rule("git_push", "require_approval"), rule("git_push", "allow", "workspace")],
      context: { workspaceId, projectId: null },
    });
    expect(decision.effect).toBe("allow");
  });

  it("keeps deny ahead of allow at the same scope", () => {
    const decision = evaluatePolicy({
      action: "force_push",
      rules: [rule("force_push", "allow"), rule("force_push", "deny")],
      context: { workspaceId, projectId: null },
    });
    expect(decision.effect).toBe("deny");
  });
});
