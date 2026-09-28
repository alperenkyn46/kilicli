import { DomainError, newId, type Clock } from "@kilic/shared";
import { buildEvent, principalKey, type Approval, type EffectGrant, type ExecutionJobId, type Principal, type Repositories } from "@kilic/domain";
import type { EffectRequest, EffectResolution } from "@kilic/runtime-contract";
import { evaluatePolicy } from "./policy.js";

export interface EffectAuthorizationPort {
  authorize(principal: Principal, jobId: ExecutionJobId, request: EffectRequest): Promise<EffectResolution>;
}

/** The adapter must pause the requested tool until this boundary returns. */
export class EffectAuthorization implements EffectAuthorizationPort {
  constructor(private readonly repos: Repositories, private readonly clock: Clock) {}

  async authorize(principal: Principal, jobId: ExecutionJobId, request: EffectRequest): Promise<EffectResolution> {
    const job = await this.repos.executionJobs.get(jobId);
    if (!job || job.status !== "running") throw new DomainError("INVALID_TRANSITION", "Only a running execution can request an effect");
    if (principal.kind !== "tool" || principal.executionJobId !== job.id || principal.agentRunId !== job.agentRunId || principal.workspaceId !== job.workspaceId || principal.projectId !== job.projectId || principal.operationId !== job.operationId || principal.taskId !== job.taskId) {
      throw new DomainError("FORBIDDEN", "Tool principal is outside the execution scope");
    }
    if (!request.idempotencyKey.trim() || !request.action.trim() || !request.resource.trim()) throw new DomainError("INVALID_TEXT", "Effect request needs an exact key, action, and resource");
    const existing = await this.repos.effectGrants.getByRequest(job.id, request.idempotencyKey);
    if (existing) {
      if (existing.action !== request.action || existing.resource !== request.resource || existing.principalKey !== principalKey(principal)) throw new DomainError("CONFLICT", "Effect request key changed meaning");
      return { decision: "deny", reason: "Effect request was already consumed" };
    }
    const rules = await this.repos.policyRules.list();
    const decision = evaluatePolicy({ action: request.action, rules, context: { workspaceId: job.workspaceId, projectId: job.projectId } });
    if (decision.effect === "deny") return { decision: "deny", reason: "Policy denies this effect" };

    const priorApproval = await this.repos.approvals.findEffectRequest(job.id, request.idempotencyKey);
    if (decision.effect === "require_approval") {
      if (priorApproval) {
        if (priorApproval.action !== request.action || priorApproval.payload.resource !== request.resource) throw new DomainError("CONFLICT", "Approval request key changed meaning");
        if (priorApproval.status === "rejected") return { decision: "deny", reason: "User rejected this effect" };
        if (priorApproval.status !== "approved") return { decision: "require_approval", approvalId: priorApproval.id };
      } else {
        const now = this.clock();
        const approval: Approval = {
          id: newId<"ApprovalId">(), policyRuleId: decision.ruleId, action: request.action, status: "pending",
          workspaceId: job.workspaceId, projectId: job.projectId, operationId: job.operationId,
          taskId: job.taskId, requestedByRunId: job.agentRunId, correlationId: job.correlationId,
          payload: { executionJobId: job.id, requestKey: request.idempotencyKey, resource: request.resource, description: request.description, principalKey: principalKey(principal) },
          createdAt: now, decidedAt: null,
        };
        await this.repos.transaction(async (repos) => {
          await repos.approvals.insert(approval);
          await repos.events.append(buildEvent({ type: "effect.approval_requested", workspaceId: job.workspaceId, projectId: job.projectId,
            aggregateType: "approval", aggregateId: approval.id, correlationId: job.correlationId, causationId: job.causationId,
            agentRunId: job.agentRunId, runtimeSessionId: job.runtimeSessionId, occurredAt: now,
            payload: { action: request.action, resource: request.resource, requestKey: request.idempotencyKey },
          }));
        });
        return { decision: "require_approval", approvalId: approval.id };
      }
    }

    const now = this.clock();
    const grant: EffectGrant = {
      id: newId<"EffectGrantId">(), principalKey: principalKey(principal), executionJobId: job.id,
      agentRunId: job.agentRunId, action: request.action, resource: request.resource,
      requestKey: request.idempotencyKey, expiresAt: new Date(now.getTime() + 5 * 60_000),
      consumedAt: null, createdAt: now,
    };
    await this.repos.transaction(async (repos) => {
      const stored = await repos.effectGrants.insert(grant);
      if (stored.id !== grant.id || !(await repos.effectGrants.consume(grant.id, now))) throw new DomainError("CONFLICT", "Effect grant was already consumed");
      await repos.events.append(buildEvent({ type: "effect.authorized", workspaceId: job.workspaceId, projectId: job.projectId,
        aggregateType: "effect_grant", aggregateId: grant.id, correlationId: job.correlationId,
        causationId: priorApproval ? (await repos.events.listByAggregate("approval", priorApproval.id)).at(-1)?.id ?? job.causationId : job.causationId,
        agentRunId: job.agentRunId, runtimeSessionId: job.runtimeSessionId, occurredAt: now,
        payload: { action: grant.action, resource: grant.resource, requestKey: grant.requestKey, principalKey: grant.principalKey },
      }));
    });
    return { decision: "allow", grantId: grant.id };
  }
}
