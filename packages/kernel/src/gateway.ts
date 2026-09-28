import type { RuntimeStatus } from "@kilic/runtime-contract";
import type { BootstrapContext, ToolSurface, RuntimeEvent, RuntimeMessage, EffectResolution, RuntimeCapabilities } from "@kilic/runtime-contract";

/** Control plane asks only whether a harness can accept work. */
export interface RuntimeStatusProbe {
  status(harnessKey: string): Promise<RuntimeStatus>;
}

/** Execution plane owns process start, liveness, and close. */
export interface RuntimeProcessPort {
  capabilities(harnessKey: string): RuntimeCapabilities;
  open(input: {
    harnessKey: string;
    modelKey: string;
    role: string;
    cwd?: string;
    bootstrap?: BootstrapContext;
    tools?: ToolSurface;
  }): Promise<{ adapterSessionId: string }>;
  close(input: { harnessKey: string; adapterSessionId: string }): Promise<void>;
  hasAdapterSession(adapterSessionId: string): boolean;
  sessionHealth(input: { harnessKey: string; adapterSessionId: string }): Promise<"alive" | "dead" | "unknown">;
  resumeSession(input: { harnessKey: string; adapterSessionId: string }): Promise<void>;
  send(input: { harnessKey: string; adapterSessionId: string; message: RuntimeMessage }): AsyncIterable<RuntimeEvent>;
  resolveEffect(input: { harnessKey: string; adapterSessionId: string; requestKey: string; resolution: EffectResolution }): Promise<void>;
  interrupt(input: { harnessKey: string; adapterSessionId: string }): Promise<void>;
}
