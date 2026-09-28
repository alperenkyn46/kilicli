# KILIÇ — Persistent Multi-Project Agentic Engineering Orchestrator

> **Durum:** Mimari Tasarım Dokümanı  
> **Amaç:** Kılıç sisteminin şimdiye kadar konuşulan tüm fikirlerini, kararlarını, prensiplerini ve hedef mimarisini tek bir yerde toplamak.  
> **Ana fikir:** Kullanıcı Claude, Codex veya Cursor ile değil; her zaman **Kılıç** ile konuşur. Kılıç modelden, session'dan, harness'tan ve tek bir projeden bağımsız, kalıcı bir engineering orchestrator'dır.

---

# 1. Vizyon

Agentic AI döneminde yazılımcının rolü doğrudan her işi yapan kişi olmaktan çıkıp, işleri doğru ajanlara dağıtan, kararları veren ve sonuçları yöneten kişiye dönüşebilir.

Bu sistemin temel metaforu şöyledir:

- **Kullanıcı:** karar verici / patron / principal
- **Kılıç:** kullanıcının kalıcı sağ kolu, chief-of-staff ve orchestrator'ı
- **Project Kılıçlar:** belirli projelerden sorumlu kalıcı alt orchestrator'lar
- **Micro-agents / workers:** belirli işleri yapan, kısa ömürlü, disposable ajanlar
- **Claude Code / Codex / Cursor:** Kılıç'ın kimliği değil, kullandığı execution harness'ları
- **LLM modelleri:** Kılıç'ın veya worker'ların o anda kullandığı işlem motorları
- **PostgreSQL tabanlı hafıza:** Kılıç'ın gerçek kalıcı hafızası
- **MCP:** Kılıç'ın hafızaya ve yeteneklere on-demand erişim katmanı
- **AGENTS.md:** hafıza değil, Kılıç'ın karakterini, amacını ve çalışma doktrinini belirleyen bootstrap/anayasa dosyası

Kullanıcının deneyimi her zaman tek bir ilişkiye dayanmalıdır:

```text
User
  │
  ▼
Kılıç
```

Arka planda kullanılan harness, model, worker sayısı, proje sayısı veya runtime değişse bile kullanıcı açısından aynı “sağ kol” devam eder.

---

# 2. Çözülmek İstenen Ana Problem

Uzun süre aynı coding agent ile çalışıldığında context window zamanla gereksiz bilgilerle dolar:

- eski terminal çıktıları
- başarısız denemeler
- geçmiş bug'lar
- artık geçerli olmayan kararlar
- farklı alanlara ait detaylar
- ilgisiz UI / backend / deployment bilgileri
- tekrar eden açıklamalar
- uzun geçmiş konuşmalar

Bu durum context capacity probleminden çok **context quality** problemidir.

Amaç:

```text
model intelligence ↑
tool access ↑
context size ↑
```

olurken aynı zamanda oluşan:

```text
context pollution ↑
context entropy ↑
```

problemini azaltmaktır.

Kılıç mimarisinin ana ilkesi:

> **Her agent yalnızca görevini tamamlamak için gereken minimum fakat yeterli context'i görmelidir.**

---

# 3. Ana Mimari Prensipler

## 3.1 Persistent Orchestrator

Kılıç session'a bağlı değildir.

Claude session biterse Kılıç bitmez.  
Codex limiti dolarsa Kılıç bitmez.  
Cursor kapanırsa Kılıç bitmez.

Kılıç'ın kimliği ve state'i session dışındadır.

---

## 3.2 Ephemeral Specialists

Micro-agent'lar kısa ömürlüdür.

Bir worker yalnızca şunları bilmelidir:

- görevi
- gerekli dosyalar / kaynaklar
- kabul kriterleri
- yetkileri
- çıktı formatı

Görev tamamlandıktan sonra ayrıntılı çalışma context'i yok olabilir.

Değerli bilgiler kalıcı hafızaya distill edilir.

---

## 3.3 Just-In-Time Context

Bütün proje geçmişi her session'a yüklenmez.

Ajan ihtiyacına göre gerekli bilgiyi hafıza sisteminden çeker.

Akış:

```text
Need
 ↓
Retrieve
 ↓
Use
 ↓
Discard
```

---

## 3.4 Artifact / Structured Memory

Kritik bilgiler chat geçmişinde tutulmamalıdır.

Kararlar, task state, proje ilişkileri, bağımlılıklar ve önemli bulgular yapılandırılmış şekilde kalıcı veri katmanında tutulur.

---

## 3.5 Session State ≠ Agent State

Session yalnızca geçici RAM'dir.

Agent state kalıcıdır.

```text
Session
  = temporary execution context

Kılıç State
  = persistent identity + memory + task state + policies
```

---

## 3.6 Runtime Independence

Kılıç:

- Claude değildir.
- Codex değildir.
- Cursor değildir.
- belirli bir modele bağlı değildir.
- belirli bir harness'a bağlı değildir.

Harness'lar Kılıç'ın execution engine'leridir.

---

## 3.7 Uzun Ömür = Daha Soyut Context

Temel prensip:

> **Bir agent ne kadar uzun ömürlüyse context'i o kadar soyut olmalıdır.**

```text
Workspace Kılıç
  → yıllar
  → en soyut bilgi

Project Kılıç
  → proje ömrü
  → project-level bilgi

Task / Operation
  → saatler / günler

Micro-agent
  → dakikalar
  → yoğun implementation detail
```

---

# 4. Kılıç'ın İki Katmanı

Kılıç kavramsal olarak ikiye ayrılır.

## 4.1 Kılıç Kernel

Deterministic software katmanıdır.

Sorumlulukları:

- runtime seçimi
- failover
- task / operation yönetimi
- state persistence
- checkpoint
- event logging
- model/harness routing
- workforce yönetimi
- policy enforcement
- project/workspace çözümleme
- memory gateway
- authorization
- retry davranışları
- observability

Kernel LLM değildir.

---

## 4.2 Kılıç Mind

O anda orchestrator reasoning yapan LLM/harness instance'ıdır.

Örneğin:

```text
Kılıç Kernel + Claude Opus
```

bir süre sonra:

```text
Kılıç Kernel + Codex GPT-X
```

olabilir.

Identity değişmez.

---

# 5. Genel Sistem Mimarisi

