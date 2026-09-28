# ADR-0018: Routing inheritance

## Durum

Kabul edildi.

## Bağlam

İlk foundation kodu en spesifik policy'nin alt seviyedeki chain'i tamamen değiştirmesini kullanıyordu. Bu davranış ADR değildi. Project policy yalnızca Claude'u listeliyorsa ve Claude kotası bittiyse, global Codex fallback'i de kayboluyordu. Bu, runtime failover hedefiyle çelişir.

## Karar

Semantik **inherit / overlay** olur. Replace seçilmedi.

Sıra: operation, project, workspace, global. Her katmanda o role ait route'lar priority sırasıyla denenir. Katmandaki harness'lar available değilse bir alt katmana geçilir. Daha spesifik bir katman, alt katmanı ancak kendi route'u available ise gölgeler.

Örnek: global `alpha → beta`, project yalnızca `alpha`. Alpha `QUOTA_EXHAUSTED` ise seçim beta olur. İkisi de available ise seçim alpha olur.

"Bu katman başarısız olursa hiç fallback olmasın" ayrı bir policy alanı değildir. İleride gerekirse yeni bir ADR ile eklenir.

## Sonuç

`selectRoute` bu sırayı testle sabitler.
