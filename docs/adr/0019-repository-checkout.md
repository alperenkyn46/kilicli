# ADR-0019: Repository checkout execution node'a aittir

## Durum

Kabul edildi.

## Bağlam

`Repository.localPath` aynı logical repository'yi tek makine yoluna kilitliyordu. İkinci bir execution node aynı repo'yu başka bir path'te tutamazdı.

## Karar

`repositories` logical kayıttır: ad, project, remote URL, default branch. Disk yolu yoktur.

`repository_checkouts` bir repository'nin bir execution node üzerindeki kopyasıdır: `localPath`, `status` (`present` veya `missing`). Çift `(repository_id, execution_node_id)` tektir.

Daemon worktree kökünü bu checkout'tan çözer. Checkout yoksa process açılmaz.

Bugün tek makine bir checkout satırı yazar. Şema ikinci makine için repository satırını değiştirmez.

## Sonuç

`0001` migration `local_path` kolonunu repository'den kaldırır ve checkout tablosunu açar.
