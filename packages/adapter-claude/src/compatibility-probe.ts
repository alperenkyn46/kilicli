import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Explicit live probe; never part of the default test run.
const cwd = await mkdtemp(join(tmpdir(), "kilic-runtime-probe-"));
let submit!: (message: SDKUserMessage) => void;
const input = new Promise<SDKUserMessage>((resolve) => { submit = resolve; });
async function* messages() { yield await input; }
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90_000);
const session = query({ prompt: messages(), options: {
  cwd, tools: [], settingSources: [], skills: [], plugins: [], mcpServers: {}, strictMcpConfig: true,
  systemPrompt: "You are Kılıç. Your persistent identity is outside this session. Answer only KILIC_BOOTSTRAP_OK.",
  includePartialMessages: true, persistSession: false, permissionMode: "dontAsk",
  maxTurns: 1, maxBudgetUsd: 0.15, abortController: controller,
  extraArgs: { "restricted": null, "disable-slash-commands": null, "no-chrome": null },
  hooks: { PreToolUse: [{ hooks: [async () => ({ hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Probe has no tools",
  } })] }] },
} });
try {
  const initialized = await session.initializationResult();
  if (initialized.hooks_applied !== true) throw new Error("Safety hook was not acknowledged");
  const servers = await session.mcpServerStatus();
  if (servers.length) throw new Error("Unexpected MCP server loaded");
  console.log(JSON.stringify({ phase: "ready", hooksApplied: true, mcpServers: 0 }));
  submit({ type: "user", message: { role: "user", content: "Return the bootstrap marker." },
    parent_tool_use_id: null, client_composed: true });
  let partials = 0;
  let finished = false;
  for await (const event of session) {
    if (event.type === "system" && event.subtype === "init") {
      if (event.tools.length) throw new Error(`Unexpected tools: ${event.tools.join(",")}`);
      console.log(JSON.stringify({ phase: "started", builtInTools: event.tools.length }));
    }
    if (event.type === "stream_event") partials += 1;
    if (event.type === "result") {
      if (event.subtype !== "success" || event.is_error || event.result.trim() !== "KILIC_BOOTSTRAP_OK") {
        throw new Error("Live bootstrap probe did not complete successfully");
      }
      finished = true;
      console.log(JSON.stringify({ phase: "completed", marker: event.result.trim(), streamingEvents: partials,
        estimatedCostUsd: event.total_cost_usd }));
      break;
    }
  }
  if (!finished || partials === 0) throw new Error("Missing terminal outcome or streaming output");
} finally { clearTimeout(timer); session.close(); }