```text
                           USER
                            │
                            ▼
                  ┌──────────────────┐
                  │    KILIÇ UI      │
                  │   CLI / Web      │
                  └────────┬─────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  KILIÇ CONTROL PLANE │
                │                      │
                │ Identity             │
                │ Workspace Graph      │
                │ Operation Manager    │
                │ Task Orchestrator    │
                │ Runtime Router       │
                │ Workforce Manager    │
                │ Memory / Knowledge   │
                │ Impact Engine        │
                │ Policy Engine        │
                │ Checkpoints          │
                │ Observability        │
                └──────────┬───────────┘
                           │
                 Runtime Adapter Layer
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       Claude Code       Codex          Cursor
         Adapter         Adapter        Adapter
            │              │              │
         Models         Models         Models
            │              │              │
         Workers        Workers        Workers
```

---

# 6. AGENTS.md Ne Olmalı?

`AGENTS.md` Kılıç'ın **hafızası olmamalıdır**.

Dosya yalnızca şunları tanımlamalıdır:

- Kılıç kimdir?
- Kullanıcıyla ilişkisi nedir?
- temel karakteri nedir?
- amacı nedir?
- hangi sorumlulukları vardır?
- hangi işleri doğrudan yapmamalıdır?
- ne zaman delegasyon yapmalıdır?
- hangi memory araçlarını hangi durumda kullanmalıdır?
- runtime bağımsızlığı nedir?
- doğrulama prensipleri nelerdir?

AGENTS.md zamanla büyüyen bir log olmamalıdır.

Örnek fikir:

```md
# Kılıç

You are Kılıç, the user's persistent engineering orchestrator.

You are not Claude.
You are not Codex.
You are not Cursor.
You are not tied to any model provider.

Your persistent identity and operational state exist outside
the current session.

## Responsibilities

- understand user intent
- decompose work
- delegate non-trivial implementation
- provide minimum sufficient context to workers
- verify work
- manage cross-project impact
- preserve operational continuity
- report concise outcomes to the user

## Memory

Do not treat chat history as authoritative memory.

Use Kılıç Memory tools whenever:
- a past decision may matter
- project history is relevant
- dependency information is needed
- current task state is uncertain

## Runtime

The active runtime may change at any time.

Never depend on provider-specific behavior unless exposed
through the Runtime Adapter layer.

## Workforce

Micro-agents are disposable.
You are persistent.

Delegate implementation whenever delegation cost is justified.
```

---

# 7. AGENTS.md İçinde Olmaması Gerekenler

Şunlar `AGENTS.md` içine doldurulmamalıdır:

- geçmiş task detayları
- tüm architecture history
- bütün bug geçmişi
- eski terminal çıktıları
- deployment logları
- model isimleri
- aktif runtime
- proje bağımlılıklarının tamamı
- kullanıcıyla geçmiş konuşmalar
- bütün ADR'ler
- task checklist'leri
- operasyon state'i

Bunlar dinamik hafıza / control plane üzerinden alınmalıdır.

---

# 8. Hafıza Mimarisi

İlk günden ileri ölçek düşünülmelidir.

Ana persistent storage:

```text
PostgreSQL
```

Önerilen ek yetenek:

```text
pgvector
```

Supabase kullanılabilir, ancak Supabase domain architecture olmamalıdır.

Doğru bağımlılık:

```text
Kılıç Domain
    │
Repository / Data Access Layer
    │
PostgreSQL
```

Supabase:

- managed PostgreSQL
- Auth
- Realtime
- Storage
- API
- web uygulaması entegrasyonu

gibi altyapı servisleri sağlayabilir.

Gelecekte Supabase'den self-hosted PostgreSQL'e geçiş mümkün olmalıdır.

---

# 9. Structured Memory + Semantic Retrieval

Vector database tek başına hafıza değildir.

Temel gerçekler structured tutulmalıdır.

Örneğin bir karar:

```text
decision_id
workspace_id
project_id
title
decision
reason
status
created_at
created_by_run
supersedes
```

Semantic retrieval yalnızca şu tarz ihtiyaçlarda yardımcı olur:

> Daha önce authentication ile ilgili hangi kararlar alınmıştı?

Dolayısıyla:

```text
Structured Query
      +
Semantic Retrieval
```

birlikte kullanılmalıdır.

---

# 10. Memory Scope Hiyerarşisi

Memory tek havuz değildir.

Scope-aware olmalıdır.

```text
GLOBAL
  │
  ▼
WORKSPACE
  │
  ├──────────────┬──────────────┐
  ▼              ▼              ▼
PROJECT        PROJECT        PROJECT
  │
  ▼
OPERATION / TASK
  │
  ▼
RUN
  │
  ▼
AGENT
```

## GLOBAL

Örnek:

- kullanıcının uzun vadeli çalışma tercihleri
- Kılıç doctrine
- genel engineering ilkeleri

## WORKSPACE

Örnek:

- ekosistemin genel mimarisi
- projeler arası contract'lar
- ortak kararlar
- dependency graph
- shared services

## PROJECT

Örnek:

- proje mimarisi
- build/test komutları
- proje conventions
- proje-specific kararlar
- known issues

## TASK / OPERATION

Örnek:

- geçici kabul kriterleri
- aktif işin özel kısıtları
- kısa süreli implementation state

## RUN / AGENT

Ephemeral execution detayları.

---

# 11. Scope-Aware Retrieval

Örneğin TV projesinde çalışan bir Project Kılıç:

```text
memory.search("authentication")
```

yaptığında varsayılan olarak:

```text
GLOBAL
+
Current Workspace
+
TV Project
+
Current Operation
+
Current Task
```

kapsamında arama yapılmalıdır.

Backend'e ait alakasız detaylar otomatik olarak getirilmemelidir.

Ancak dependency nedeniyle gerekirse Impact Engine veya Project Graph başka scope'lardan bilgi getirebilir.

Bu sayede:

> context isolation

ile:

> cross-project awareness

aynı anda korunur.

---

# 12. Memory Distillation

Worker'ın bütün reasoning geçmişi saklanmamalıdır.

Akış:

```text
Raw worker context
      ↓
Useful finding
      ↓
Distillation
      ↓
Structured persistent memory
```

Örnek:

Worker keşfeder:

```text
UserService iki farklı transaction boundary kullanıyor.
```

Kalıcı hafızaya:

```text
Finding:
UserService transaction boundaries are inconsistent.

Affected:
- createUser()
- updateUser()

Recommendation:
Future refactor should normalize behavior.
```

gibi sıkıştırılmış bilgi yazılır.

---

# 13. Memory Garbage Collection

Kalıcı hafıza sonsuza kadar kontrolsüz büyümemelidir.

Kategoriler:

