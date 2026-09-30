import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { asId, DomainError, type Clock } from "@kilic/shared";
import type { ExecutionNodeId, Repositories } from "@kilic/domain";
import { MemoryService } from "@kilic/memory";
import type { EffectExecutionPort } from "./effect-executor.js";

/** Explicit file allowlist for the first live slice; no shell or mutation executor. */
export class ReadOnlyEffectExecutor implements EffectExecutionPort {
  constructor(private readonly deps: { repos: Repositories; clock: Clock; nodeId: ExecutionNodeId;
    bootId: string; allowedFiles: readonly string[] }) {}
  async execute(input: Parameters<EffectExecutionPort["execute"]>[0]): Promise<unknown> {
    const { repos, clock, nodeId, bootId } = this.deps;
    const job = await repos.executionJobs.get(input.executionJobId);
    const grant = await repos.effectGrants.get(asId<"EffectGrantId">(input.grantId, "grantId"));
    const node = await repos.executionNodes.get(nodeId);
    if (!job || job.status !== "running" || job.executionNodeId !== nodeId || job.claimEpoch !== bootId ||
      node?.bootId !== bootId || !job.leaseUntil || job.leaseUntil <= clock() ||
      !grant || !grant.consumedAt || grant.expiresAt <= clock() || grant.executionJobId !== job.id ||
      grant.action !== input.request.action || grant.resource !== input.request.resource || grant.requestKey !== input.request.idempotencyKey) {
      throw new DomainError("FORBIDDEN", "Broker execution requires an exact current grant and node lease");
    }
    if (input.request.action !== "local_analysis") throw new DomainError("UNSUPPORTED_EFFECT", "This executor cannot mutate resources");
    if (input.request.resource.startsWith("memory:")) {
      const memory = new MemoryService(repos, clock);
      return memory.getInContext(asId<"MemoryItemId">(input.request.resource.slice(7), "memoryId"), {
        workspaceId: job.workspaceId, ...(job.projectId ? { projectId: job.projectId } : {}),
        ...(job.operationId ? { operationId: job.operationId } : {}), ...(job.taskId ? { taskId: job.taskId } : {}),
        ...(job.agentRunId ? { agentRunId: job.agentRunId } : {}),
      });
    }
    if (!input.request.resource.startsWith("file:") || !job.repositoryId) throw new DomainError("FORBIDDEN", "Repository file resource is required");
    const file = input.request.resource.slice(5);
    if (isAbsolute(file) || !this.deps.allowedFiles.includes(file)) throw new DomainError("FORBIDDEN", "File is outside the explicit read allowlist");
    const checkout = await repos.repositoryCheckouts.find(job.repositoryId, nodeId);
    if (!checkout || checkout.status !== "present") throw new DomainError("NOT_FOUND", "Repository checkout is missing");
    let directory = checkout.localPath;
    if (job.agentRunId) {
      const run = await repos.agentRuns.get(job.agentRunId);
      if (run?.isolation?.mode === "worktree") {
        const worktree = await repos.worktrees.findActiveByRun(job.agentRunId);
        if (!worktree || worktree.repositoryId !== job.repositoryId || worktree.executionNodeId !== nodeId) throw new DomainError("FORBIDDEN", "Worktree scope does not match execution");
        directory = worktree.path;
      }
    }
    const root = await realpath(directory);
    const target = await realpath(resolve(root, file));
    const path = relative(root, target);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new DomainError("FORBIDDEN", "File escapes the repository checkout");
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 64_000) throw new DomainError("FORBIDDEN", "Only bounded text files can be read");
      const buffer = Buffer.alloc(64_001);
      const result = await handle.read(buffer, 0, buffer.length, 0);
      if (result.bytesRead > 64_000 || buffer.subarray(0, result.bytesRead).includes(0)) throw new DomainError("FORBIDDEN", "File is too large or binary");
      return { path: file, text: buffer.subarray(0, result.bytesRead).toString("utf8") };
    } finally { await handle.close(); }
  }
}
