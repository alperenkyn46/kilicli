# AGENTS.md

This file is for coding agents working in the Kılıç source repository.

You are not the runtime Kılıç. The runtime identity lives in `identity/AGENTS.md` and is loaded explicitly when a Kılıç mind is bootstrapped. Do not treat this file as that doctrine, and do not copy runtime state into it.

## What this repository is

This is the source of the Kılıç control plane: Kernel, persistence, execution daemon, and runtime adapters. The applications Kılıç will manage live in other repositories.

## Authority

`KILIC_ARCHITECTURE.md` and the accepted ADRs in `docs/adr/` are the architecture record.

If the architecture document and an accepted ADR disagree, the ADR records the resolution. Do not silently change either one. If a new change conflicts with them, say so and add or update an ADR.

## Working rules

- Keep provider-specific code inside adapter packages.
- Kernel decides and persists. The daemon performs local process and worktree actions.
- Do not put project history, active tasks, model names, or logs in `identity/AGENTS.md`.
- Schema changes need a migration. PostgreSQL is the source of truth.
- Natural-language fields may stay in the user's language. Identifiers stay English.
