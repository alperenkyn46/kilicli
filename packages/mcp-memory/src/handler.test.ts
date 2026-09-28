import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { MemoryService } from "@kilic/memory";
import { handleMemoryTool } from "./handler.js";

describe("memory protocol adapter", () => {
  it("delegates remember and rejects a database tool", async () => {
    const repos = createInMemoryRepositories();
    const now = new Date("2026-09-28T00:00:00.000Z");
    const workspaceId = newId<"WorkspaceId">();
    await repos.workspaces.insert({ id: workspaceId, name: "Ecosystem", slug: "ecosystem", createdAt: now, updatedAt: now });
    const memory = new MemoryService(repos, () => now);

    const result = await handleMemoryTool(memory, "memory.remember_fact", {
      scopeType: "workspace",
      workspaceId,
      title: "Tercih",
      body: "Kısa özet yaz.",
      knowledgeClass: "authoritative",
      language: "tr",
    });
    expect(result.content[0]?.text).toContain("Kısa özet yaz.");
    await expect(handleMemoryTool(memory, "query", { sql: "select * from users" })).rejects.toThrow(/Unknown memory tool/);
  });
});
