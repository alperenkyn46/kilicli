import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import { parseProjectIdentity } from "./project-identity.js";

describe("project identity file", () => {
  it("accepts only workspace and project ids", () => {
    const workspaceId = newId<"WorkspaceId">();
    const projectId = newId<"ProjectId">();
    expect(parseProjectIdentity({ workspaceId, projectId })).toEqual({ workspaceId, projectId });
  });

  it("rejects memory stuffed into the identity file", () => {
    expect(() =>
      parseProjectIdentity({
        workspaceId: newId<"WorkspaceId">(),
        projectId: newId<"ProjectId">(),
        architecture: "do not store this here",
      }),
    ).toThrow(/only workspaceId and projectId/);
  });
});
