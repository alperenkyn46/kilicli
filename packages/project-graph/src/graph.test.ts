import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import { buildProjectGraph, incomingEdges, outgoingEdges } from "./index.js";

describe("project graph", () => {
  it("keeps directed relations addressable without inferring impact", () => {
    const workspaceId = newId<"WorkspaceId">();
    const backend = newId<"ProjectId">();
    const web = newId<"ProjectId">();
    const graph = buildProjectGraph(
      [backend, web],
      [
        {
          id: newId<"ProjectRelationId">(),
          workspaceId,
          sourceProjectId: backend,
          targetProjectId: web,
          relationType: "api_provider",
          knowledgeClass: "authoritative",
        },
      ],
    );

    expect(outgoingEdges(graph, backend)).toHaveLength(1);
    expect(incomingEdges(graph, web)).toHaveLength(1);
    expect(outgoingEdges(graph, web)).toHaveLength(0);
  });
});
