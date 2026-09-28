# ADR-0012: Sağlıklı session yeniden kullanılır

## Durum

Kabul edildi.

## Bağlam

Her task sonunda mind session'ını öldürmek, hâlâ geçerli olan context'i çöpe atar. Session'ı süresiz açık tutmak da context bozulmasını ve kota değişimini görmezden gelir.

## Karar

Kural: `reuse when healthy, reconstruct when necessary`.

Session şu durumlarda yeniden kurulur:

- quota exhausted
- rate limit
- runtime failure
- context degradation
- explicit runtime switch
- policy
- seçilen route'un değişmesi
- mevcut session'ın active olmaması

Yeniden kurulum sohbet dökümünden değil, doctrine, operation, checkpoint ve scope'lu memory'den yapılır. Bu faz reconstruction için gerekli state'i yazar; prompt derlemesi sonraki dilimdedir.

## Sonuç

`decideSessionReuse` saf fonksiyondur ve test edilir. Orchestrator kimliği bu karardan etkilenmez.
