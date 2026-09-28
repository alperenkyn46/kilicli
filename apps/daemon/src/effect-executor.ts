import { DomainError } from "@kilic/shared";
import type { ExecutionJobId } from "@kilic/domain";
import type { EffectRequest } from "@kilic/runtime-contract";

/** Only this execution-plane port may perform a broker-authorized effect. */
export interface EffectExecutionPort {
  execute(input: { executionJobId: ExecutionJobId; grantId: string; request: EffectRequest }): Promise<unknown>;
}

/** Until effect-specific executors are installed, authorization never implies execution. */
export class RejectingEffectExecutor implements EffectExecutionPort {
  async execute(): Promise<never> {
    throw new DomainError("UNSUPPORTED_EFFECT", "No brokered executor is registered for this effect");
  }
}
