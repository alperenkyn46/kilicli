import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";
import { DomainError } from "@kilic/shared";

const exec = promisify(execFile);

export type WorktreeCreate = {
  repositoryRoot: string;
  worktreePath: string;
  branch: string;
  baseRef: string;
  allowExistingBranch?: boolean;
};

export class GitWorktreeManager {
  async create(input: WorktreeCreate): Promise<void> {
    assertWorkerBranch(input.branch);
    const existing = await this.branchExists(input.repositoryRoot, input.branch);
    if (existing) {
      if (!input.allowExistingBranch) throw new DomainError("CONFLICT", "Worker branch already exists without an explicit retry");
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

  async pruneMissing(input: { repositoryRoot: string; worktreePath: string }): Promise<void> {
    if (await this.exists(input.worktreePath)) throw new DomainError("CONFLICT", "Worktree path still exists");
    await exec("git", ["worktree", "prune", "--expire", "now"], { cwd: input.repositoryRoot });
    const { stdout } = await exec("git", ["worktree", "list", "--porcelain"], { cwd: input.repositoryRoot });
    if (stdout.split("\n").includes(`worktree ${input.worktreePath}`)) {
      throw new DomainError("CONFLICT", "Git still tracks the missing worktree");
    }
  }

  async exists(path: string): Promise<boolean> {
    try { await stat(path); return true; } catch { return false; }
  }

  async assertOwned(input: { worktreePath: string; branch: string; requireClean?: boolean }): Promise<void> {
    const [{ stdout: root }, { stdout: branch }, { stdout: status }] = await Promise.all([
      exec("git", ["rev-parse", "--show-toplevel"], { cwd: input.worktreePath }),
      exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: input.worktreePath }),
      exec("git", ["status", "--porcelain"], { cwd: input.worktreePath }),
    ]);
    if (root.trim() !== input.worktreePath || branch.trim() !== input.branch) throw new DomainError("CONFLICT", "Worktree path or branch ownership changed");
    if (input.requireClean && status.trim()) throw new DomainError("CONFLICT", "Retry worktree contains uncommitted changes");
  }

  async listPaths(worktreeRoot: string): Promise<string[]> {
    try { return (await readdir(worktreeRoot, { withFileTypes: true })).filter((item) => item.isDirectory()).map((item) => `${worktreeRoot}/${item.name}`); }
    catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return []; throw error; }
  }

  async listWorkerBranches(repositoryRoot: string): Promise<string[]> {
    const { stdout } = await exec("git", ["branch", "--list", "kilic/*", "--format=%(refname:short)"], { cwd: repositoryRoot });
    return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  }
}

export function assertWorkerBranch(branch: string): void {
  if (!branch.startsWith("kilic/") || branch.includes("..") || /\s/.test(branch)) {
    throw new DomainError("INVALID_BRANCH", "Worker branches must stay under kilic/");
  }
}
