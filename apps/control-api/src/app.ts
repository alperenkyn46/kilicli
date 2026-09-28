import { Hono } from "hono";
import { z } from "zod";
import { asId, isDomainError } from "@kilic/shared";
import type { Kernel } from "@kilic/kernel";

const uuid = z.string().uuid();

export function createControlApp(kernel: Kernel): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "control-api", role: "control-plane" }));

  app.post("/v1/users", async (c) => {
    const body = userBody.parse(await c.req.json());
    return c.json(await kernel.createUser(body), 201);
  });

  app.post("/v1/workspaces", async (c) => {
    const body = workspaceBody.parse(await c.req.json());
    return c.json(
      await kernel.createWorkspace({
        name: body.name,
        slug: body.slug,
        ownerUserId: asId<"UserId">(body.ownerUserId, "ownerUserId"),
      }),
      201,
    );
  });

  app.post("/v1/execution-nodes", async (c) => {
    const body = nodeBody.parse(await c.req.json());
    return c.json(await kernel.registerExecutionNode(body), 201);
  });

  app.post("/v1/workspaces/:workspaceId/projects", async (c) => {
    const body = projectBody.parse(await c.req.json());
    return c.json(
      await kernel.createProject({
        workspaceId: asId<"WorkspaceId">(uuid.parse(c.req.param("workspaceId")), "workspaceId"),
        ...body,
      }),
      201,
    );
  });

  app.post("/v1/projects/:projectId/repositories", async (c) => {
    const body = repositoryBody.parse(await c.req.json());
    return c.json(
      await kernel.attachRepository({
        projectId: asId<"ProjectId">(uuid.parse(c.req.param("projectId")), "projectId"),
        ...body,
      }),
      201,
    );
  });

  app.post("/v1/orchestrators", async (c) => {
    const body = orchestratorBody.parse(await c.req.json());
    return c.json(
      await kernel.ensureOrchestrator({
        workspaceId: asId<"WorkspaceId">(body.workspaceId, "workspaceId"),
        kind: body.kind,
        projectId: body.projectId ? asId<"ProjectId">(body.projectId, "projectId") : null,
        ...(body.displayName ? { displayName: body.displayName } : {}),
      }),
      201,
    );
  });

  app.post("/v1/operations", async (c) => {
    const body = operationBody.parse(await c.req.json());
    return c.json(
      await kernel.createOperation({
        workspaceId: asId<"WorkspaceId">(body.workspaceId, "workspaceId"),
        title: body.title,
        description: body.description,
        language: body.language,
      }),
      201,
    );
  });

  app.post("/v1/operations/:operationId/tasks", async (c) => {
    const body = taskBody.parse(await c.req.json());
    return c.json(
      await kernel.createTask({
        operationId: asId<"OperationId">(uuid.parse(c.req.param("operationId")), "operationId"),
        projectId: asId<"ProjectId">(body.projectId, "projectId"),
        title: body.title,
        description: body.description,
        language: body.language,
        acceptanceCriteria: body.acceptanceCriteria,
      }),
      201,
    );
  });

  app.post("/v1/policy/evaluate", async (c) => {
    const body = policyBody.parse(await c.req.json());
    return c.json(
      await kernel.evaluateAction({
        action: body.action,
        workspaceId: asId<"WorkspaceId">(body.workspaceId, "workspaceId"),
        projectId: body.projectId ? asId<"ProjectId">(body.projectId, "projectId") : null,
      }),
    );
  });

  app.post("/v1/workforce/dispatch", async (c) => {
    const body = dispatchBody.parse(await c.req.json());
    return c.json(
      await kernel.dispatchWorker({
        taskId: asId<"TaskId">(body.taskId, "taskId"),
        role: body.role,
        access: body.access,
        action: body.action,
        executionNodeId: asId<"ExecutionNodeId">(body.executionNodeId, "executionNodeId"),
        baseRef: body.baseRef,
        approvalId: body.approvalId ? asId<"ApprovalId">(body.approvalId, "approvalId") : null,
      }),
    );
  });

  app.post("/v1/checkpoints", async (c) => {
    const body = checkpointBody.parse(await c.req.json());
    return c.json(
      await kernel.recordCheckpoint({
        orchestratorId: asId<"OrchestratorId">(body.orchestratorId, "orchestratorId"),
        runtimeSessionId: body.runtimeSessionId ? asId<"RuntimeSessionId">(body.runtimeSessionId, "runtimeSessionId") : null,
        operationId: body.operationId ? asId<"OperationId">(body.operationId, "operationId") : null,
        taskId: body.taskId ? asId<"TaskId">(body.taskId, "taskId") : null,
        trigger: body.trigger,
        state: body.state,
      }),
      201,
    );
  });

  app.onError((error, c) => {
    if (error instanceof z.ZodError) {
      return c.json(
        { error: { code: "INVALID_TEXT", message: error.issues.map((issue) => issue.message).join("; ") } },
        422,
      );
    }
    if (isDomainError(error)) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "FORBIDDEN" ? 403 : 422;
      return c.json({ error: { code: error.code, message: error.message } }, status);
    }
    console.error(error);
    return c.json({ error: { code: "INTERNAL", message: "Internal error" } }, 500);
  });

  return app;
}

const userBody = z.object({ displayName: z.string().min(1) });
const workspaceBody = z.object({ name: z.string().min(1), slug: z.string().min(1), ownerUserId: uuid });
const nodeBody = z.object({
  machineKey: z.string().min(1),
  displayName: z.string().min(1),
  hostname: z.string().nullable().optional(),
  kind: z.enum(["local", "remote"]),
  status: z.enum(["online", "offline"]),
});
const projectBody = z.object({ name: z.string().min(1), slug: z.string().min(1) });
const repositoryBody = z.object({
  name: z.string().min(1),
  defaultBranch: z.string().min(1),
  remoteUrl: z.string().nullable().optional(),
});
const orchestratorBody = z.object({
  workspaceId: uuid,
  kind: z.enum(["workspace", "project"]),
  projectId: uuid.nullable().optional(),
  displayName: z.string().min(1).optional(),
});
const operationBody = z.object({
  workspaceId: uuid,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
});
const taskBody = z.object({
  projectId: uuid,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  acceptanceCriteria: z.string().nullable().optional(),
});
const policyBody = z.object({
  action: z.string().min(1),
  workspaceId: uuid,
  projectId: uuid.nullable().optional(),
});
const dispatchBody = z.object({
  taskId: uuid,
  role: z.string().min(1),
  access: z.enum(["read_only", "write", "none"]),
  action: z.string().min(1),
  executionNodeId: uuid,
  baseRef: z.string().nullable().optional(),
  approvalId: uuid.nullable().optional(),
});
const checkpointBody = z.object({
  orchestratorId: uuid,
  runtimeSessionId: uuid.nullable().optional(),
  operationId: uuid.nullable().optional(),
  taskId: uuid.nullable().optional(),
  trigger: z.enum([
    "major_decision",
    "phase_completed",
    "before_compaction",
    "before_runtime_switch",
    "after_failed_attempt",
    "before_risky_change",
    "before_user_visible_completion",
  ]),
  state: z.object({
    phase: z.string().nullable(),
    completed: z.array(z.string()),
    remaining: z.array(z.string()),
    importantFiles: z.array(z.string()),
    risks: z.array(z.string()),
    notes: z.string().nullable(),
  }),
});
