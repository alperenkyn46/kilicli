# ADR-0021: HTTP kenarı Hono, log bir port

## Durum

Kabul edildi.

## Bağlam

Foundation validation isteği Fastify ve Pino'yu kilitlenmiş stack olarak andı. `KILIC_ARCHITECTURE.md` ve ADR-0001–0015 bu iki ismi taşımaz. Yazılı kayıt TypeScript ve Node.js der. İlk implementation HTTP kenarında Hono, log için `packages/observability` içindeki `Logger` portunu kullandı.

Bu bir domain kararı değil. Sessiz bırakılırsa sonradan "neden Fastify değil" sorusu kaybolur.

## Karar

HTTP uygulamaları Hono ile kalır. Domain ve Kernel Hono import etmez.

Log, `Logger` portudur. Şu anki console logger bu portun bir uygulamasıdır. Pino daha sonra aynı portun arkasına geçebilir. Kernel Pino'ya bağlanmaz.

Fastify'a bu geçitte dönülmedi. Yazılı ADR'lerde böyle bir kabul yoktu. Bu ADR, kenar framework seçimini görünür kılar.

## Sonuç

Framework değişimi bir ADR ister. Domain modeli değişmez.
