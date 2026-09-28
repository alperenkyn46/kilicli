# ADR-0003: Control Plane ve Execution Plane

## Durum

Kabul edildi.

## Bağlam

`KILIC_ARCHITECTURE.md` §55, workspace state, execution queue ve adapter lifecycle'ın `kilicd` içinde olduğunu yazar. Kilitlenen foundation kararı ise operation, task, routing ve policy'yi Kernel'da, makine-yerel yürütmeyi daemon'da tutar.

Bu gerçek bir gerilimdir. Doküman sessizce değiştirilmedi. Uygulama, kilitlenen kararı izler.

## Karar

Control Plane (`packages/kernel`, `apps/control-api`):

- orchestrator, operation, task ve checkpoint state
- routing kararı
- policy değerlendirmesi
- workforce dispatch planı
- event kaydı

Execution Plane (`apps/daemon`):

- machine identity
- repository ve git worktree lifecycle
- runtime process açma, interrupt ve close
- planlanmış run'ı materyalize etme
- harness durumunu yayınlama

İki process aynı PostgreSQL'i kullanır. Daemon `ExecutionControl` portuyla execution lifecycle yazar. Routing, operation ve task kararı vermez. Kernel sınıfının tamamını kullanmaz.

Control API runtime process açmaz. Harness durumunu daemon'dan okur. Mind ve worker process'i daemon açar. Ayrıntı ADR-0017.

## Sonuç

§55'teki "workspace state kilicd'dedir" cümlesi bu ADR ile çelişir. State Control Plane'dedir. Daemon state'e katılır, ona sahip olmaz.
