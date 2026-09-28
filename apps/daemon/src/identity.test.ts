import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadOrCreateMachineIdentity } from "./identity.js";

const directories: string[] = [];
const tempRoot = fileURLToPath(new URL("../../../.tmp/daemon", import.meta.url));

describe("machine identity", () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("reuses the same machine key", async () => {
    await mkdir(tempRoot, { recursive: true });
    const directory = await mkdtemp(join(tempRoot, "kilic-node-"));
    directories.push(directory);
    const filePath = join(directory, "execution-node.json");
    const first = await loadOrCreateMachineIdentity(filePath);
    const second = await loadOrCreateMachineIdentity(filePath);
    expect(second).toEqual(first);
  });
});
