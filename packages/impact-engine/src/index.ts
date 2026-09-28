import type { ProjectId, WorkspaceId } from "@kilic/domain";

/**
 * Input shape reserved for a future impact analysis.
 * No algorithm is implemented: KILIC_ARCHITECTURE.md §89 still lists the
 * impact analysis algorithm as undesigned, and automatic discovery is out of
 * this foundation phase.
 */
export type ImpactAnalysisInput = {
  workspaceId: WorkspaceId;
  sourceProjectId: ProjectId;
  change:
    | { kind: "contract_changed"; contractName: string }
    | { kind: "repository_changed"; paths: string[] };
};

export type ImpactReason = {
  projectId: ProjectId;
  relationType: string;
  knowledgeClass: "authoritative" | "inferred" | "historical";
};

export type ImpactReport = {
  sourceProjectId: ProjectId;
  directlyAffectedProjectIds: ProjectId[];
  potentiallyAffectedProjectIds: ProjectId[];
  reasons: ImpactReason[];
};

export const impactEngineStatus = "not_implemented" as const;
