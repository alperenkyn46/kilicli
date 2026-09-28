import { describe, expect, it } from "vitest";
import { asId, newId } from "./ids.js";
import { DomainError } from "./errors.js";

describe("ids", () => {
  it("issues uuid identifiers", () => {
    const id = newId<"user">();
    expect(asId(id, "user")).toBe(id);
  });

  it("rejects non-uuid identifiers", () => {
    expect(() => asId("user-1", "user")).toThrow(DomainError);
  });
});
