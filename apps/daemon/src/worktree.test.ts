import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GitWorktreeManager } from "./worktree.js";

const exec = promisify(execFile);
const directories: string[] = [];
const tempRoot = fileURLToPath(new URL("../../../.tmp/daemon", import.meta.url));
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Kilic",
  GIT_AUTHOR_EMAIL: "kilic@example.com",
  GIT_COMMITTER_NAME: "Kilic",
  GIT_COMMITTER_EMAIL: "kilic@example.com",
};

describe("git worktree isolation", () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("creates a worker worktree and keeps the branch when the worktree is removed", async () => {
    const repositoryRoot = await temporaryDirectory();
    await exec("git", ["init", "-b", "main"], { cwd: repositoryRoot, env: gitEnv });
    await writeFile(join(repositoryRoot, "README.md"), "base\n");
    await exec("git", ["add", "README.md"], { cwd: repositoryRoot, env: gitEnv });
    await exec("git", ["commit", "-m", "base"], { cwd: repositoryRoot, env: gitEnv });

    const branch = "kilic/task/run";
    const parent = await temporaryDirectory();
    const worktreePath = join(parent, "worker");
    const manager = new GitWorktreeManager();
    await manager.create({ repositoryRoot, worktreePath, branch, baseRef: "main" });
    await writeFile(join(worktreePath, "change.txt"), "worker\n");

    await manager.remove({ repositoryRoot, worktreePath });
    await expect(exec("git", ["show-ref", "--verify", `refs/heads/${branch}`], { cwd: repositoryRoot })).resolves.toBeTruthy();
  });

  it("prunes stale Git metadata before a missing worktree can be retired", async () => {
    const repositoryRoot = await temporaryDirectory();
    await exec("git", ["init", "-b", "main"], { cwd: repositoryRoot, env: gitEnv });
    await writeFile(join(repositoryRoot, "README.md"), "base\n");
    await exec("git", ["add", "README.md"], { cwd: repositoryRoot, env: gitEnv });
    await exec("git", ["commit", "-m", "base"], { cwd: repositoryRoot, env: gitEnv });
    const branch = "kilic/task/stale";
    const worktreePath = join(await temporaryDirectory(), "worker");
    const manager = new GitWorktreeManager();
    await manager.create({ repositoryRoot, worktreePath, branch, baseRef: "main" });
    await rm(worktreePath, { recursive: true });
    await manager.pruneMissing({ repositoryRoot, worktreePath });
    const { stdout } = await exec("git", ["worktree", "list", "--porcelain"], { cwd: repositoryRoot });
    expect(stdout).not.toContain(`worktree ${worktreePath}`);
    await expect(exec("git", ["show-ref", "--verify", `refs/heads/${branch}`], { cwd: repositoryRoot })).resolves.toBeTruthy();
  });
});

async function temporaryDirectory(): Promise<string> {
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, "kilic-"));
  directories.push(directory);
  return directory;
}
