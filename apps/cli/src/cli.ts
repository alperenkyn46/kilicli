export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
  write: (line: string) => void = console.log,
  writeError: (line: string) => void = console.error,
): Promise<number> {
  const command = argv[0] ?? "status";
  if (command === "help") {
    write("kilic status");
    write("status reads daemon health only. Orchestration commands go to the control API.");
    return 0;
  }
  if (command !== "status") {
    writeError(`Unknown command ${command}`);
    return 2;
  }

  const url = env.KILIC_DAEMON_URL ?? "http://127.0.0.1:4011";
  try {
    const response = await fetchImpl(`${url}/health`);
    if (!response.ok) {
      writeError("Kılıç daemon is not healthy");
      return 1;
    }
    const body = (await response.json()) as { role?: string; machineKey?: string; database?: string };
    write("KILIÇ");
    write("daemon      connected");
    write(`role        ${body.role ?? "execution-plane"}`);
    write(`machine     ${body.machineKey ?? "unknown"}`);
    write(`database    ${body.database ?? "unknown"}`);
    return 0;
  } catch {
    writeError("Kılıç daemon is not running. Start it with pnpm --filter @kilic/daemon start");
    return 1;
  }
}
