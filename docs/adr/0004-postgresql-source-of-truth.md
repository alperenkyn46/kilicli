# ADR-0004: PostgreSQL source of truth

## Durum

Kabul edildi.

## Bağlam

Kalıcı hafıza ve operasyonel state dosya yığınına veya sohbet geçmişine bırakılırsa scope, tutarlılık ve failover bozulur.

## Karar

PostgreSQL tek source of truth'tur. SQLite veya bellek içi store production mimarisi değildir. Bellek içi repository yalnızca test çiftidir.

State tabloları güncel gerçeği tutar. `events` ve `checkpoints` append-only'dir. Veritabanı trigger'ı bu tablolarda UPDATE ve DELETE'i reddeder.

Tam event sourcing yoktur. State, event'lerin replay'i ile hesaplanmaz.

## Sonuç

Drizzle şeması ve repository katmanı PostgreSQL'e konuşur. Uygulama servisleri SQL üretmez.
