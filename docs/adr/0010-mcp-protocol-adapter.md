# ADR-0010: MCP bir protocol adapter'dır

## Durum

Kabul edildi.

## Bağlam

LLM'e doğrudan SQL vermek, scope ve yetkiyi modele bırakır. MCP sunucusunun kendi içinde domain kuralı taşıması da iki kaynak of truth üretir.

## Karar

Akış:

```text
LLM → MCP tool → application service → repository → PostgreSQL
```

`@kilic/mcp-memory` ve `@kilic/mcp-workforce` tool adlarını ve argüman şeklini doğrular, sonra `MemoryService` veya `Kernel.dispatchWorker` çağırır.

Bu fazda stdio transport bağlanmadı. Handler'lar transport'tan bağımsızdır ve sonraki MCP SDK bağının tek girişidir.

`query` veya ham SQL tool'u yoktur.

## Sonuç

Yeni bir tool, yeni bir domain kuralı demek değildir. Kural serviste kalır.
