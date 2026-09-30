# First mediated runtime slice — verification report

Date: 2026-09-30

## Delivered

The first real Claude worker uses the official SDK through the provider-neutral RuntimeAdapter contract. Native tools are disabled. Repository reads and scoped memory retrieval go through Kernel effect authorization. This is an opt-in read-only integration, not the default daemon runtime.

Bootstrap precedes readiness; a provider turn-init precedes running. Approval pauses the existing logical execution and the same live session resumes after an exact grant. A lost provider process is reconstructed from PostgreSQL state rather than a persisted chat transcript.

Live testing exposed a missing repository binding on ExecutionJob. Binding now uses a planned-state PostgreSQL compare-and-set, an event in the same transaction, a composite repository/project foreign key and an immutable-binding migration trigger.

## Verification

| Check | Result |
| --- | --- |
| Typecheck | Passed across 18 packages |
| Lint | Passed |
| Full tests with real PostgreSQL | Passed, 36 Turbo tasks |
| Claude adapter deterministic tests | 23 passed, including shared conformance |
| Read-only executor isolation tests | 4 passed |
| PostgreSQL repository binding and scope tests | Passed |
| Git diff whitespace check | Passed |
| Real SDK compatibility probe | Ready, zero native tools, streamed response |
| Real approval/resume | Same session; exactly one brokered read; duplicate approval rejected |
| Real approval denial | Failed outcome; zero brokered reads |
| Real runtime loss/reconstruction | Same durable job, new session, scoped checkpoint, exactly one read |

Paid live scenarios use a dedicated local `kilic_live_adapter` database and disposable README fixtures. They verify the returned random marker and unchanged file content. Default tests use deterministic SDK transport fixtures and do not spend model credits.

Successful live job IDs:

- Approval: `8503d849-456e-4926-ac0b-467ff8ad5f11`
- Denial: `75deb7be-8830-455a-9ff7-bc2ead1e0593`
- Reconstruction: `6f2c8b0d-5f28-4bcc-afb6-d64c845e52c3`

The reconstruction scenario closes the real provider process and rotates the execution-node boot identity. It does not kill and restart an operating-system daemon process. Quota/failure normalization is tested with fixtures; no real account quota was deliberately exhausted.

## Boundaries and next work

- This exercises Kernel, PostgreSQL and ExecutionPlane directly. Daily Control API/CLI usage and automatic daemon registration remain separate work.
- Workforce tools and persistent reasoning Mind execution are unsupported and rejected by this adapter.
- Pre-compaction/session-end signal capabilities remain false until provider signals can acknowledge durable flush. Terminal Kernel fallback persists checkpoints/digest work.
- Native tool restriction and hooks are not an OS sandbox. Mutation executors need payload integrity and durable execution receipts before enabling writes or irreversible effects.
- Same-process session resume is supported. After process loss, reconstruction uses scoped durable context.
- Next: an actual daemon-process restart test, then a second provider-neutral adapter and real cross-runtime handoff. Memory distillation and multiproject daily operation follow that evidence.

Architecture decision: [ADR-0026](adr/0026-first-mediated-runtime-slice.md).
Opt-in execution instructions: [Claude adapter README](../packages/adapter-claude/README.md).
