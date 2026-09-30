import { afterEach, describe, expect, it, vi } from "vitest";
import type { createSdkMcpServer, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { defineRuntimeAdapterConformance } from "@kilic/runtime-contract/conformance";
import { runtimeAdapterError, type AdapterConformanceHarness, type MockFailurePoint, type RuntimeFailureStatus, type StartSessionOptions } from "@kilic/runtime-contract";
import { ClaudeCodeAdapter, normalizeFailure, type SdkQueryFactory } from "./adapter.js";

type ToolDefinitions = NonNullable<Parameters<typeof createSdkMcpServer>[0]["tools"]>;
const capture = vi.hoisted(() => ({ tools: [] as ToolDefinitions, options: null as Options | null, paidTurns: 0 }));
vi.mock("@anthropic-ai/claude-agent-sdk", async (original) => {
  const sdk = await original<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return { ...sdk, createSdkMcpServer: ((options) => {
    capture.tools = options.tools ?? [];
    return sdk.createSdkMcpServer(options);
  }) as typeof sdk.createSdkMcpServer };
});

function fixture(options: { effect?: boolean; hold?: boolean; terminal?: RuntimeFailureStatus;
  failure?: { status: RuntimeFailureStatus; at: MockFailurePoint }; unexpectedTools?: boolean } = {}) {
  const factory: SdkQueryFactory = ({ prompt, options: sdkOptions }) => {
    capture.options = sdkOptions;
    const tools = [...capture.tools];
    let interrupted!: () => void;
    const stop = new Promise<void>((resolve) => { interrupted = resolve; });
    return {
      initializationResult: async () => {
        if (options.failure?.at === "ready") throw runtimeAdapterError(options.failure.status, "Fixture readiness failure");
        return { hooks_applied: true } as Awaited<ReturnType<import("./adapter.js").SdkSession["initializationResult"]>>;
      },
      mcpServerStatus: async () => [{ name: "kilic", status: "connected" }],
      interrupt: async () => { interrupted(); return undefined; },
      close: () => { interrupted(); },
      async *[Symbol.asyncIterator]() {
        for await (const input of prompt) {
          capture.paidTurns += 1;
          if (options.failure?.at === "send") throw runtimeAdapterError(options.failure.status, "Fixture runtime failure");
          yield { type: "system", subtype: "init", tools: options.unexpectedTools ? ["Bash"] : tools.map((tool) => `mcp__kilic__${tool.name}`) } as SDKMessage;
          const text = String(input.message.content);
          yield { type: "assistant", message: { content: [{ type: "text", text }] } } as SDKMessage;
          if (options.effect) {
            const handler = tools.find((tool) => tool.name === "request_effect")!.handler;
            await handler({ action: "force_push", resource: "repo/main", description: "Force push" }, {});
          }
          if (options.hold) await stop;
          yield (options.terminal ? { type: "result", subtype: "error_during_execution", is_error: true, errors: [options.terminal] }
            : { type: "result", subtype: "success", is_error: false, result: text }) as SDKMessage;
        }
      },
    };
  };
  return new ClaudeCodeAdapter({ query: factory, probe: async () => {
    if (options.failure && ["status", "start"].includes(options.failure.at)) throw runtimeAdapterError(options.failure.status, "Fixture unavailable");
    return "AVAILABLE";
  } });
}

const harness: AdapterConformanceHarness = {
  completing: () => fixture(), openEnded: () => fixture({ hold: true }),
  failing: (status, at) => fixture({ failure: { status, at } }),
  requestingEffect: () => fixture({ effect: true }), terminalFailure: (terminal) => fixture({ terminal }),
  withLifecycleSignals: () => fixture(), effectCount: () => 0,
};
defineRuntimeAdapterConformance("Claude Code SDK transport fixtures", () => harness);

const request: StartSessionOptions = { role: "worker", tools: { memory: true, workforce: false, effectExecution: "brokered_only" },
  bootstrap: { doctrinePath: "identity/AGENTS.md", doctrineText: "Persistent identity", identity: { orchestratorId: "o", kind: "project", displayName: "Project" },
    workspace: { id: "w", name: "Workspace", slug: "w" }, project: null, operation: null, task: null,
    checkpoint: null, policies: [], memories: [], runtime: { purpose: "worker", role: "worker", executionNodeId: "n", correlationId: "c" } } };

describe("provider surface isolation", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("disables built-ins, settings, plugins, skills, extra MCP and credential inheritance", async () => {
    vi.stubEnv("KILIC_LOCAL_SERVICE_TOKEN", "must-not-reach-provider");
    const adapter = fixture();
    const handle = await adapter.start(request);
    expect(capture.options).toMatchObject({ tools: [], settingSources: [], plugins: [], skills: [], strictMcpConfig: true,
      persistSession: false, permissionMode: "dontAsk" });
    expect(capture.options!.env).not.toHaveProperty("KILIC_LOCAL_SERVICE_TOKEN");
    expect(capture.options!.systemPrompt).toContain("Persistent identity");
    const hook = capture.options!.hooks!.PreToolUse![0]!.hooks[0]!;
    const result = await hook({ hook_event_name: "PreToolUse", tool_name: "Bash" } as Parameters<typeof hook>[0], "tool", { signal: new AbortController().signal });
    expect(result).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    await adapter.close(handle);
  });
  it("fails closed if a provider surfaces an unbrokered tool", async () => {
    const adapter = fixture({ unexpectedTools: true });
    const handle = await adapter.start(request); await adapter.ready(handle);
    const events = [];
    for await (const event of adapter.send(handle, { text: "x", executionId: "job", idempotencyKey: "x" })) events.push(event);
    expect(events).toEqual([{ type: "failed", status: "FAILED", message: "Runtime process failed" }]);
  });
  it("never submits a second model turn for a completed duplicate request", async () => {
    capture.paidTurns = 0;
    const adapter = fixture(); const handle = await adapter.start(request); await adapter.ready(handle);
    const message = { text: "x", executionId: "job", idempotencyKey: "x" };
    for await (const event of adapter.send(handle, message)) expect(event.type).toBeTruthy();
    for await (const event of adapter.send(handle, message)) expect(event.type).toBe("completed");
    expect(capture.paidTurns).toBe(1);
    await expect(async () => { for await (const event of adapter.send(handle, { ...message, text: "changed" })) void event; }).rejects.toThrow(/changed meaning/);
    await adapter.close(handle);
  });
  it.each([["rate limit", "RATE_LIMITED"], ["quota exhausted", "QUOTA_EXHAUSTED"],
    ["Not logged in", "AUTH_REQUIRED"], ["Unexpected error", "FAILED"]])("normalizes %s", (message, status) => {
    expect(normalizeFailure(message)).toBe(status);
  });
});
