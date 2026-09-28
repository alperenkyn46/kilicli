# ADR-0006: RuntimeAdapter sınırı

## Durum

Kabul edildi.

## Bağlam

Claude Code, Codex ve Cursor farklı process, hata ve kota davranışlarına sahiptir. Bu fark Kernel'a sızarsa failover ve test her provider'da yeniden yazılır.

## Karar

`packages/runtime-contract` provider-nötr bir `RuntimeAdapter` tanımlar.

Normalize durumlar: `AVAILABLE`, `RATE_LIMITED`, `QUOTA_EXHAUSTED`, `AUTH_REQUIRED`, `FAILED`, `OFFLINE`.

Hatalar `RuntimeAdapterError` taşır. Provider metni Kernel'a çıkmaz.

`MockRuntimeAdapter` ve `defineRuntimeAdapterConformance` referans suite'tir. Gerçek adapter'lar aynı suite'i geçecektir. Bu fazda Claude, Codex ve Cursor paketleri yalnızca sınır işaretidir; provider SDK'sı yoktur.

Adapter'ın döndürdüğü `adapterSessionId`, control-plane `runtime_sessions.id` değildir. Eşleme Execution Plane'dedir.

## Sonuç

Kernel `RuntimeGateway` portuna konuşur. Hangi sınıfın kayıtlı olduğu daemon kompozisyonundadır.
