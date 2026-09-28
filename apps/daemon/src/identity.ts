import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

export type MachineIdentity = {
  machineKey: string;
  displayName: string;
};

export async function loadOrCreateMachineIdentity(filePath: string): Promise<MachineIdentity> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<MachineIdentity>;
    if (typeof parsed.machineKey === "string" && parsed.machineKey.length > 0 && typeof parsed.displayName === "string") {
      return { machineKey: parsed.machineKey, displayName: parsed.displayName };
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const identity = {
    machineKey: crypto.randomUUID(),
    displayName: hostname(),
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(identity, null, 2)}\n`);
  return identity;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
