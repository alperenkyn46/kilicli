import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { Kernel } from "@kilic/kernel";
import { createSilentLogger } from "@kilic/observability";
import { createControlApp } from "./app.js";

describe("control api", () => {
  it("creates a user and workspace through the control plane", async () => {
    const kernel = new Kernel({
      repos: createInMemoryRepositories(),
      runtime: {
        async status() {
          return "OFFLINE" as const;
        },
      },
      clock: () => new Date("2026-09-28T00:00:00.000Z"),
      logger: createSilentLogger(),
    });
    const app = createControlApp(kernel);

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ role: "control-plane" });

    const userResponse = await app.request("/v1/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Alperen" }),
    });
    expect(userResponse.status).toBe(201);
    const user = (await userResponse.json()) as { id: string };

    const workspaceResponse = await app.request("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ecosystem", slug: "ecosystem", ownerUserId: user.id }),
    });
    expect(workspaceResponse.status).toBe(201);
    expect(await workspaceResponse.json()).toMatchObject({ slug: "ecosystem" });
  });
});
