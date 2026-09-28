# ADR-0005: Supabase yalnızca altyapıdır

## Durum

Kabul edildi.

## Bağlam

Supabase managed PostgreSQL, auth, realtime ve storage sağlayabilir. Domain'in bu SDK'nın semantiğine bağlanması, self-hosted PostgreSQL'e geçişi şema ve kod değişikliği yapar.

## Karar

Bağımlılık yönü sabittir:

```text
Kılıç domain → repository → PostgreSQL
```

Supabase bir deployment seçeneğidir. Domain kodu Supabase client import etmez. Auth ve storage bu fazda yoktur. Hosted Supabase'e geçiş şema değişikliği gerektirmemelidir.

## Sonuç

Local geliştirme `pgvector/pgvector:pg16` imajı ile yapılır. Connection string değişir, repository kodu değişmez.