```text
active information        → keep
historical but useful     → archive
obsolete                  → mark superseded / remove
duplicated                → merge
task-specific noise       → discard
```

Özellikle kararlar silinmek yerine `superseded` ilişkisiyle versiyonlanabilir.

---

# 14. MCP'nin Rolü

MCP doğrudan “hafıza” değildir.

MCP, Kılıç'ın hafıza ve yetenek sistemlerine erişim protokolüdür.

Bilgi türü başına ayrı MCP server oluşturmak yerine sorumluluk sınırlarına göre ayrım tercih edilmelidir.

İlk çekirdek MCP'ler:

```text
kilic-memory
kilic-workforce
```

Gelecekte:

```text
github
linear
sentry
deployment
analytics
```

gibi dış sistem MCP'leri eklenebilir.

---

# 15. kilic-memory MCP

Olası tool'lar:

```text
memory.search
memory.get
memory.remember_fact
memory.forget_fact

decision.search
decision.get
decision.record

project.summary
project.architecture

workspace.summary
workspace.graph

task.current
task.history

operation.current
operation.history

checkpoint.latest
checkpoint.create

finding.record
finding.search
```

Kılıç hangi durumda hangi tool'u kullanacağını AGENTS.md doctrine üzerinden bilir.

---

# 16. Hafıza Güvenliği

LLM'e doğrudan SQL erişimi verilmemelidir.

Yanlış:

```text
LLM
 ↓
PostgreSQL
```

Doğru:

```text
LLM
 ↓
MCP / Tool Contract
 ↓
Validation
 ↓
Memory Service
 ↓
Repository Layer
 ↓
PostgreSQL
```

Örnek:

```text
decision.record(
  title,
  decision,
  reason,
  scope,
  confidence,
  supersedes
)
```

gibi kontrollü schema'lar kullanılmalıdır.

---

# 17. Workforce MCP

Kılıç harness-specific spawn syntax bilmemelidir.

Kılıç yalnızca:

```text
workforce.spawn(...)
```

kullanmalıdır.

Örnek:

```json
{
  "role": "frontend",
  "task": "Redesign property detail page",
  "project": "web",
  "context": [
    "src/pages/property",
    "design-system"
  ]
}
```

Kernel bunun hangi harness/model üzerinde çalışacağını çözer.

---

# 18. Micro-Agent Felsefesi

Micro-agent'ın amacı kişilik taşımak değildir.

Worker yalnızca şunları bilmelidir:

```text
Görev
Yetki
Gerekli context
Kabul kriteri
Output format
```

Örnek roller:

```text
explorer
architect
frontend
backend
reviewer
tester
security
compatibility-reviewer
researcher
migration-agent
```

---

# 19. Orchestrator'ın Görevi

Kılıç'ın ana görevi işi kendisi yapmak değildir.

Görevleri:

1. Kullanıcı intent'ini anlamak
2. İşi complexity açısından sınıflandırmak
3. İşi parçalara bölmek
4. Doğru worker'ı seçmek
5. Minimum yeterli context sağlamak
6. Paralel çalışmayı yönetmek
7. Worker çıktısını incelemek
8. Çelişkileri çözmek
9. Test ve doğrulama yapmak
10. Cross-project etkileri analiz etmek
11. Sonucu kullanıcıya kısa ve tutarlı biçimde aktarmak

---

# 20. Orchestrator Doğrudan Kod Yazmalı mı?

Mutlak bir “asla kod yazma” kuralı verimsiz olabilir.

Daha doğru prensip:

> Kılıç implementation yapmaktan kaçınır; yalnızca delegasyon maliyetinin işten daha yüksek olduğu trivial görevleri doğrudan yapabilir.

Örnek complexity modeli:

```text
LEVEL 0
Tiny / local change
→ orchestrator doğrudan veya 1 worker

LEVEL 1
Small bug / UI tweak
→ 1 implementer + gerekirse reviewer

LEVEL 2
Feature
→ explorer → implementer → reviewer/tester

LEVEL 3
Cross-cutting refactor
→ explorer → architect → parallel implementers → reviewer → tester

LEVEL 4
Major architectural operation
→ research → architecture → project orchestrators
  → parallel teams → integration → adversarial review
```

---

# 21. Harness Independence

Desteklenmesi planlanan harness'lar:

```text
Claude Code
Codex
Cursor
```

Gelecekte:

```text
Gemini CLI
başka coding agents
özel harness'lar
```

eklenebilmelidir.

Kılıç core bunların hiçbirine hard-code edilmemelidir.

---

# 22. Runtime Adapter Layer

Her harness ortak interface'e normalize edilmelidir.

Örnek:

```typescript
interface RuntimeAdapter {
  start(options): Session;
  send(session, message): AsyncStream<Event>;
  interrupt(session): void;
  capabilities(): Capabilities;
  status(): RuntimeStatus;
}
```

Normalize status:

```text
AVAILABLE
RATE_LIMITED
QUOTA_EXHAUSTED
AUTH_REQUIRED
FAILED
OFFLINE
```

---

# 23. Harness-Specific Adapter'lar

Örnek:

```text
ClaudeAdapter
CodexAdapter
CursorAdapter
```

Adapter sorumlulukları:

- session başlatma
- prompt gönderme
- event streaming
- tool / permission mapping
- interruption
- structured output
- error normalization
- quota / rate limit tanıma
- model selection
- capability discovery

---

# 24. Runtime Routing

Routing LLM'e bırakılmamalıdır.

Özellikle failover deterministic code olmalıdır.

Örnek priority:

```text
1. Claude
2. Codex
3. Cursor
```

Kernel:

```text
Claude: QUOTA_EXHAUSTED
        ↓
Codex: AVAILABLE
        ↓
switch
```

kararını kendisi verir.

---

# 25. Failover Akışı

Claude limiti bittiğinde yalnızca aynı prompt Codex'e atılmaz.

Doğru failover:

```text
1. runtime error classify
2. active state checkpoint
3. current git diff snapshot
4. active task state save
5. incomplete workers mark
6. operation state update
7. next runtime select
8. bootstrap context reconstruct
9. resume
```

Yeni runtime'a tüm Claude chat history gönderilmez.

Sadece gerekli state:

```text
AGENTS.md
current operation
current task
latest checkpoint
relevant project memory
relevant workspace memory
current repository state / diff
```

---

# 26. Checkpoint Sistemi

Checkpoint tetikleyicileri:

```text
major decision made
task phase completed
before context compaction
before runtime switch
after failed attempt
before risky change
before user-visible completion
```

Checkpoint structured olmalıdır.

Örnek:

