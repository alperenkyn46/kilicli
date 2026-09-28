import type { RuntimeStatus } from "@kilic/runtime-contract";
import type { BootstrapContext, ToolSurface } from "@kilic/runtime-contract";

/** Control plane asks only whether a harness can accept work. */
export interface RuntimeStatusProbe {
  status(harnessKey: string): Promise<RuntimeStatus>;
}

/** Execution plane owns process start, liveness, and close. */
export interface RuntimeProcessPort {
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
}
