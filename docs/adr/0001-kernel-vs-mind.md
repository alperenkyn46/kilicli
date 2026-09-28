# ADR-0001: Kernel ve Mind ayrıdır

## Durum

Kabul edildi.

## Bağlam

Kılıç'ın sürekliliği bir sohbet oturumuna veya bir model sağlayıcısına bağlanırsa, kota, çökme veya harness değişimi kimliği de götürür.

## Karar

Kılıç iki parçadır.

- Kernel deterministik yazılımdır. Routing, state, policy, checkpoint ve event burada yaşar. Kernel bir LLM değildir.
- Mind, o anda reasoning yapan harness ve model oturumudur. Değiştirilebilir.

Kimlik Kernel'ın tuttuğu orchestrator kaydıdır.

## Sonuç

Provider kodu Kernel'a girmez. Mind kapanınca orchestrator kaydı durur.
