import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import type { Harness, Model, RoleRoute, RoutingPolicy } from "@kilic/domain";
import { selectRoute } from "./routing.js";

const now = new Date("2026-09-28T00:00:00Z");

function harness(id: string, key: string): Harness {
  return {
    id: id as Harness["id"],
    key,
    displayName: key,
    createdAt: now,
    updatedAt: now,
  };
}

function model(id: string, harnessId: string, key: string): Model {
  return {
    id: id as Model["id"],
    harnessId: harnessId as Model["harnessId"],
    key,
    displayName: key,
    createdAt: now,
    updatedAt: now,
  };
}

describe("selectRoute", () => {
  const alpha = harness("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "alpha");
  const beta = harness("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "beta");
  const alphaModel = model("cccccccc-cccc-4ccc-8ccc-cccccccccccc", alpha.id, "default");
  const betaModel = model("dddddddd-dddd-4ddd-8ddd-dddddddddddd", beta.id, "default");
  const workspaceId = newId<"WorkspaceId">();
  const projectId = newId<"ProjectId">();

  const globalPolicy: RoutingPolicy = {
    id: newId<"RoutingPolicyId">(),
    name: "global",
    scopeType: "global",
    workspaceId: null,
    projectId: null,
    operationId: null,
    executionProfile: null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  const projectPolicy: RoutingPolicy = {
    id: newId<"RoutingPolicyId">(),
    name: "project",
    scopeType: "project",
    workspaceId,
    projectId,
    operationId: null,
    executionProfile: null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  const routes: RoleRoute[] = [
    route(globalPolicy.id, alpha.id, alphaModel.id, 1),
    route(globalPolicy.id, beta.id, betaModel.id, 2),
    route(projectPolicy.id, beta.id, betaModel.id, 1),
  ];

  it("skips an unavailable harness and uses the next priority", () => {
    const selected = selectRoute({
      role: "worker",
      context: { workspaceId, projectId: null, operationId: null, profile: null },
      policies: [globalPolicy],
      routes,
      harnesses: [alpha, beta],
      models: [alphaModel, betaModel],
      statusByHarnessKey: { alpha: "QUOTA_EXHAUSTED", beta: "AVAILABLE" },
    });
    expect(selected.ok).toBe(true);
    if (selected.ok) expect(selected.candidate.harnessKey).toBe("beta");
  });

  it("lets a project policy override the global chain", () => {
    const selected = selectRoute({
      role: "worker",
      context: { workspaceId, projectId, operationId: null, profile: null },
      policies: [globalPolicy, projectPolicy],
      routes,
      harnesses: [alpha, beta],
      models: [alphaModel, betaModel],
      statusByHarnessKey: { alpha: "AVAILABLE", beta: "AVAILABLE" },
    });
    expect(selected.ok).toBe(true);
    if (selected.ok) expect(selected.candidate.harnessKey).toBe("beta");
  });

  it("falls through to a lower-scope route when the more specific harness is unavailable", () => {
    const selected = selectRoute({
      role: "worker",
      context: { workspaceId, projectId, operationId: null, profile: null },
      policies: [globalPolicy, projectPolicy],
      routes: [routes[0]!, routes[1]!, { ...routes[2]!, harnessId: alpha.id, modelId: alphaModel.id }],
      harnesses: [alpha, beta],
      models: [alphaModel, betaModel],
      statusByHarnessKey: { alpha: "QUOTA_EXHAUSTED", beta: "AVAILABLE" },
    });
    expect(selected.ok).toBe(true);
    if (selected.ok) expect(selected.candidate.harnessKey).toBe("beta");
  });
});

function route(policyId: RoutingPolicy["id"], harnessId: Harness["id"], modelId: Model["id"], priority: number): RoleRoute {
  return {
    id: newId<"RoleRouteId">(),
    routingPolicyId: policyId,
    role: "worker",
    harnessId,
    modelId,
    priority,
    createdAt: now,
  };
}
