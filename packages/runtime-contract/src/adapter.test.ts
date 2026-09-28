import { describe, expect, it } from "vitest";
import { retryability } from "./adapter.js";

describe("normalized runtime status", () => {
  it("marks quota and auth as not retryable", () => {
    expect(retryability("QUOTA_EXHAUSTED")).toBe(false);
    expect(retryability("AUTH_REQUIRED")).toBe(false);
    expect(retryability("RATE_LIMITED")).toBe(true);
    expect(retryability("OFFLINE")).toBe(true);
    expect(retryability("FAILED")).toBe(true);
  });
});
