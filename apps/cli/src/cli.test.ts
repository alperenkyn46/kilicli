import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";

describe("kilic cli", () => {
  it("prints daemon health", async () => {
    const lines: string[] = [];
    const code = await runCli(
      ["status"],
      { KILIC_DAEMON_URL: "http://daemon.local" },
      (async () =>
        new Response(JSON.stringify({ role: "execution-plane", machineKey: "machine-1", database: "connected" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
      (line) => lines.push(line),
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("machine     machine-1");
  });

  it("fails clearly when the daemon is down", async () => {
    const errors: string[] = [];
    const code = await runCli(
      ["status"],
      {},
      (async () => {
        throw new Error("connect ECONNREFUSED");
      }) as typeof fetch,
      () => {},
      (line) => errors.push(line),
    );
    expect(code).toBe(1);
    expect(errors[0]).toContain("daemon is not running");
  });
});
