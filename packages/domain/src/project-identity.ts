import { asId, DomainError } from "@kilic/shared";
import type { ProjectId, WorkspaceId } from "./ids.js";

/** Identity file allowed inside a managed repository. It is not project memory. */
export const PROJECT_IDENTITY_PATH = ".kilic/project.json";

export type ProjectIdentityFile = {
  workspaceId: WorkspaceId;
  projectId: ProjectId;
};

const ALLOWED_KEYS = new Set(["workspaceId", "projectId"]);

export function parseProjectIdentity(input: unknown): ProjectIdentityFile {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new DomainError("INVALID_IDENTITY", "project.json must be an object");
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const unexpected = keys.filter((key) => !ALLOWED_KEYS.has(key));
  if (unexpected.length > 0 || !keys.includes("workspaceId") || !keys.includes("projectId")) {
    throw new DomainError(
      "INVALID_IDENTITY",
      "project.json may contain only workspaceId and projectId",
    );
  }

  if (typeof record.workspaceId !== "string" || typeof record.projectId !== "string") {
    throw new DomainError("INVALID_IDENTITY", "workspaceId and projectId must be strings");
  }

  return {
    workspaceId: asId<"WorkspaceId">(record.workspaceId, "workspaceId"),
    projectId: asId<"ProjectId">(record.projectId, "projectId"),
  };
}