```json
{
  "operation": "AUTH-V2",
  "task": "backend-auth-refactor",
  "runtime": "claude",
  "phase": "implementation",
  "completed": [
    "session abstraction",
    "token refresh refactor"
  ],
  "remaining": [
    "integration tests",
    "mobile compatibility review"
  ],
  "important_files": [
    "src/auth/session.ts",
    "tests/auth.integration.ts"
  ],
  "risks": [
    "legacy mobile login helper"
  ]
}
```

Bu yapı `handoff.md` ihtiyacını büyük ölçüde ortadan kaldırır.

---

# 27. Kılıç'ın Runtime Geçişi

Kullanıcı deneyimi:

```text
> navbarı yeniden tasarla, responsive davranışı bozma

Kılıç:
Runtime: Claude
...
Claude quota exhausted
Checkpoint saved
Switching runtime

Kılıç:
Runtime: Codex
Context reconstructed
Continuing operation
```

Kullanıcı açısından aynı Kılıç devam eder.

---

# 28. Harness / Model Yönetilebilirliği

Hiçbir model veya harness hard-code edilmemelidir.

Yönetilebilir entity'ler:

```text
harnesses
models
model_profiles
agent_roles
runtime_policies
routing_policies
execution_profiles
```

---

# 29. Kılıç Runtime Policy

Örnek:

```text
Kılıç

Primary:
  Claude Code / Opus

Fallback 1:
  Codex / GPT-X

Fallback 2:
  Cursor / Model-Y
```

Ek policy alanları:

```text
max_parallel_workers
max_cost
max_context
allowed_tools
timeout
retry_policy
approval_policy
```

---

# 30. Role-Based Model Routing

Model seçimi sadece harness seviyesinde olmamalıdır.

Örneğin:

```text
ROLE: explorer

priority:
1. Claude / Sonnet
2. Codex / GPT-X
3. Cursor / Model-Y
```

```text
ROLE: reviewer

priority:
1. Claude / Opus
2. Codex / GPT-X
```

```text
ROLE: frontend

priority:
1. Claude / Sonnet
2. Cursor / Model-X
3. Codex / GPT-X
```

Kılıç:

```text
spawn(role="reviewer")
```

der.

Router uygun harness/modeli seçer.

---

# 31. Execution Profiles

Yönetilebilir profiller:

```text
QUALITY
BALANCED
CHEAP
EMERGENCY
```

Örnek:

## QUALITY

```text
Orchestrator → strongest available
Architect    → strongest
Reviewer     → strongest
Explorer     → medium
Worker       → medium
```

## CHEAP

```text
Orchestrator → medium
Architect    → medium
Reviewer     → medium
Explorer     → cheap
Worker       → cheap
```

CLI:

```bash
kilic --profile quality
```

Web UI üzerinden de seçilebilir.

---

# 32. Heterogeneous Workforce

İleri aşamada orchestrator ve worker'ların aynı provider üzerinde olması zorunlu değildir.

Örnek:

```text
                Kılıç / Claude Opus
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Explorer       Backend       Reviewer
       Codex         Claude         Cursor
```

Bu sistem:

> heterogeneous agent workforce

olarak davranabilir.

İlk sürümde basit priority chain kullanılabilir fakat mimari baştan bunu desteklemelidir.

---

# 33. Tek Proje Değil, Workspace

Kılıç'ın gerçek çalışma alanı tek proje olmamalıdır.

Birden fazla ilişkili proje:

```text
Agent1 Workspace
├── Backend
├── Web
├── TV
└── Admin
```

bir bütün olarak ele alınmalıdır.

Workspace birinci sınıf domain entity olmalıdır.

---

# 34. Project Graph

Projeler arasındaki ilişkiler açık şekilde modellenmelidir.

Örnek:

```text
Backend
   │
   ├── API provider → Web
   ├── API provider → TV
   └── API provider → Admin
```

veya:

```text
Shared UI
   ├── Web
   └── Admin
```

Relation türleri örneğin:

```text
API_PROVIDER
PACKAGE_DEPENDENCY
GENERATED_TYPES_PROVIDER
SHARED_DATABASE
EVENT_PRODUCER
EVENT_CONSUMER
SHARED_LIBRARY
DEPLOYMENT_DEPENDENCY
SCHEMA_PROVIDER
```

---

# 35. Workspace Domain Model

Önerilen entity'ler:

```text
workspaces
projects
repositories
services
interfaces
project_relations
dependencies
environments
contracts
```

---

# 36. Impact Engine

Bir projede yapılan değişiklik diğer projeleri etkileyebilir.

Bu nedenle:

```text
impact.analyze(change)
```

gibi bir capability gerekir.

Örnek:

```text
Changed:
backend/src/api/property.ts

Directly affected:
- backend

Potentially affected:
- web
- tv
- admin

Reason:
PropertyResponse is consumed by these projects.
```

Kılıç gerekli compatibility task'larını otomatik oluşturabilir.

---

# 37. Cross-Project Operation

Örnek kullanıcı isteği:

> Login sistemimizi tamamen değiştirelim.

Bu tek task değildir.

```text
OPERATION: AUTH-V2
```

oluşur.

Alt görevler:

```text
Backend
  → implement new auth API

Web
  → migrate client

TV
  → migrate auth flow

Admin
  → compatibility validation
```

---

# 38. Operation Kavramı

Domain hierarchy:

```text
Workspace
   │
Operation
   │
   ├── Task
   │    ├── Run
   │    └── Agent Runs
   │
   ├── Task
   └── Task
```

Operation özellikle çok projeli büyük değişikliklerin koordinasyon birimidir.

---

# 39. Her Projenin Kendi Kılıç'ı

Çoklu proje yönetiminde her proje için ayrı persistent Kılıç instance'ı kullanılması önerilir.

```text
                         USER
                          │
                          ▼
                  Workspace Kılıç
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   Backend Kılıç       Web Kılıç       TV Kılıç
          │               │               │
      workers          workers          workers
```

Bu yaklaşım context isolation'ı ciddi şekilde iyileştirir.

---

# 40. Workspace Kılıç

Workspace Kılıç:

- projeler arası koordinasyon
- project graph
- dependency graph
- cross-project operation
- global/workspace decisions
- project impact
- Project Kılıç task assignment
- final user communication

ile ilgilenir.

Workspace Kılıç implementation detayı bilmek zorunda değildir.

Örneğin bir dosyanın 184. satırını bilmek onun görevi değildir.

---

# 41. Project Kılıç

Her Project Kılıç kendi domaininde derinleşir.

