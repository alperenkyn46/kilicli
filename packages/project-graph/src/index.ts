import type { KnowledgeClass, ProjectId, ProjectRelationId, WorkspaceId } from "@kilic/domain";

export type ProjectGraphEdge = {
  id: ProjectRelationId;
  workspaceId: WorkspaceId;
  sourceProjectId: ProjectId;
  targetProjectId: ProjectId;
  relationType: string;
  knowledgeClass: KnowledgeClass;
};

export type ProjectGraph = {
  projectIds: ProjectId[];
  edges: ProjectGraphEdge[];
};

export function buildProjectGraph(projectIds: ProjectId[], edges: ProjectGraphEdge[]): ProjectGraph {
  return {
    projectIds: [...projectIds],
    edges: [...edges],
  };
}

export function outgoingEdges(graph: ProjectGraph, projectId: ProjectId): ProjectGraphEdge[] {
  return graph.edges.filter((edge) => edge.sourceProjectId === projectId);
}

export function incomingEdges(graph: ProjectGraph, projectId: ProjectId): ProjectGraphEdge[] {
  return graph.edges.filter((edge) => edge.targetProjectId === projectId);
}
