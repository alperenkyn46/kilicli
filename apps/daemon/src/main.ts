import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createDatabase, createPostgresRepositories } from "@kilic/db";
import { EffectAuthorization, ExecutionControl, Kernel } from "@kilic/kernel";
import { createConsoleLogger } from "@kilic/observability";
import { systemClock } from "@kilic/shared";
import { ExecutionPlane } from "./execution.js";
import { RejectingEffectExecutor } from "./effect-executor.js";
import { loadOrCreateMachineIdentity } from "./identity.js";
import { RuntimeAdapterRegistry } from "./registry.js";
import { createDaemonApp } from "./server.js";
import { GitWorktreeManager } from "./worktree.js";

const host = process.env.KILIC_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.KILIC_DAEMON_PORT ?? 4011);
const serviceToken = process.env.KILIC_LOCAL_SERVICE_TOKEN;
if (!serviceToken) throw new Error("KILIC_LOCAL_SERVICE_TOKEN is required");
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
  const doctrineText = await readFile(fileURLToPath(new URL("../../../identity/AGENTS.md", import.meta.url)), "utf8");
  const control = new ExecutionControl(repos, systemClock, doctrineText);
  await control.rotateBoot(node.id, bootId);
  execution = new ExecutionPlane({
    control,
    runtime,
    effects: new EffectAuthorization(repos, systemClock),
    effectExecutor: new RejectingEffectExecutor(),
    handoffPlanner: kernel,
    worktrees: new GitWorktreeManager(),
    worktreeRoot: process.env.KILIC_WORKTREE_ROOT ?? join(homedir(), ".kilic", "worktrees"),
    bootId,
    nodeId: node.id,
  });
  const reconciliation = await execution.reconcileWorktrees();
  console.log(JSON.stringify({ service: "daemon", event: "worktree_reconciliation", ...reconciliation }));
  const handoffs = await execution.reconcileHandoffs();
  console.log(JSON.stringify({ service: "daemon", event: "handoff_reconciliation", ...handoffs }));
}

const app = createDaemonApp({ identity, execution, runtime, serviceToken });
serve({ fetch: app.fetch, hostname: host, port }, () => {
  console.log(JSON.stringify({ service: "daemon", role: "execution-plane", host, port }));
});