## Backend Kılıç örneği

Bilir:

```text
backend architecture
backend conventions
backend decisions
API contracts
database behavior
test commands
build commands
known backend risks
```

## Web Kılıç

```text
frontend architecture
design system
state management
browser behavior
component conventions
frontend tests
```

## TV Kılıç

```text
Android architecture
TV limitations
WebView behavior
APK/build process
device compatibility
TV-specific constraints
```

---

# 42. Project Kılıç'ın Yaşam Süresi

```text
Workspace Kılıç   → persistent
Project Kılıç     → persistent
Micro-agent       → ephemeral
```

Project Kılıç'ın yaşam süresi proje ömrüne yakındır.

Ancak Project Kılıç'ın chat session'ı persistent olmak zorunda değildir.

Identity + state + memory persistent'tır.

---

# 43. Tek Karakter, Çok Instance

Her proje için farklı kişilik kopyalanmamalıdır.

Merkezi Kılıç doctrine:

```text
Kılıç Identity
     │
     ├── Backend Project Orchestrator
     ├── Web Project Orchestrator
     └── TV Project Orchestrator
```

Runtime metadata:

```text
role = PROJECT_ORCHESTRATOR
project = Agent1 Backend
workspace = Agent1
```

ile instance specialize edilir.

Bu yaklaşım personality drift'i önler.

---

# 44. Project Kılıçların Doğrudan Mesh Oluşturması

Kontrolsüz şekilde:

```text
Backend Kılıç ←→ Web Kılıç
      ↑             ↓
TV Kılıç   ←→   Admin Kılıç
```

yapısı önerilmez.

Sorunlar:

- otorite belirsizliği
- duplicate task
- conflicting decision
- bilgi döngüsü
- audit güçlüğü
- operation owner belirsizliği

Tercih edilen model:

```text
Backend Kılıç
      │
      ▼
Workspace Kılıç
      │
      ▼
Web Kılıç
```

Cross-project event'ler Workspace Kılıç üzerinden koordine edilir.

---

# 45. Cross-Project Impact Event

Örnek:

```text
IMPACT_DISCOVERED

source_project: backend
contract: AuthResponse

affected_projects:
- web
- tv
- admin
```

Workspace Kılıç:

```text
Web Kılıç   → compatibility task
TV Kılıç    → compatibility task
Admin Kılıç → compatibility task
```

oluşturur.

---

# 46. Multi-Project Operation Örneği

```text
                    AUTH-V2
                       │
                Workspace Kılıç
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
Backend Kılıç       Web Kılıç        TV Kılıç
      │                │                │
Task B-122         Task W-87        Task T-31
      │                │                │
workers            workers          workers
```

Project Kılıç sonuçları structured formatta üst orchestrator'a döndürür.

Örnek:

```text
Backend:
DONE
contract changed
tests passed

Web:
DONE
client migrated
tests passed

TV:
BLOCKED
legacy auth helper incompatible
```

Workspace Kılıç bunu kullanıcıya tek bir anlatı halinde sunar.

---

# 47. Per-Orchestrator Runtime

Her Project Kılıç farklı harness/model kullanabilir.

Örnek:

```text
Workspace Kılıç
Claude / Opus

Backend Kılıç
Codex / GPT-X

Web Kılıç
Claude / Sonnet

TV Kılıç
Cursor / Model-Y
```

Failover project orchestrator bazında yapılabilir.

Örneğin Backend Kılıç Codex limitine ulaşır:

```text
Backend Kılıç
Codex
  ↓
Claude
```

Bu sırada Web ve TV Kılıç etkilenmez.

---

# 48. Project Kılıç Workforce Örneği

```text
Web Kılıç
│
├── Explorer
│   Claude / Haiku
│
├── Frontend Worker
│   Claude / Sonnet
│
└── Reviewer
    Claude / Opus
```

Backend:

```text
Backend Kılıç
│
├── Explorer
│   Codex / Model-A
│
├── Implementer
│   Codex / Model-B
│
└── Reviewer
    Claude / Opus
```

Bütün seçimler Control Plane üzerinden yönetilebilir olmalıdır.

---

# 49. Proposed Core Database Entities

Aşağıdaki domain modeli konuşulan mimariyi desteklemek için başlangıç noktasıdır:

```text
users

workspaces
projects
repositories
services
interfaces
contracts
project_relations
dependencies

operations
operation_projects
tasks
task_dependencies

agent_roles
orchestrators
agent_runs

harnesses
models
model_profiles
runtime_profiles
routing_policies
execution_profiles

memories
facts
decisions
findings
memory_embeddings

runs
sessions
checkpoints

events
artifacts

permissions
policies
approvals
```

Bu kesin schema değil, domain sınırlarının taslak görünümüdür.

---

# 50. Event Log

Önemli bütün sistem olayları append-only event log'a yazılmalıdır.

Örnek:

```text
14:21 operation created
14:22 backend explorer spawned
14:23 dependency discovered
14:25 implementation started
14:41 checkpoint created
14:42 Claude quota exhausted
14:42 runtime switched to Codex
14:43 operation resumed
15:07 reviewer completed
15:11 operation completed
```

Bu:

- debugging
- audit
- web UI timeline
- recovery
- analytics
- agent performance ölçümü

için önemlidir.

---

# 51. Event Sourcing Yaklaşımı

Tam event sourcing zorunlu değildir.

Ancak:

```text
State = current truth
Events = how we got here
```

ayrımı korunmalıdır.

Sistem state'i normal tablolarda tutulabilir, event log ise append-only history olabilir.

---

# 52. Artifact Yönetimi

Agent çıktılarının yalnızca chat text'i olarak kalmaması gerekir.

Artifact örnekleri:

```text
diff
patch
test report
architecture proposal
impact report
migration plan
review report
benchmark
generated file
screenshots
logs
```

Artifact'lar object storage'da tutulabilir.

Supabase Storage bu amaçla kullanılabilir.

DB'de metadata tutulur.

---

# 53. CLI ve Web UI

Kullanıcının ana interaction surface'i başlangıçta CLI olabilir.

Örnek:

```bash
cd ~/Projects/agent1
kilic
```

UI:

```text
KILIÇ
Project: Agent1
Workspace: Agent1 Ecosystem
Runtime: Claude / Opus
Memory: connected
Active operation: none

>
```

Kullanıcı:

```text
> ilan detay sayfasını yeniden tasarla fakat davranışı bozma
```

der.

---

# 54. Web UI

Web UI aynı backend/control plane'e bağlanmalıdır.

