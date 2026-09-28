import { describe, expect, it } from "vitest";
import { newId } from "@kilic/shared";
import { createInMemoryRepositories } from "./in-memory.js";

describe("in-memory transactions", () => {
  it("rolls back a failed transaction and keeps earlier committed rows", async () => {
    const repos = createInMemoryRepositories();
    const now = new Date();
    const kept = newId<"UserId">();
    await repos.users.insert({ id: kept, displayName: "Kept", createdAt: now, updatedAt: now });

    const rolled = newId<"UserId">();
    await expect(
      repos.transaction(async (tx) => {
        await tx.users.insert({ id: rolled, displayName: "Rolled", createdAt: now, updatedAt: now });
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);

    expect(await repos.users.get(kept)).not.toBeNull();
    expect(await repos.users.get(rolled)).toBeNull();
  });
});
