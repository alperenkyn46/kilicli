# Kılıç

Kılıç'ın kaynak deposu. Yönetilecek uygulamalar burada durmaz; workspace, project ve repository kayıtları olarak bağlanır.

Domain, PostgreSQL şeması, Kernel, runtime sözleşmesi ve daemon foundation'ı üzerinde ilk gerçek read-only Claude worker dilimi vardır. Günlük kullanıcı akışı ve CLI henüz yalnız health seviyesindedir. Canlı adapter testleri ayrı opt-in runner ile çalışır.

## Çalıştırma

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm test
```

`DATABASE_URL` migrate ve seed için gerekir. Testlerin çoğu veritabanı olmadan çalışır. PostgreSQL integration testi `DATABASE_URL` görürse çalışır.

```bash
pnpm --filter @kilic/daemon start
pnpm --filter @kilic/control-api start
pnpm --filter @kilic/cli start status
```

`kilic status` yalnızca daemon health okur. Orchestration komutları Control API'ye gider. Akış ADR-0022'dedir.

Daemon ve control API yalnızca `127.0.0.1` üzerinde dinler.

## Sınırlar

- `packages/kernel`: control-plane kararları. Provider adı taşımaz.
- `apps/daemon`: makine, worktree ve runtime process.
- `apps/control-api`: aynı Kernel'ın HTTP yüzü. Process açmaz.
- `apps/cli`: daemon health istemcisi.
- `packages/runtime-contract`: adapter sözleşmesi ve mock conformance.
- `packages/adapter-claude`: brokered read-only dilim ve opt-in canlı test; daemon main otomatik kaydetmez.
- `packages/adapter-codex`, `packages/adapter-cursor`: henüz implement edilmedi.
- `packages/mcp-*`: tool adapter. Domain kuralı burada değildir.
- `apps/web`: sonraki client. UI yok.

Kararlar `docs/adr/` altındadır. Runtime doctrine `identity/AGENTS.md` dosyasındadır; kök `AGENTS.md` source repository geliştirme talimatıdır.