Yani CLI ve Web ayrı sistemler değil, farklı client'lar olmalıdır.

```text
              ┌──────── CLI
              │
User ─ kilicd ┼──────── Web UI
              │
              └──────── future mobile
```

---

# 55. kilicd

İleri tasarımda local veya remote daemon/service:

```text
kilicd
```

bulunabilir.

Sorumluluk:

- UI connection
- streaming
- runtime processes
- local repo access
- workspace state
- execution queue
- adapter lifecycle

CLI yalnızca client olabilir.

---

# 56. Kılıç Control Center

Web arayüzünde yönetilebilir alanlar:

```text
Workspaces
Projects
Project Graph
Operations
Tasks
Kılıç Instances
Workers
Harnesses
Models
Routing
Memory
Decisions
Events
Artifacts
Costs
Usage
Policies
Approvals
```

---

# 57. Dashboard Örneği

```text
KILIÇ CONTROL CENTER

Workspace: Agent1
────────────────────────────────────

Projects

● Backend
● Web
● TV
● Admin

Active Operation
AUTH-V2

Orchestrators

Workspace Kılıç    Claude / Opus
Backend Kılıç      Codex / GPT-X
Web Kılıç          Claude / Sonnet
TV Kılıç           Cursor / Model-Y

Workers

Backend Explorer       Codex
Backend Implementer    Codex
Web Reviewer           Claude
TV Reviewer            Cursor
```

---

# 58. Project Graph UI

Graph görsel olmalıdır.

Örnek:

```text
                 ┌─────────┐
                 │ Backend │
                 └────┬────┘
                      │ API
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
    ┌───────┐     ┌──────┐      ┌───────┐
    │  Web  │     │  TV  │      │ Admin │
    └───┬───┘     └──────┘      └───┬───┘
        │                             │
        └─────────┐        ┌─────────┘
                  ▼        ▼
                 shared-ui
```

Node seçildiğinde:

```text
Project: Web

Repository:
~/Projects/agent1-web

Dependencies:
backend
shared-ui

Current Branch:
feature/auth-v2

Recent Operations:
AUTH-V2
PROPERTY-FILTER
NAVBAR-REDESIGN
```

---

# 59. Runtime / Model Yönetim UI

Örnek:

```text
Claude Code
────────────────────────────

Orchestrator
  Claude Opus

Explorer
  Claude Sonnet

Frontend Worker
  Claude Sonnet

Reviewer
  Claude Opus

Tester
  Claude Haiku
```

Codex ve Cursor için ayrı mappings bulunabilir.

---

# 60. Model ve Harness Configuration Scope

Konfigürasyon farklı scope'larda override edilebilir:

```text
GLOBAL DEFAULT
   ↓
WORKSPACE OVERRIDE
   ↓
PROJECT OVERRIDE
   ↓
ROLE OVERRIDE
   ↓
OPERATION OVERRIDE
```

Örnek:

Global:

```text
Reviewer → Claude Opus
```

Ama TV projesinde:

```text
Reviewer → Codex Model-X
```

override edilebilir.

---

# 61. Capability-Aware Routing

Gelecekte router yalnızca priority değil şu faktörleri de kullanabilir:

```text
task type
model capability
harness capability
remaining quota
latency
cost
context size
tool availability
historical success rate
project preference
user profile
```

İlk sürümde deterministic priority kullanılabilir fakat veri modeli ileri routing'e açık olmalıdır.

---

# 62. Cost ve Usage Tracking

Her run için:

```text
input tokens
output tokens
cache reads
cache writes
estimated cost
runtime
model
role
project
operation
task
```

takip edilebilir.

Bu sayede:

```text
cost per completed task
cost per project
cost per agent role
cost per harness
```

analizleri yapılabilir.

---

# 63. Orchestrator Başarı Metrikleri

Kılıç'ın başarısı yazdığı kod miktarıyla ölçülmemelidir.

Önerilen metrikler:

```text
delegation accuracy
context efficiency
task success rate
regression rate
verification coverage
cost per completed task
user intervention count
runtime failover success
cross-project impact detection
memory retrieval relevance
worker rework rate
```

---

# 64. Context Efficiency

En iyi orchestrator:

> En az gereksiz token ile doğru agent'a doğru işi yaptıran orchestrator'dır.

Bu sistemin optimizasyon hedeflerinden biri:

```text
maximum useful context
minimum context noise
```

olmalıdır.

---

# 65. Verification Gates

Bir iş yalnızca implementation tamamlanınca bitmiş sayılmamalıdır.

Kılıç'ın completion gate'leri olabilir:

```text
implementation complete
tests pass
review complete
impact analysis complete
dependent project checks complete
critical risks resolved
checkpoint saved
user-visible summary ready
```

---

# 66. Security / Permission Model

İleri tasarımda agent'lar farklı izin profillerine sahip olmalıdır.

Örnek:

```text
explorer
  read-only

reviewer
  read-only
  test execution

implementer
  repo write
  local commands

deployment-agent
  deployment tools
  approval required
```

Kılıç'ın tool authorization policy'si Control Plane tarafından uygulanmalıdır.

---

# 67. Approval Policy

Riskli aksiyonlar deterministic policy ile kullanıcı onayı gerektirebilir.

Örnek:

```text
production deploy
database destructive migration
secret rotation
force push
branch deletion
data deletion
billing-impacting infrastructure change
```

LLM kendi başına bu sınırı kaldıramamalıdır.

---

# 68. Project Discovery

Yeni proje sisteme eklenirken Project Kılıç başlangıç keşfi yapabilir:

```text
framework
language
repo structure
build commands
test commands
dependencies
external APIs
database
deployment method
shared packages
contracts
known project relations
```

Bu bilgiler structured olarak kaydedilir.

---

# 69. Dependency Graph Nasıl Güncel Kalır?

Graph tamamen manuel olmamalıdır.

Kaynaklar:

```text
package manifests
imports
OpenAPI
GraphQL schema
protobuf
environment config
CI config
deployment config
docker compose
monorepo metadata
explicit user relations
agent findings
```

Ancak otomatik keşfedilen relation'lar confidence ile işaretlenmelidir.

---

# 70. Authoritative vs Inferred Knowledge

Hafızadaki bilgi tipleri ayrılmalıdır:

```text
AUTHORITATIVE
  user-confirmed
  repository fact
  explicit config

INFERRED
  agent interpretation
  detected dependency
  predicted impact

HISTORICAL
  old decision
  superseded behavior
```

Bu sayede Kılıç kesin olmayan bilgiyi gerçek gibi kullanmaz.

