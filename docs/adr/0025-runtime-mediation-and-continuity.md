# ADR-0025: Brokered runtime effects, approval continuation, and lifecycle flush

## Durum

Kabul edildi.

## Bağlam

ADR-0023 effect için exact authorization ve tek kullanımlık grant tanımladı. Fakat `allow` cevabından sonra effect'in adapter içinde yürütülmesi broker sınırını zayıflatıyordu. `REQUIRE_APPROVAL` da turn'ü başarısız bitirip yeniden ücretli execution gerektirebiliyordu. ADR-0024 digest kuyruğunu tanımladı; runtime lifecycle sinyalleri kuyruğa bağlı değildi.

## Karar

- Adapter yalnız provider tool formatını `EffectRequest` olarak yayımlar. Riskli effect'i adapter yürütmez. `ToolSurface.effectExecution = brokered_only` ve `supportsToolInterception` gerçek adapter için zorunludur. Execution Plane, Kernel authorization sonucundaki exact grant ile `EffectExecutionPort` çağırır; adapter'a yalnız broker execution sonucu iletilir. Executor yoksa effect fail-closed kalır.
- Job ve worker run `running → awaiting_approval → running` akışını destekler. Awaiting state exact `pendingApprovalId` taşır, lease yenilenir ve PostgreSQL guard geçersiz geçişi reddeder. `supportsTurnPauseResume` varsa aynı stream onay sonucunu bekler ve devam eder. Yoksa job `interrupted/approval_requires_retry` olur; onay gelmeden retry yeniden ücretli işi başlatamaz. Onaydan sonra aynı idempotency key ile açık retry yapılır.
- Runtime yetenekleri session resume, turn pause/resume, tool interception, pre-compaction, session-end, streaming ve interrupt için provider-neutral boolean alanlardır. Liveness ayrıca session handle ile sorgulanır. Kernel kararları provider adına göre dallanmaz.
- Runtime lifecycle sinyalleri `pre_compaction`, `session_ending`, `runtime_failure`, `quota_exhausted`, `rate_limited`, `explicit_switch` olarak normalize edilir. Kernel lifecycle flush'ı scoped checkpoint ve idempotent digest ingestion ile aynı transaction'da yazar. Adapter sinyali yoksa turn/session terminal sınırında deterministik fallback flush yapılır. Raw output yalnız digest hash kaynağıdır; canonical memory değildir.
- Conformance v2 readiness öncesi execution'ı, açık started event'ini, streaming/terminal outcome'u, interception'ı, deny ve duplicate effect'i, pause/resume'u, liveness'ı, failure normalization'ı ve lifecycle signal'lerini sınar. Daemon ve PostgreSQL entegrasyon testleri broker execution ve durable flush'ı sınar.

## Sonuç

ADR-0023'teki “adapter grant sonrası effect uygular” yorumu bu ADR ile geçersizdir. TypeScript sözleşmesi kötü niyetli veya hatalı bir process'in ham shell/network erişimini fiziksel olarak sınırlayamaz. İlk gerçek adapter, provider'ın doğrudan side-effect tool'larını kapatmalı ve yalnız brokered tool surface'i kurmalıdır; process isolation ayrıca doğrulanmalıdır. Executor grant sonrası crash olursa dış sistemin gerçek sonucu belirsiz kalabilir. Tek kullanımlık grant tekrarı engeller, fakat genel exactly-once dış etki garantisi vermez.
