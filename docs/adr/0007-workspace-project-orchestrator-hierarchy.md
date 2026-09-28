# ADR-0007: Workspace, Project, Orchestrator hiyerarşisi

## Durum

Kabul edildi.

## Bağlam

İlk kanıt tek bir proje içerse de mimari tek proje varsayımına kilitlenmemelidir. Project Kılıçlar birbirine mesh kurarsa otorite ve audit dağılır.

## Karar

Hiyerarşi:

```text
User → Workspace → Workspace Orchestrator
                 → Project → Project Orchestrator → Worker
```

İlk dikey dilimin verisi 1 user, 1 workspace, 1 project olabilir. Şema çoklu workspace ve project taşır.

Cross-project koordinasyon Workspace Orchestrator üzerinden yürür. Project orchestrator'lar birbirine task açmaz.

Tek doctrine, çok instance. Ayrı kişilik kopyalanmaz. Instance, `kind` ve `project_id` ile ayrılır.

## Sonuç

`ensureOrchestrator` her workspace için tek workspace orchestrator, her project için tek project orchestrator bırakır. Veritabanı partial unique index ile bunu zorlar.
