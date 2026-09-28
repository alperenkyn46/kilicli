# ADR-0008: Git worktree izolasyonu

## Durum

Kabul edildi.

## Bağlam

Write-capable worker kullanıcının ana working tree'sine yazarsa paralel çalışma ve yarım kalan denemeler kullanıcının dosyalarını kirletir. Paralelizm henüz açık olmasa da kural ilk günden doğru olmalıdır.

## Karar

Kernel izolasyon planını üretir:

- `read_only`: repository kökü
- `write`: `kilic/<taskId>/<runId>` branch'i ve ayrı worktree

Execution Plane planı uygular. Worktree yolu daemon'ın disk kökündedir; Kernel mutlak path icat etmez.

Worktree silinmesi branch silmez. Branch deletion onay gerektiren ayrı bir aksiyondur.

Bu izolasyon bir OS sandbox'ı değildir. Süreç hâlâ aynı kullanıcı yetkisiyle çalışır. Kural, cwd ve branch ayrımıdır.

## Sonuç

`worktrees` tablosu kaydı tutar. Git komutları yalnızca `apps/daemon` içindedir.
