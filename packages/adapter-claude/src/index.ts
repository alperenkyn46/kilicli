export const harnessKey = "claude-code" as const;
export const implementationStatus = "read_only_slice" as const;

export { ClaudeCodeAdapter, normalizeFailure, type SdkSession, type SdkQueryFactory } from "./adapter.js";
