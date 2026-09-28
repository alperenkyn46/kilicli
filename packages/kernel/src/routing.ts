import type { RuntimeStatus } from "@kilic/runtime-contract";
import type {
  ConfigScope,
  ExecutionProfile,
  Harness,
  Model,
  OperationId,
  ProjectId,
  RoleRoute,
  RoutingPolicy,
  WorkspaceId,
} from "@kilic/domain";

export type RouteCandidate = {
  policyId: RoutingPolicy["id"];
  specificity: number;
  priority: number;
  harnessId: Harness["id"];
  harnessKey: string;
  modelId: Model["id"];
  modelKey: string;
};

export type RouteSelection =
  | { ok: true; candidate: RouteCandidate }
  | { ok: false; reason: "no_matching_policy" | "no_available_harness" };

const SPECIFICITY: Record<ConfigScope, number> = {
  global: 1,
  workspace: 2,
  project: 3,
  operation: 4,
};

export function selectRoute(input: {
  role: string;
  context: {
    workspaceId: WorkspaceId;
    projectId: ProjectId | null;
    operationId: OperationId | null;
    profile: ExecutionProfile | null;
  };
  policies: readonly RoutingPolicy[];
  routes: readonly RoleRoute[];
  harnesses: readonly Harness[];
  models: readonly Model[];
  statusByHarnessKey: Readonly<Record<string, RuntimeStatus>>;
}): RouteSelection {
  const matching = input.policies.filter(
    (policy) => policy.enabled && scopeMatches(policy, input.context) && profileMatches(policy, input.context.profile),
  );
  const policies = matching;
  const roleRoutes = input.routes.filter((route) => route.role === input.role && policies.some((policy) => policy.id === route.routingPolicyId));
  if (roleRoutes.length === 0) return { ok: false, reason: "no_matching_policy" };

  const harnessById = new Map(input.harnesses.map((harness) => [harness.id, harness]));
  const modelById = new Map(input.models.map((model) => [model.id, model]));
  const tiers = [4, 3, 2, 1];
  let sawUnavailable = false;

  for (const tier of tiers) {
    const ordered = roleRoutes
      .flatMap((route) => {
        const policy = policies.find((item) => item.id === route.routingPolicyId);
        const harness = harnessById.get(route.harnessId);
        const model = modelById.get(route.modelId);
        if (!policy || !harness || !model) return [];
        if (model.harnessId !== harness.id) return [];
        if (SPECIFICITY[policy.scopeType] !== tier) return [];
        return [
          {
            policyId: policy.id,
            specificity: tier,
            profileRank: policy.executionProfile === input.context.profile && input.context.profile !== null ? 0 : 1,
            priority: route.priority,
            routeId: route.id,
            harnessId: harness.id,
            harnessKey: harness.key,
            modelId: model.id,
            modelKey: model.key,
          } satisfies RouteCandidate & { profileRank: number; routeId: string },
        ];
      })
      .sort((left, right) =>
        left.profileRank - right.profileRank ||
        left.priority - right.priority ||
        left.policyId.localeCompare(right.policyId) ||
        left.routeId.localeCompare(right.routeId),
      );

    for (const candidate of ordered) {
      if ((input.statusByHarnessKey[candidate.harnessKey] ?? "OFFLINE") === "AVAILABLE") {
        return { ok: true, candidate };
      }
      sawUnavailable = true;
    }
  }

  return { ok: false, reason: sawUnavailable ? "no_available_harness" : "no_matching_policy" };
}

function scopeMatches(
  policy: RoutingPolicy,
  context: { workspaceId: WorkspaceId; projectId: ProjectId | null; operationId: OperationId | null },
): boolean {
  switch (policy.scopeType) {
    case "global":
      return true;
    case "workspace":
      return policy.workspaceId === context.workspaceId;
    case "project":
      return policy.projectId !== null && policy.projectId === context.projectId;
    case "operation":
      return policy.operationId !== null && policy.operationId === context.operationId;
    default: {
      const unreachable: never = policy.scopeType;
      return unreachable;
    }
  }
}

function profileMatches(policy: RoutingPolicy, profile: ExecutionProfile | null): boolean {
  if (profile === null) return policy.executionProfile === null;
  return policy.executionProfile === null || policy.executionProfile === profile;
}
