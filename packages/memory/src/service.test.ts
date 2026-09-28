import { describe, expect, it } from "vitest";
import { newId, type Clock } from "@kilic/shared";
import { createInMemoryRepositories } from "@kilic/db/in-memory";
import { MemoryService } from "./service.js";

describe("memory scope", () => {
  it("keeps another project's records out of the current search and preserves Turkish", async () => {
    const repos = createInMemoryRepositories();
    const now = new Date("2026-09-28T00:00:00.000Z");
    const userId = newId<"UserId">();
    const workspaceId = newId<"WorkspaceId">();
    const webId = newId<"ProjectId">();
    const tvId = newId<"ProjectId">();
    await repos.users.insert({ id: userId, displayName: "Alperen", createdAt: now, updatedAt: now });
    await repos.workspaces.insert({ id: workspaceId, name: "Ecosystem", slug: "ecosystem", createdAt: now, updatedAt: now });
    await repos.projects.insert({ id: webId, workspaceId, name: "Web", slug: "web", createdAt: now, updatedAt: now });
    await repos.projects.insert({ id: tvId, workspaceId, name: "TV", slug: "tv", createdAt: now, updatedAt: now });

    const memory = new MemoryService(repos, frozenClock());
    await memory.remember({
      scopeType: "project",
      workspaceId,
      projectId: webId,
      kind: "fact",
      title: "Oturum sınırı",
      body: "Web oturumu çerez ile yenilenir.",
      language: "tr",
      knowledgeClass: "authoritative",
    });
    await memory.remember({
      scopeType: "project",
      workspaceId,
      projectId: tvId,
      kind: "fact",
      title: "TV oturumu",
      body: "TV cihazında çerez yok.",
      language: "tr",
      knowledgeClass: "authoritative",
    });

    const found = await memory.search({ userId, workspaceId, projectId: webId, text: "çerez" });
    expect(found.map((item) => item.title)).toEqual(["Oturum sınırı"]);
    expect(found[0]?.body).toContain("çerez");
  });
});

function frozenClock(): Clock {
  return () => new Date("2026-09-28T00:00:00.000Z");
}
