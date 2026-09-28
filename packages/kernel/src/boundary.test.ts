import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const forbidden = ["claude", "codex", "cursor", "anthropic", "openai"];

describe("kernel provider boundary", () => {
  it("keeps provider names out of kernel source", () => {
    const files = readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    const corpus = files.map((file) => readFileSync(join(sourceDirectory, file), "utf8").toLowerCase()).join("\n");
    for (const name of forbidden) {
      expect(corpus.includes(name), name).toBe(false);
    }
  });
});
