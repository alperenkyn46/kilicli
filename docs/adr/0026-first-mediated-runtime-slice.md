# ADR-0026: First mediated runtime slice

## Durum

Kabul edildi.

## Bağlam

Foundation v0.2 sözleşmeleri gerçek bir harness üzerinde henüz sınanmamıştı. İlk entegrasyon, provider araçlarına geniş erişim vermeden bootstrap, execution-time approval ve durable recovery davranışını kanıtlamalıdır.

## Karar

- İlk gerçek worker adapter'ı resmi Claude Agent SDK 0.3.285 kullanır; provider kodu yalnız `packages/adapter-claude` içindedir. Kernel provider adına göre davranış seçmez.
- SDK built-in tool listesi boştur. Filesystem settings, plugins, skills, automatic memory, CLAUDE.md discovery, attachments, background work, cron, cloud MCP ve tool search kapalıdır. Subprocess environment bir allowlist'tir; Control API/daemon token'ları aktarılmaz.
- SDK MCP tool handler'ları yalnız `EffectRequest` üretir ve broker sonucunu bekler. `allowedTools`, yalnız bu handler'ların çağrılmasına izin verir; effect yetkisi değildir. Ek `PreToolUse` guard ve turn başlangıcındaki exact tool inventory kontrolü bilinmeyen araçları reddeder.
- `ready` initialize acknowledgement ve broker MCP connection olmadan başarılı olmaz. `running` SDK turn-init event'inden önce yazılmaz. Capability metadata provider-neutral kalır.
- İlk executor yalnız exact grant, güncel node epoch/lease ve açık dosya allowlist'iyle bounded repository text okur. Project dışı repository ve checkout dışına çıkan symlink reddedilir. Scoped memory handle'ları MemoryService üzerinden alınır. Shell ve mutation executor yoktur; workforce/Mind binding henüz desteklenmez ve istek açıkça reddedilir.
- Worker repository'si model çalışmadan önce `planned` state'te compare-and-set ile job'a bağlanır. Binding event'i aynı transaction'dadır. Composite repository/project FK ve versioned PostgreSQL trigger binding'in başka projeye veya retry'da başka repository'ye çevrilmesini engeller.
- Sağlıklı process içindeki session ve turn devam edebilir. SDK transcript persistence kapalıdır. Process kaybında PostgreSQL checkpoint/bootstrap'tan yeni runtime kurulur; disk chat'i continuity kaynağı değildir.
- Bu dilimde interrupt process'i retire eder. Böylece sonradan verilen approval, kesilmiş bir tool call'u yeniden canlandıramaz.
- Pre-compaction/session-end callback'lerinin durable flush acknowledgement sözleşmesi henüz yoktur; bu capability'ler false'dur. Kernel'ın terminal fallback flush'ı kullanılır. SDK callback'i bildirmek, state'in kalıcılaştığını kanıtlamak için yeterli sayılmaz.

## Sonuç

Bu dilim gerçek read-only worker kanıtıdır; günlük CLI, write-capable worker, persistent reasoning Mind, ikinci provider handoff ve LLM memory distillation tamamlanmış değildir. Provider callback'leri ve tool inventory kontrolü OS isolation yerine geçmez. Dış sistemde mutation executor eklenmeden önce command/payload integrity ve durable execution receipt tasarlanmalıdır.

## Kaynaklar

- [SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions): allow rules tek başına tool surface sınırı değildir.
- [SDK custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools): in-process MCP tool handler boundary.
- [SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks): PreToolUse guard.
- [Environment variables](https://code.claude.com/docs/en/env-vars): provider-local context ve tool discovery kapatma seçenekleri.
- Installed SDK type definitions, compatibility probe, adapter conformance fixtures and opt-in PostgreSQL live test.
