# ADR-0020: Memory scope'ları

## Durum

Kabul edildi.

## Bağlam

Şemada `run` ve `agent` aynı ephemeral katmanı iki kez adlandırıyordu. `KILIC_ARCHITECTURE.md` bu ikisini "RUN / AGENT" diye tek satırda gruplar. Ayrı retrieval kuralı yoktu.

`global` ise hem sistem doktrini hem kullanıcı tercihini taşıyormuş gibi duruyordu. Kullanıcı tercihi başka kullanıcıya sızmamalı.

## Karar

- `agent` scope kaldırıldı. Ephemeral execution kaydı `run` scope'udur ve bir `agent_run` id'sine bağlıdır.
- Varsayılan arama `run` getirmez. Yalnızca context açıkça `agentRunId` verirse o run'ın kayıtları gelir.
- `global` sistem doktrinidir. `owner_user_id` boştur. Kullanıcılar arasında paylaşılabilir olan yalnızca bu katmandır ve içine kullanıcı tercihi yazılmaz.
- `user` scope bir kullanıcının kendi tercihidir. `owner_user_id` zorunludur. Arama, context'teki kullanıcıya ait `user` kayıtlarını ve system `global` kayıtlarını birlikte alabilir. Başka kullanıcının `user` kaydı gelmez.

## Sonuç

Check constraint `agent` değerini reddeder. `user` ve `global` kuralları veritabanında durur.
