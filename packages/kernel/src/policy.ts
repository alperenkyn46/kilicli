import type { PolicyEffect, PolicyRule, ProjectId, WorkspaceId } from "@kilic/domain";

const EFFECT_RANK: Record<PolicyEffect, number> = {
  allow: 1,
  require_approval: 2,
  deny: 3,
};

export type PolicyDecision = {
  effect: PolicyEffect;
  ruleId: PolicyRule["id"] | null;
};

/**
 * Unknown actions fail closed. The model cannot widen its own authority by
 * choosing an action the policy table does not list.
 */
export function evaluatePolicy(input: {
  action: string;
  rules: readonly PolicyRule[];
  context: { workspaceId: WorkspaceId; projectId: ProjectId | null };
}): PolicyDecision {
  const matches = input.rules.filter((rule) => rule.action === input.action && ruleMatches(rule, input.context));
  if (matches.length === 0) return { effect: "require_approval", ruleId: null };

  const highest = Math.max(...matches.map((rule) => specificity(rule)));
  const tier = matches.filter((rule) => specificity(rule) === highest);
  const winner = [...tier].sort((left, right) => EFFECT_RANK[right.effect] - EFFECT_RANK[left.effect])[0];
  if (!winner) return { effect: "require_approval", ruleId: null };
  return { effect: winner.effect, ruleId: winner.id };
}

function ruleMatches(rule: PolicyRule, context: { workspaceId: WorkspaceId; projectId: ProjectId | null }): boolean {
  switch (rule.scopeType) {
    case "global":
      return true;
    case "workspace":
      return rule.workspaceId === context.workspaceId;
    case "project":
      return rule.projectId !== null && rule.projectId === context.projectId;
    default: {
      const unreachable: never = rule.scopeType;
      return unreachable;
    }
  }
}

function specificity(rule: PolicyRule): number {
  switch (rule.scopeType) {
    case "global":
      return 1;
    case "workspace":
      return 2;
    case "project":
      return 3;
    default: {
      const unreachable: never = rule.scopeType;
      return unreachable;
    }
  }
}
