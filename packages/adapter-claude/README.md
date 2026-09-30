# Claude Code adapter

İlk gerçek `RuntimeAdapter` dilimi resmi Claude Agent SDK `0.3.285` kullanır. Yalnız brokered repository okumaları, scoped memory get ve exact effect önerileri sunulur. Built-in tools, shell, yazma, plugins, skills ve provider automatic memory kapalıdır. Workforce binding desteklenmez; bu istek fail-closed olur.

Adapter ortak conformance suite'ini deterministic SDK transport fixtures ile sınar. Gerçek protocol/approval/recovery davranışı ayrı opt-in canlı testle doğrulanır. Kernel bu pakete bağlanmaz. Daemon main henüz bu adapter'ı otomatik kaydetmez.

Canlı test ücret/kota kullanabilir; aktif Claude login ve ayrı yerel `kilic_live_*` PostgreSQL database ister. Test yalnız geçici README fixture'ına erişir. Approval senaryosunda yalnız testin exact `local_analysis/file:README.md` isteği test runner tarafından onaylanır.

```sh
KILIC_LIVE_TEST=1 DATABASE_URL=postgres://kilic@127.0.0.1:55439/kilic_live_adapter pnpm --filter @kilic/daemon exec tsx src/live-readonly.ts
KILIC_LIVE_TEST=1 KILIC_LIVE_SCENARIO=deny DATABASE_URL=postgres://kilic@127.0.0.1:55439/kilic_live_adapter pnpm --filter @kilic/daemon exec tsx src/live-readonly.ts
KILIC_LIVE_TEST=1 KILIC_LIVE_SCENARIO=restart DATABASE_URL=postgres://kilic@127.0.0.1:55439/kilic_live_adapter pnpm --filter @kilic/daemon exec tsx src/live-readonly.ts
```

`restart`, approval sırasında provider process'i kapatır, node boot epoch'unu değiştirir, aynı kalıcı job'ı scoped checkpoint ile yeni process'te kurar. Gerçek daemon OS process restart testi değildir. Session resume yalnız sağlıklı adapter process'i içinde desteklenir; SDK transcript persistence kapalıdır. Pre-compaction/session-end capabilities false kalır; terminal durable flush Kernel'dadır. Ayrıntı ADR-0026.
