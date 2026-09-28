# ADR-0002: Orchestrator, RuntimeSession değildir

## Durum

Kabul edildi.

## Bağlam

Workspace Kılıç ve Project Kılıç proje ömrü boyunca kalıcıdır. Onları çalıştıran model oturumu kota, hata veya context bozulmasında değişir.

## Karar

`orchestrators` kalıcı kimliği tutar: workspace veya project scope, durum, ad.

`runtime_sessions` o kimliğin geçici execution instance'ıdır: harness, model, execution node, amaç (`orchestrator_mind` veya `worker`) ve durum.

Bir orchestrator'ın sıfır veya birden çok session'ı olabilir. Session kapanınca orchestrator silinmez.

Worker da bir orchestrator değildir. Worker, bir Project Kılıç'a bağlı `agent_runs` kaydı ve ona eşlik eden worker session'dır.

## Sonuç

Şema ve kod bu ayrımı zorunlu kılar. Workspace orchestrator'ında `project_id` yoktur. Project orchestrator'ında vardır. Session satırında orchestrator kimliği zorunludur; tersi yoktur.
