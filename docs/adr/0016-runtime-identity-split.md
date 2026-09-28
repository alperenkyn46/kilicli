# ADR-0016: Runtime identity ayrı dosyada

## Durum

Kabul edildi.

## Bağlam

Kök `AGENTS.md`, hem bu depoyu geliştiren coding agent hem de runtime Kılıç tarafından okunuyordu. Aynı dosya iki role birden anayasa olunca geliştirme oturumu "ben Kılıç'ım, implementasyonu delege et" diye okuyordu.

## Karar

- Kök `AGENTS.md` bu source repository'nin geliştirme talimatıdır. Buradaki agent runtime Kılıç değildir.
- Runtime doctrine `identity/AGENTS.md` içindedir. Yalnızca kimlik, karakter, amaç, sorumluluk, delegasyon, runtime bağımsızlığı, hafıza ve doğrulama ilkelerini taşır.
- Bootstrap context `doctrinePath` olarak `identity/AGENTS.md` verir. Dosya içeriği chat transcript'ine yazılmaz.

## Sonuç

İki dosya birbirinin yerine geçmez. Project state, task, model adı ve log runtime doctrine'a yazılmaz.