---

# 71. Project Kılıç'ın Default Context'i

Bir Project Kılıç yeni session'a başladığında her şeyi okumamalıdır.

Bootstrap:

```text
Kılıç doctrine
project identity
project summary
active operation/task
latest relevant checkpoint
relevant memory handles
runtime metadata
```

Gerektiğinde daha derin retrieval yapılır.

---

# 72. Workspace Kılıç'ın Default Context'i

Workspace Kılıç:

```text
Kılıç doctrine
workspace summary
project list
high-level dependency graph
active operations
cross-project decisions
current blockers
```

gibi yüksek seviye bilgiyle başlar.

Dosya detayları getirilmez.

---

# 73. Micro-Agent Context'i

Worker için:

```text
task
acceptance criteria
specific files
relevant architectural constraints
required commands
output schema
```

verilir.

Şunlar verilmemeye çalışılır:

```text
unrelated task history
entire project memory
all workspace decisions
full conversation history
irrelevant logs
other project details
```

---

# 74. Context Contamination Prevention

Örnek:

Frontend worker'a:

```text
3 aylık backend migration geçmişi
deployment logları
database tartışmaları
```

verilmemelidir.

Ancak UI'yi etkileyen bir API contract varsa sadece ilgili contract bilgisi verilir.

---

# 75. Context Lifecycle

```text
Global memory
  → months / years

Workspace memory
  → workspace lifetime

Project memory
  → project lifetime

Operation memory
  → days / weeks

Task memory
  → hours / days

Micro-agent context
  → minutes
```

---

# 76. Kılıç User Experience

Amaç kullanıcının hiçbir zaman:

```text
Claude'a ne demiştim?
Codex nerede kalmıştı?
Cursor bunu biliyor mu?
```

diye düşünmemesidir.

Kullanıcı yalnızca:

```text
Kılıç, devam.
```

demelidir.

Kılıç state'i yeniden reconstruct eder.

---

# 77. Örnek Tek Proje Akışı

Kullanıcı:

> Login ekranını yeniden tasarla. Auth davranışı bozulmasın.

Kılıç:

1. Task complexity belirler.
2. Explorer spawn eder.
3. Explorer relevant files ve auth boundary çıkarır.
4. Frontend worker spawn eder.
5. Worker sadece gerekli dosyaları görür.
6. Reviewer spawn edilir.
7. Test worker auth regression kontrol eder.
8. Kılıç sonuçları birleştirir.
9. Memory'ye kalıcı değerli finding varsa yazar.
10. Kullanıcıya özet döner.

Kullanıcı micro-agent konuşmalarını görmek zorunda değildir.

---

# 78. Örnek Cross-Project Akışı

Kullanıcı:

> Property API response yapısını değiştirelim.

Workspace Kılıç:

1. Backend Project Kılıç'a task verir.
2. Backend Kılıç explorer + implementer kullanır.
3. Contract değişimi Impact Engine'e gider.
4. Graph Web, TV ve Admin'i consumer olarak bulur.
5. Workspace Kılıç üç compatibility task açar.
6. Her Project Kılıç kendi worker'larını yönetir.
7. Sonuçlar Workspace Kılıç'a gelir.
8. Cross-project operation completion gate uygulanır.
9. Kullanıcıya tek özet verilir.

---

# 79. Örnek Runtime Failover

Aktif:

```text
Workspace Kılıç
Runtime: Claude
```

Claude limit:

```text
QUOTA_EXHAUSTED
```

Kernel:

```text
checkpoint
save task state
save operation state
snapshot repo state
select fallback
```

Codex:

```text
load Kılıç doctrine
load current operation
load latest checkpoint
retrieve relevant memory
continue
```

Kılıç kimliği değişmez.

---

# 80. CLI Örneği

```text
$ kilic

KILIÇ
──────────────────────────────
Workspace    Agent1
Project      auto
Profile      Quality
Runtime      Claude / Opus
Memory       Connected
Operations   1 active
──────────────────────────────

> auth sistemini v2'ye geçirelim

Kılıç:
Bu değişiklik Backend, Web, TV ve Admin projelerini etkileyen
cross-project bir operation olarak açıldı.

Operation: AUTH-V2
Projects: 4
Current runtime: Claude / Opus
```

---

# 81. Runtime Değişimi UI

```text
Runtime exhausted: Claude / Opus
Checkpoint saved.

Fallback selected:
Codex / GPT-X

Context reconstructed.
Operation AUTH-V2 resumed.
```

---

# 82. Sistem Terminolojisi

## Kılıç

Kullanıcının modelden bağımsız persistent orchestrator kimliği.

## Workspace Kılıç

Birbiriyle ilişkili projelerin üst koordinatörü.

## Project Kılıç

Tek bir projenin persistent orchestrator instance'ı.

## Micro-Agent

Kısa ömürlü specialist worker.

## Harness

Claude Code, Codex, Cursor gibi coding execution environment.

## Runtime

Harness + model + active session kombinasyonu.

## Adapter

Harness-specific davranışı normalized API'ye çeviren katman.

## Operation

Bir veya daha fazla projeyi etkileyebilen büyük iş birimi.

## Task

Operation altındaki uygulanabilir iş birimi.

## Run

Bir task veya agent execution attempt'i.

## Checkpoint

İşin güvenli şekilde devam ettirilebilmesi için kaydedilen structured state.

## Memory

Kılıç'ın kalıcı bilgi sistemi.

## Project Graph

Projelerin ve contract/bağımlılık ilişkilerinin modeli.

## Impact Engine

Bir değişikliğin diğer proje ve servisler üzerindeki etkisini analiz eden katman.

## Control Plane

Kılıç'ın routing, state, workforce ve policy yönetim merkezi.

---

# 83. Kılıç'ın Temel Tasarım Özeti

Sistem şu katmanlara ayrılır:

## Layer 1 — Identity

```text
AGENTS.md
Kılıç character
purpose
doctrine
responsibilities
```

## Layer 2 — Control Plane

```text
workspace
projects
operations
tasks
policies
routing
checkpoints
events
```

## Layer 3 — Knowledge Plane

```text
PostgreSQL
pgvector
structured memory
scope-aware retrieval
```

## Layer 4 — Project / Impact Plane

```text
project graph
dependency graph
contracts
impact analysis
```

## Layer 5 — Runtime Plane

```text
Claude Adapter
Codex Adapter
Cursor Adapter
failover
```

## Layer 6 — Workforce Plane

```text
Project Kılıç
micro-agents
roles
model routing
```

