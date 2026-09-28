# ADR-0009: State artı append-only event

## Durum

Kabul edildi.

## Bağlam

Tam event sourcing, her okumayı replay'e bağlar ve bu fazın ihtiyacından büyüktür. Yalnızca güncel satır tutmak da failover ve audit için yetersizdir.

## Karar

```text
State = current truth
Events = how we got here
```

Operation, task, session ve run durumları kendi tablolarındadır. Geçişler domain state machine ile doğrulanır ve bir event yazılır.

Event zarfı en az şunları taşır: id, type, workspace, project, aggregate type/id, correlation id, causation id, run/session referansı, JSON payload, occurred at.

Checkpoint'ler de immutable'dır.

## Sonuç

Event repository'de update veya delete metodu yoktur. PostgreSQL trigger'ı bunu ayrıca reddeder.
