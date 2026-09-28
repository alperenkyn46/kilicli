import { Hono } from "hono";
import { asId, isDomainError } from "@kilic/shared";
import type { RuntimeStatusProbe } from "@kilic/kernel";
import type { ExecutionPlane } from "./execution.js";
import type { MachineIdentity } from "./identity.js";

export function createDaemonApp(deps: {
  identity: MachineIdentity;
  execution: ExecutionPlane | null;
  runtime: RuntimeStatusProbe | null;
}): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "daemon",
      role: "execution-plane",
      machineKey: deps.identity.machineKey,
      database: deps.execution ? "connected" : "absent",
    }),
  );

  app.get("/v1/node", (c) =>
    c.json({
      machineKey: deps.identity.machineKey,
      displayName: deps.identity.displayName,
      kind: "local",
    }),
  );

  app.get("/v1/runtimes/:harnessKey/status", async (c) => {
    const status = deps.runtime ? await deps.runtime.status(c.req.param("harnessKey")) : "OFFLINE";
    return c.json({ status });
  });

  app.post("/v1/runtime-sessions/:sessionId/open", async (c) => {
    if (!deps.execution) {
      return c.json({ error: { code: "NO_DATABASE", message: "DATABASE_URL is required" } }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as { closePreviousSessionId?: string | null };
    const opened = await deps.execution.openMind(
      asId<"RuntimeSessionId">(c.req.param("sessionId"), "sessionId"),
      body.closePreviousSessionId
        ? asId<"RuntimeSessionId">(body.closePreviousSessionId, "closePreviousSessionId")
        : null,
    );
    return c.json(opened);
  });

  app.post("/v1/runtime-sessions/:sessionId/resume", async (c) => {
    if (!deps.execution) {
      return c.json({ error: { code: "NO_DATABASE", message: "DATABASE_URL is required" } }, 503);
    }
    const result = await deps.execution.resumeMind(asId<"RuntimeSessionId">(c.req.param("sessionId"), "sessionId"));
    return c.json(result);
  });

  app.post("/v1/runs/:runId/materialize", async (c) => {
    if (!deps.execution) {
      return c.json({ error: { code: "NO_DATABASE", message: "DATABASE_URL is required" } }, 503);
    }
    const body = (await c.req.json()) as { repositoryId?: string };
    if (!body.repositoryId) {
      return c.json({ error: { code: "INVALID_TEXT", message: "repositoryId is required" } }, 422);
    }
    const result = await deps.execution.materialize({
      runId: asId<"AgentRunId">(c.req.param("runId"), "runId"),
      repositoryId: asId<"RepositoryId">(body.repositoryId, "repositoryId"),
    });
    return c.json(result);
  });

  app.onError((error, c) => {
    if (isDomainError(error)) {
      const status = error.code === "NOT_FOUND" ? 404 : 422;
      return c.json({ error: { code: error.code, message: error.message } }, status);
    }
    console.error(error);
    return c.json({ error: { code: "INTERNAL", message: "Internal error" } }, 500);
  });

  return app;
}
