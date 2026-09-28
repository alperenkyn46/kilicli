import { homedir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createDatabase, createPostgresRepositories } from "@kilic/db";
import { ExecutionControl, Kernel } from "@kilic/kernel";
import { createConsoleLogger } from "@kilic/observability";
import { systemClock } from "@kilic/shared";
import { ExecutionPlane } from "./execution.js";
import { loadOrCreateMachineIdentity } from "./identity.js";
import { RuntimeAdapterRegistry } from "./registry.js";
import { createDaemonApp } from "./server.js";
import { GitWorktreeManager } from "./worktree.js";

const host = process.env.KILIC_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.KILIC_DAEMON_PORT ?? 4011);
const identity = await loadOrCreateMachineIdentity(
  process.env.KILIC_MACHINE_IDENTITY_PATH ?? join(homedir(), ".kilic", "execution-node.json"),
);

let execution: ExecutionPlane | null = null;
let runtime: RuntimeAdapterRegistry | null = null;
if (process.env.DATABASE_URL) {
  const database = createDatabase(process.env.DATABASE_URL);
  const repos = createPostgresRepositories(database.db);
  runtime = new RuntimeAdapterRegistry();
  const kernel = new Kernel({
    repos,
    runtime,
    clock: systemClock,
    logger: createConsoleLogger("kilicd"),
  });
  const node = await kernel.registerExecutionNode({
    machineKey: identity.machineKey,
    displayName: identity.displayName,
    hostname: identity.displayName,
    kind: "local",
    status: "online",
  });
  const bootId = crypto.randomUUID();
  const control = new ExecutionControl(repos, systemClock);
  await control.rotateBoot(node.id, bootId);
  execution = new ExecutionPlane({
    control,
    runtime,
    worktrees: new GitWorktreeManager(),
    worktreeRoot: process.env.KILIC_WORKTREE_ROOT ?? join(homedir(), ".kilic", "worktrees"),
    bootId,
  });
}

const app = createDaemonApp({ identity, execution, runtime });
serve({ fetch: app.fetch, hostname: host, port }, () => {
  console.log(JSON.stringify({ service: "daemon", role: "execution-plane", host, port }));
});
