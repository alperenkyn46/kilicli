import { asId } from "@kilic/shared";
import type { ExecutionNodeId, OperationId, OrchestratorId, RuntimeSessionId } from "@kilic/domain";
import type { Kernel, MindPlan } from "@kilic/kernel";

export type MindRuntimeClient = {
  openMind(sessionId: RuntimeSessionId, closePreviousSessionId?: RuntimeSessionId | null): Promise<unknown>;
  resumeMind(sessionId: RuntimeSessionId): Promise<{ status: "resumed" | "stale" }>;
};

/**
 * Control API orchestration. Kernel writes the plan. The execution plane opens the process.
 */
export async function requestMindSession(
  kernel: Kernel,
  execution: MindRuntimeClient,
  input: {
    orchestratorId: OrchestratorId;
    executionNodeId: ExecutionNodeId;
    contextHealth: "healthy" | "degraded";
    explicitSwitch: boolean;
    operationId?: string | null;
  },
): Promise<{ action: "reused" | "reconstructed"; reason: string | null; plan: MindPlan }> {
  const operationId = input.operationId ? asId<"OperationId">(input.operationId, "operationId") : null;
  let plan = await createPlan(kernel, input, operationId);

  if (plan.action === "resume") {
    const resumed = await execution.resumeMind(plan.session.id);
    if (resumed.status === "resumed") return { action: "reused", reason: null, plan };
    plan = await createPlan(kernel, { ...input, explicitSwitch: false }, operationId);
  }

  if (plan.action !== "open") {
    throw new Error("Mind plan did not produce a session to open");
  }
  await execution.openMind(plan.session.id, plan.closePreviousSessionId);
  return { action: "reconstructed", reason: plan.reason, plan };
}

function createPlan(
  kernel: Kernel,
  input: {
    orchestratorId: OrchestratorId;
    executionNodeId: ExecutionNodeId;
    contextHealth: "healthy" | "degraded";
    explicitSwitch: boolean;
  },
  operationId: OperationId | null,
) {
  return kernel.planMindSession({
    orchestratorId: input.orchestratorId,
    executionNodeId: input.executionNodeId,
    contextHealth: input.contextHealth,
    explicitSwitch: input.explicitSwitch,
    operationId,
  });
}
