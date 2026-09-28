import type { RuntimeAdapter } from "@kilic/runtime-contract";

export const harnessKey = "claude-code" as const;
export const implementationStatus = "not_implemented" as const;

export type FutureClaudeAdapter = RuntimeAdapter;