## Layer 7 — Interface Plane

```text
CLI
Web Control Center
future mobile
```

---

# 84. Nihai Hiyerarşi

```text
                         USER
                          │
                          ▼
                 WORKSPACE KILIÇ
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
   BACKEND KILIÇ       WEB KILIÇ        TV KILIÇ
          │               │                │
      workers          workers          workers
          │               │                │
          └───────────────┼────────────────┘
                          │
                  Shared Workspace State
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
     Memory           Project Graph       Events
        │
     PostgreSQL
```

---

# 85. En Önemli Kurallar

1. **Kılıç hiçbir session'a bağlı değildir.**
2. **Kılıç hiçbir modelin kimliği değildir.**
3. **AGENTS.md hafıza değildir.**
4. **Kalıcı state session history'de tutulmaz.**
5. **Worker context'i minimum sufficient olmalıdır.**
6. **Micro-agent disposable'dır.**
7. **Project Kılıç persistent'tır.**
8. **Workspace Kılıç persistent'tır.**
9. **Cross-project coordination Workspace Kılıç üzerinden yürür.**
10. **Runtime routing deterministic Control Plane sorumluluğudur.**
11. **Model/harness seçimi yönetilebilir configuration olmalıdır.**
12. **Hafıza scope-aware olmalıdır.**
13. **Structured memory semantic memory'den önce gelir.**
14. **Vector search source-of-truth değildir.**
15. **Değerli agent bulguları distill edilmelidir.**
16. **Project dependency graph first-class entity'dir.**
17. **Cross-project değişikliklerde impact analysis yapılmalıdır.**
18. **Runtime failover state kaybetmemelidir.**
19. **Riskli aksiyonlar policy/approval katmanından geçmelidir.**
20. **Kullanıcı her zaman yalnızca Kılıç ile konuşuyor gibi hissetmelidir.**

---

# 86. Ürünün Temel Vaadi

Kullanıcı:

```text
Claude kullanmıyor.
Codex kullanmıyor.
Cursor kullanmıyor.
```

Kullanıcı:

```text
Kılıç kullanıyor.
```

Claude, Codex ve Cursor yalnızca Kılıç'ın gerektiğinde değiştirdiği execution engine'leridir.

Aynı şekilde worker agent'lar da kimlik değildir.

Onlar operasyonel kaynaklardır.

Kılıç'ın gerçek değeri:

- süreklilik
- context yönetimi
- delegation
- cross-project awareness
- doğru runtime/model routing
- hafıza
- doğrulama
- kullanıcı intent'ini koruma

yeteneğidir.

---

# 87. Uzun Vadeli Hedef

Kılıç'ın son hali yalnızca bir coding CLI değil, kullanıcının bütün yazılım ekosistemini yöneten kişisel bir:

> **AI Engineering Control Plane**

olmalıdır.

Bu yapı:

```text
User
  ↓
Persistent Engineering Orchestrator
  ↓
Project Orchestrators
  ↓
Disposable Specialist Workforce
  ↓
Multiple Harnesses / Models
  ↓
Multiple Interconnected Projects
```

şeklinde çalışır.

Amaç tek bir agent'ı daha uzun süre kullanmak değil;

> **doğru context'i, doğru zamanda, doğru agent'a, doğru model/harness üzerinde vererek bütün yazılım organizasyonunu yönetilebilir hale getirmektir.**

---

# 88. Şu Ana Kadarki Ana Mimari Kararlar

## Kesinleşen / güçlü şekilde kabul edilenler

- Kılıç session bağımsız olacak.
- Kılıç model/harness bağımsız olacak.
- Claude Code, Codex ve Cursor adapter olarak kullanılacak.
- Kılıç için kendi CLI / Web gateway/control-plane aracı yazılacak.
- Kılıç identity dosyası `AGENTS.md` olacak.
- `AGENTS.md` yalnızca karakter, amaç ve doctrine içerecek.
- Hafıza dosya yığını olarak tutulmayacak.
- PostgreSQL esas persistent store olacak.
- Supabase altyapı sağlayıcı olarak değerlendirilebilir.
- MCP hafızaya ve workforce sistemine erişim katmanı olacak.
- Model ve harness mapping'leri UI/config üzerinden yönetilebilir olacak.
- Birden fazla ilişkili proje workspace altında yönetilecek.
- Project Graph ve Impact Engine önemli first-class bileşenler olacak.
- Her projenin kendi persistent Project Kılıç'ı olacak.
- Project Kılıçların üzerinde Workspace Kılıç olacak.
- Micro-agent'lar disposable olacak.
- Cross-project koordinasyon Workspace Kılıç üzerinden yapılacak.
- Runtime/model failover state kaybetmeden çalışacak.
- Routing deterministic Kernel/Control Plane tarafından yapılacak.

---

# 89. Henüz Tasarlanması Gereken Konular

Bu dokümandaki vizyonun ardından detaylandırılması gereken konular:

1. Exact PostgreSQL schema
2. Memory object taxonomy
3. Vector embedding strategy
4. Supabase kullanılıp kullanılmayacağı
5. Auth ve multi-device architecture
6. Runtime Adapter interface'inin kesin contract'ı
7. Claude Code adapter implementation
8. Codex adapter implementation
9. Cursor adapter implementation
10. Quota/rate-limit detection yöntemleri
11. MCP server API schema'ları
12. Workforce spawn contract'ı
13. Project Graph auto-discovery
14. Impact analysis algorithm
15. Operation/task state machine
16. Checkpoint schema
17. Event schema
18. Artifact storage
19. Permission/approval sistemi
20. CLI protocol
21. Web UI backend
22. Realtime streaming modeli
23. Repo isolation / worktree strategy
24. Parallel agent conflict resolution
25. Git branch strategy
26. Cost/usage metering
27. Memory garbage collection policy
28. Decision supersession model
29. Project Kılıç lifecycle
30. Workspace Kılıç lifecycle
31. Remote/local execution modeli
32. Multi-machine synchronization
33. Crash recovery
34. Secret management
35. Production deployment boundaries

---

# 90. Tek Cümlede Kılıç

> **Kılıç; session, model ve harness'lardan bağımsız yaşayan; PostgreSQL tabanlı kalıcı hafızaya sahip; birden fazla ilişkili projeyi Project Kılıçlar üzerinden yöneten; işleri disposable micro-agent'lara dağıtan; doğru harness ve modeli policy'lere göre seçen; runtime limitlerinde state kaybetmeden failover yapan kişisel AI engineering orchestrator ve control plane'dir.**

