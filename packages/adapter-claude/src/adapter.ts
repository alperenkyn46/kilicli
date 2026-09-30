import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createSdkMcpServer, query, tool, type Options, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { runtimeAdapterError, RuntimeAdapterError, RuntimeSessionClosedError, type RuntimeAdapter, type RuntimeCapabilities,
  type RuntimeEvent, type RuntimeMessage, type RuntimeSessionHandle, type StartSessionOptions,
  type EffectRequest, type EffectResolution, type RuntimeStatus, type RuntimeFailureStatus } from "@kilic/runtime-contract";
import { Queue } from "./queue.js";

export type SdkSession = AsyncIterable<SDKMessage> & Pick<Query, "initializationResult" | "mcpServerStatus" | "interrupt" | "close">;
export type SdkQueryFactory = (input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => SdkSession;
type Session = {
  id: string; sdk: SdkSession; input: Queue<SDKUserMessage>; events: Queue<RuntimeEvent>;
  ready: boolean; closed: boolean; current: RuntimeMessage | null; started: boolean; allowedTools: readonly string[];
  interrupted: boolean; denied: boolean; partial: boolean;
  pending: Map<string, (resolution: EffectResolution) => void>;
  completed: Map<string, { digest: string; event: RuntimeEvent }>;
};
const runFile = promisify(execFile);
const SERVER = "kilic";

export function normalizeFailure(error: unknown): RuntimeFailureStatus {
  if (error instanceof RuntimeAdapterError) return error.status;
  const text = error instanceof Error ? error.message : String(error);
  if (/quota|usage limit|hit your limit|out of.*credits|insufficient.*credit/i.test(text)) return "QUOTA_EXHAUSTED";
  if (/rate.?limit|\b429\b|too many requests/i.test(text)) return "RATE_LIMITED";
  if (/AUTH_REQUIRED|not logged in|authentication|unauthorized|\b401\b|invalid.*key/i.test(text)) return "AUTH_REQUIRED";
  if (/ENOENT|not found.*executable/i.test(text)) return "OFFLINE";
  return "FAILED";
}

/** First slice: brokered repository reads/effect proposals; no built-in tools. */
export class ClaudeCodeAdapter implements RuntimeAdapter {
  readonly harnessKey = "claude-code";
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly config: {
    query?: SdkQueryFactory; probe?: () => Promise<RuntimeStatus>; executablePath?: string;
    maxBudgetUsd?: number;
  } = {}) {}
  capabilities(): RuntimeCapabilities {
    return { supportsSessionResume: true, supportsTurnPauseResume: true, supportsToolInterception: true,
      supportsPreCompactionSignal: false, supportsSessionEndSignal: false, supportsStreaming: true, supportsInterrupt: true };
  }
  async status(): Promise<RuntimeStatus> {
    if (this.config.probe) return this.config.probe();
    try {
      const result = await runFile(this.config.executablePath ?? "claude", ["auth", "status"], { timeout: 10_000 });
      return JSON.parse(result.stdout).loggedIn === true ? "AVAILABLE" : "AUTH_REQUIRED";
    } catch (error) { return normalizeFailure(error); }
  }
  async start(options: StartSessionOptions): Promise<RuntimeSessionHandle> {
    if (!options.bootstrap?.doctrineText.trim() || !options.bootstrap.identity.orchestratorId ||
      options.tools.effectExecution !== "brokered_only") throw new Error("Bootstrap and brokered tool surface are required");
    if (options.tools.workforce) throw new Error("Workforce tool binding is not available in the read-only adapter slice");
    const availability = await this.status();
    if (availability !== "AVAILABLE") throw runtimeAdapterError(availability, "Runtime is unavailable");
    const id = crypto.randomUUID();
    const input = new Queue<SDKUserMessage>();
    const events = new Queue<RuntimeEvent>();
    const tools = [tool("read_file", "Read a repository-relative text file through the execution broker.",
      { path: z.string().min(1).max(1024) }, async ({ path }) => this.effect(id, "local_analysis", `file:${path}`)),
      tool("request_effect", "Propose an exact effect to the Kernel. This tool never executes it itself.",
        { action: z.string().min(1).max(128), resource: z.string().min(1).max(2048), description: z.string().max(4096) },
        async ({ action, resource, description }) => this.effect(id, action, resource, description))];
    const memoryTools = options.tools.memory ? [tool("memory_get", "Retrieve a scoped memory handle through the execution broker.",
      { id: z.string().uuid() }, async ({ id: memoryId }) => this.effect(id, "local_analysis", `memory:${memoryId}`))] : [];
    const allowed = [...tools, ...memoryTools].map((definition) => `mcp__${SERVER}__${definition.name}`);
    const context = JSON.stringify(options.bootstrap);
    const env: Record<string, string | undefined> = {};
    for (const key of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) env[key] = process.env[key];
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
    env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
    env.CLAUDE_CODE_DISABLE_ATTACHMENTS = "1";
    env.CLAUDE_CODE_DISABLE_CRON = "1";
    env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = "1";
    env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK = "1";
    env.ENABLE_TOOL_SEARCH = "false";
    env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";
    env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS = "1";
    const sdkOptions: Options = {
      cwd: options.cwd, env, tools: [], settingSources: [], skills: [], plugins: [],
      strictMcpConfig: true, mcpServers: { [SERVER]: createSdkMcpServer({ name: SERVER, tools: [...tools, ...memoryTools] }) },
      allowedTools: allowed, permissionMode: "dontAsk", persistSession: false,
      includePartialMessages: true, maxTurns: 12, maxBudgetUsd: this.config.maxBudgetUsd ?? 0.5,
      ...(options.modelKey && options.modelKey !== "default" ? { model: options.modelKey } : {}),
      ...(this.config.executablePath ? { pathToClaudeCodeExecutable: this.config.executablePath } : {}),
      systemPrompt: `${options.bootstrap.doctrineText}\n\nScoped bootstrap data:\n${context}\n\nOnly installed broker tools are available. Do not invoke slash commands or native tools.`,
      extraArgs: { restricted: null, "disable-slash-commands": null, "no-chrome": null },
      hooks: { PreToolUse: [{ hooks: [async (hook) => {
        if (hook.hook_event_name !== "PreToolUse") return {};
        if (allowed.includes(hook.tool_name)) return {};
        const session = this.sessions.get(id);
        if (session) session.denied = true;
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
          permissionDecisionReason: "Tool is outside the broker surface" } };
      }] }] },
    };
    try {
      const sdk = (this.config.query ?? query)({ prompt: input, options: sdkOptions });
      this.sessions.set(id, { id, sdk, input, events, ready: false, closed: false, current: null,
        started: false, interrupted: false, denied: false, partial: false, allowedTools: allowed, pending: new Map(), completed: new Map() });
      return { adapterSessionId: id, harnessKey: this.harnessKey };
    } catch (error) { throw runtimeAdapterError(normalizeFailure(error), "Runtime initialization failed"); }
  }
  async ready(handle: RuntimeSessionHandle): Promise<void> {
    const session = this.open(handle);
    if (session.ready) return;
    try {
      const init = await session.sdk.initializationResult();
      if (init.hooks_applied !== true) throw new Error("Tool interception hook was not installed");
      const servers = await session.sdk.mcpServerStatus();
      if (servers.length !== 1 || servers[0]?.name !== SERVER || servers[0].status !== "connected") throw new Error("Broker tool surface is not ready");
      session.ready = true;
      void this.pump(session);
    } catch (error) { await this.close(handle); throw runtimeAdapterError(normalizeFailure(error), "Runtime bootstrap readiness failed"); }
  }
  async sessionHealth(handle: RuntimeSessionHandle): Promise<"alive" | "dead" | "unknown"> {
    const session = this.sessions.get(handle.adapterSessionId);
    if (!session || handle.harnessKey !== this.harnessKey) return "unknown";
    return session.closed ? "dead" : "alive";
  }
  async resumeSession(handle: RuntimeSessionHandle): Promise<RuntimeSessionHandle> {
    if (!this.open(handle).ready) throw new Error("Bootstrap is not ready");
    return handle;
  }
  async *send(handle: RuntimeSessionHandle, message: RuntimeMessage): AsyncIterable<RuntimeEvent> {
    const session = this.open(handle);
    if (!session.ready) throw new Error("Bootstrap is not ready");
    if (session.current) throw new Error("A turn is already running in this session");
    const digest = createHash("sha256").update(message.text).digest("hex");
    const key = `${message.executionId}:${message.idempotencyKey}`;
    const prior = session.completed.get(key);
    if (prior) {
      if (prior.digest !== digest) throw new Error("Idempotency key changed meaning");
      if (prior.event.type === "completed") { yield prior.event; return; }
    }
    session.current = message; session.started = false; session.interrupted = false; session.denied = false; session.partial = false;
    session.input.push({ type: "user", message: { role: "user", content: message.text },
      parent_tool_use_id: null, client_composed: true, uuid: crypto.randomUUID() });
    let terminal = false;
    try {
      for await (const event of session.events) {
        if (["completed", "failed", "interrupted"].includes(event.type)) {
          terminal = true;
          session.completed.set(key, { digest, event });
          session.current = null;
          yield event; return;
        }
        yield event;
      }
      throw runtimeAdapterError("OFFLINE", "Runtime stream ended without a terminal outcome");
    } finally {
      if (session.current === message) session.current = null;
      if (!terminal) await this.close(handle);
    }
  }
  async resolveEffect(handle: RuntimeSessionHandle, key: string, resolution: EffectResolution): Promise<void> {
    const session = this.open(handle);
    const resolve = session.pending.get(key);
    if (!resolve) throw new Error("No pending effect request");
    if (resolution.decision === "require_approval") return;
    session.pending.delete(key);
    if (resolution.decision === "deny") session.denied = true;
    resolve(resolution);
  }
  async interrupt(handle: RuntimeSessionHandle): Promise<void> {
    const session = this.open(handle);
    session.interrupted = true;
    // Retire this process so an approval cannot revive an already interrupted tool call.
    session.closed = true;
    if (session.current) session.events.push({ type: "interrupted" });
    for (const resolve of session.pending.values()) resolve({ decision: "deny", reason: "Execution interrupted" });
    session.pending.clear();
    try { await session.sdk.interrupt(); }
    finally {
      session.input.close(); session.sdk.close(); session.events.close();
    }
  }
  async close(handle: RuntimeSessionHandle): Promise<void> {
    const session = this.sessions.get(handle.adapterSessionId);
    if (!session || session.closed) return;
    session.closed = true;
    for (const resolve of session.pending.values()) resolve({ decision: "deny", reason: "Session closed" });
    session.pending.clear(); session.input.close(); session.sdk.close(); session.events.close();
  }
  private open(handle: RuntimeSessionHandle): Session {
    const session = this.sessions.get(handle.adapterSessionId);
    if (!session || session.closed || handle.harnessKey !== this.harnessKey) throw new RuntimeSessionClosedError(handle.adapterSessionId);
    return session;
  }
  private async effect(id: string, action: string, resource: string, description = "Brokered tool request") {
    const session = this.open({ adapterSessionId: id, harnessKey: this.harnessKey });
    if (!session.current || !session.started) throw new Error("Tool call is outside a running turn");
    const key = createHash("sha256").update(session.current.executionId).update("\0").update(action).update("\0").update(resource).digest("hex");
    if (session.pending.has(key)) throw new Error("Duplicate concurrent effect request");
    const result = new Promise<EffectResolution>((resolve) => session.pending.set(key, resolve));
    const request: EffectRequest = { idempotencyKey: key, action, resource, description };
    session.events.push({ type: "effect_requested", request });
    const resolution = await result;
    return { content: [{ type: "text" as const, text: JSON.stringify(resolution.decision === "allow" ? resolution.result ?? null : resolution) }],
      isError: resolution.decision !== "allow" };
  }
  private async pump(session: Session): Promise<void> {
    try {
      for await (const message of session.sdk) {
        if (session.closed) break;
        if (!session.current) continue;
        if (!session.started && message.type === "system" && message.subtype === "init") {
          if (message.tools.some((name) => !session.allowedTools.includes(name))) throw new Error("Unexpected unbrokered tool surfaced");
          session.started = true; session.events.push({ type: "started" });
        }
        if (message.type === "stream_event" && message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") {
          session.partial = true; session.events.push({ type: "output", text: message.event.delta.text });
        }
        if (message.type === "assistant" && !session.partial) {
          for (const block of message.message.content) if (block.type === "text") session.events.push({ type: "output", text: block.text });
        }
        if (message.type === "result") {
          if (session.interrupted) session.events.push({ type: "interrupted" });
          else if (session.denied) session.events.push({ type: "failed", status: "FAILED", message: "Effect was denied" });
          else if (message.subtype === "success" && !message.is_error) session.events.push({ type: "completed", text: message.result });
          else session.events.push({ type: "failed", status: normalizeFailure(message.subtype === "success" ? message.result : message.errors.join(" ")), message: "Runtime turn failed" });
        }
      }
      if (!session.closed && session.current) session.events.push({ type: "failed", status: "OFFLINE", message: "Runtime process stopped" });
    } catch (error) {
      if (!session.closed) session.events.push({ type: "failed", status: normalizeFailure(error), message: "Runtime process failed" });
    } finally {
      session.closed = true; session.events.close(); session.sdk.close();
    }
  }
}
