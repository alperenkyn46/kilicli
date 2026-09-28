# ADR-0014: Kanonik dil

## Durum

Kabul edildi.

## Bağlam

Kod, şema ve API İngilizce tanımlanırsa araçlar ve tipler tek sözlük kullanır. Kullanıcının doğal dilini çeviriye zorlamak ise karar ve bulgu metnini bozar.

## Karar

Identifier, enum, tablo ve tool adları İngilizcedir: `workspace`, `project`, `operation`, `task`, `checkpoint`, `finding`, `decision`.

Serbest metin alanları kullanıcının dilinde kalır. Kayıtlar isteğe bağlı `language` metadata taşır. Semantic metin, kanonik dil uğruna çevrilmez.

## Sonuç

Türkçe bir task başlığı veya decision rationale olduğu gibi saklanır. Arama, metni çevirmeden eşler.
