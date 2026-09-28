# ADR-0022: Canonical kullanıcı akışı

## Durum

Kabul edildi.

## Bağlam

CLI bugün daemon health okur. Bu, daemon'u orkestrasyon sahibi gibi gösterebilir. Günlük komutların daemon'a gitmesi, execution plane'in control plane kararını devralması olur.

## Karar

Hedef akış:

```text
CLI
  → Control API
    → Workspace Kılıç / Kernel
      → execution plan
        → Daemon
          → Runtime Adapter
```

`kilic status` özel bir health komutudur ve daemon `/health` okuyabilir. Orchestration komutları Control API'ye gider. CLI, daemon'a task, route veya spawn komutu göndermez.

Daemon orchestration owner değildir.

## Sonuç

Mevcut status komutu bu istisnanın içindedir. Sonraki kullanıcı komutları Control API client'ı olur.
