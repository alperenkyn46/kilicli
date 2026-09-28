import { newId } from "@kilic/shared";
import { POLICY_ACTIONS, type PolicyEffect, type Repositories } from "@kilic/domain";

const HARNESS_SEEDS = [
  { key: "claude-code", displayName: "Claude Code" },
  { key: "codex", displayName: "Codex" },
  { key: "cursor", displayName: "Cursor" },
] as const;

const ALLOWED_ACTIONS = new Set<string>(["file_write", "build", "test", "lint", "local_analysis"]);

const ROUTED_ROLES = ["orchestrator", "worker"] as const;

/**
 * Configuration data, not kernel behavior. Provider names stay in this catalog.
 */
export async function seedFoundationCatalog(repos: Repositories): Promise<void> {
  const now = new Date();
  await repos.transaction(async (tx) => {
    const harnesses = [];
    for (const spec of HARNESS_SEEDS) {
      const existing = await tx.harnesses.getByKey(spec.key);
      if (existing) {
        harnesses.push(existing);
        continue;
      }
      const harness = {
        id: newId<"HarnessId">(),
        key: spec.key,
        displayName: spec.displayName,
        createdAt: now,
        updatedAt: now,
      };
      await tx.harnesses.insert(harness);
      harnesses.push(harness);
    }

    const models = [];
    for (const harness of harnesses) {
      const existing = await tx.models.findByHarnessAndKey(harness.id, "default");
      if (existing) {
        models.push(existing);
        continue;
      }
      const model = {
        id: newId<"ModelId">(),
        harnessId: harness.id,
        key: "default",
        displayName: "Default",
        createdAt: now,
        updatedAt: now,
      };
      await tx.models.insert(model);
      models.push(model);
    }

    const policies = await tx.routingPolicies.listEnabled();
    let policy = policies.find((item) => item.name === "foundation-global");
    if (!policy) {
      policy = {
        id: newId<"RoutingPolicyId">(),
        name: "foundation-global",
        scopeType: "global",
        workspaceId: null,
        projectId: null,
        operationId: null,
        executionProfile: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await tx.routingPolicies.insert(policy);
    }

    const routes = await tx.roleRoutes.list();
    for (const role of ROUTED_ROLES) {
      for (const [index, model] of models.entries()) {
        const priority = index + 1;
        const harness = harnesses[index];
        if (!harness) continue;
        const exists = routes.some(
          (route) =>
            route.routingPolicyId === policy.id &&
            route.role === role &&
            route.harnessId === harness.id &&
            route.priority === priority,
        );
        if (exists) continue;
        await tx.roleRoutes.insert({
          id: newId<"RoleRouteId">(),
          routingPolicyId: policy.id,
          role,
          harnessId: harness.id,
          modelId: model.id,
          priority,
          createdAt: now,
        });
      }
    }

    for (const action of POLICY_ACTIONS) {
      const existing = await tx.policyRules.findGlobal(action);
      if (existing) continue;
      const effect: PolicyEffect = ALLOWED_ACTIONS.has(action) ? "allow" : "require_approval";
      await tx.policyRules.insert({
        id: newId<"PolicyRuleId">(),
        scopeType: "global",
        workspaceId: null,
        projectId: null,
        action,
        effect,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}
