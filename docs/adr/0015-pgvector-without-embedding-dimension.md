# ADR-0015: pgvector hazır, embedding boyutu yok

## Durum

Kabul edildi.

## Bağlam

Şema pgvector ile uyumlu olmalıdır. `KILIC_ARCHITECTURE.md` §89 embedding stratejisini henüz tasarlanmamış sayar. Sabit bir `vector(1536)` kolonu, model ve boyut kararını sessizce kilitler.

Bu gerilim dokümanda açık bırakıldı. Boyut seçilmedi.

## Karar

Migration `CREATE EXTENSION IF NOT EXISTS vector` çalıştırır. `memory_embeddings` tablosu ve vector kolonu yoktur. Semantic retrieval implement edilmez.

Structured arama, scope filtresi ve metin eşleşmesi ile çalışır. İleride embedding tablosu ayrı bir ADR ve migration ile eklenir.

## Sonuç

Bugünkü PostgreSQL, pgvector yüklü bir veritabanıdır. Retrieval hâlâ structured'dır.
