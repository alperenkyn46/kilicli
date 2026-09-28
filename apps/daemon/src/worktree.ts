import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DomainError } from "@kilic/shared";

const exec = promisify(execFile);

export type WorktreeCreate = {
  repositoryRoot: string;
  worktreePath: string;
  branch: string;
  baseRef: string;
};

export class GitWorktreeManager {
  async create(input: WorktreeCreate): Promise<void> {
    assertWorkerBranch(input.branch);
    const existing = await this.branchExists(input.repositoryRoot, input.branch);
    if (existing) {
      await exec("git", ["worktree", "add", input.worktreePath, input.branch], { cwd: input.repositoryRoot });
      return;
    }
    await exec("git", ["worktree", "add", "-b", input.branch, input.worktreePath, input.baseRef], {
      cwd: input.repositoryRoot,
    });
  }

  private async branchExists(repositoryRoot: string, branch: string): Promise<boolean> {
    try {
      await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repositoryRoot });
      return true;
    } catch {
      return false;
    }
  }

  async remove(input: { repositoryRoot: string; worktreePath: string }): Promise<void> {
    await exec("git", ["worktree", "remove", "--force", input.worktreePath], {
      cwd: input.repositoryRoot,
    });
  }
}

export function assertWorkerBranch(branch: string): void {
  if (!branch.startsWith("kilic/") || branch.includes("..") || /\s/.test(branch)) {
    throw new DomainError("INVALID_BRANCH", "Worker branches must stay under kilic/");
  }
}
