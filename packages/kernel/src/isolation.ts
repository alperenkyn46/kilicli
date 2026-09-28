import type { AccessMode, IsolationPlan } from "@kilic/domain";

export function planIsolation(input: {
  access: AccessMode;
  taskId: string;
  runId: string;
  baseRef: string;
}): IsolationPlan | null {
  if (input.access === "none") return null;
  if (input.access === "read_only") return { mode: "read_only" };
  return {
    mode: "worktree",
    branch: `kilic/${input.taskId}/${input.runId}`,
    baseRef: input.baseRef,
  };
}
