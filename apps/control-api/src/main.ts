import { serve } from "@hono/node-server";
import { createDatabase, createPostgresRepositories } from "@kilic/db";
import { Kernel } from "@kilic/kernel";
import { createConsoleLogger } from "@kilic/observability";
import { systemClock } from "@kilic/shared";
import type { RuntimeStatus } from "@kilic/runtime-contract";
import { createControlApp } from "./app.js";
import { createLocalPrincipalResolver } from "./auth.js";
import { asId } from "@kilic/shared";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const daemonUrl = process.env.KILIC_DAEMON_URL ?? "http://127.0.0.1:4011";
const localUserId = process.env.KILIC_LOCAL_USER_ID;
const localUserToken = process.env.KILIC_LOCAL_USER_TOKEN;
const localServiceToken = process.env.KILIC_LOCAL_SERVICE_TOKEN;
if (!localUserId || !localUserToken || !localServiceToken) throw new Error("KILIC_LOCAL_USER_ID, KILIC_LOCAL_USER_TOKEN and KILIC_LOCAL_SERVICE_TOKEN are required");
const resolvePrincipal = createLocalPrincipalResolver({ userId: asId<"UserId">(localUserId, "KILIC_LOCAL_USER_ID"), userToken: localUserToken, serviceToken: localServiceToken });
const database = createDatabase(connectionString);
const kernel = new Kernel({
  repos: createPostgresRepositories(database.db),
  runtime: {
    async status(harnessKey: string): Promise<RuntimeStatus> {
      try {
        const response = await fetch(`${daemonUrl}/v1/runtimes/${encodeURIComponent(harnessKey)}/status`, { headers: { authorization: `Bearer ${localServiceToken}` } });
        if (!response.ok) return "OFFLINE";
        const body = (await response.json()) as { status?: RuntimeStatus };
        return body.status ?? "OFFLINE";
      } catch {
        return "OFFLINE";
      }
    },
  },
  clock: systemClock,
  logger: createConsoleLogger("control-api"),
});

const host = process.env.KILIC_CONTROL_API_HOST ?? "127.0.0.1";
const port = Number(process.env.KILIC_CONTROL_API_PORT ?? 4010);
serve({ fetch: createControlApp(kernel, resolvePrincipal).fetch, hostname: host, port }, () => {
  console.log(JSON.stringify({ service: "control-api", role: "control-plane", host, port }));
});
