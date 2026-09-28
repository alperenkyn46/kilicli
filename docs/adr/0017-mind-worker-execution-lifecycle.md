# ADR-0017: Mind ve worker aynı execution lifecycle'ını kullanır

## Durum

Kabul edildi.

## Bağlam

`Kernel.openMindSession()` runtime process açıp kapatıyordu. Control API'deki gateway ise `open` ve `close` için hata fırlatıyordu. Worker tarafı planı yazıp daemon'un materyalize etmesine bırakıyordu. Aynı sistemde iki semantik vardı.

## Karar

Control plane niyeti ve state'i yazar. Execution plane local process'i açar.

Mind için akış:

1. `Kernel.planMindSession` route seçer, reuse veya reconstruct kararı verir, session'ı `starting` olarak kaydeder ya da mevcut canlı session için `resume` planı döner.
2. Execution plane `openMind` veya `resumeMind` çağırır.
3. Adapter handle gerçekten yaşıyorsa session `active` olur ve `executionEpoch` o daemon boot'una yazılır.
4. Handle yoksa veya epoch uyuşmuyorsa session `interrupted` olur. Control plane yeni bir `open` planı üretir.

Worker aynı sınırdadır: `dispatchWorker` plan ve `starting` session yazar. `ExecutionPlane.materialize` worktree ve process'i açar.

Kernel `RuntimeStatusProbe` ile yalnızca harness durumunu sorar. Process açmaz.

Veritabanında `active` görünmek, adapter session'ın yaşadığı anlamına gelmez. Daemon açılışında `rotateBoot` eski epoch'lu `active` ve `starting` session'ları `interrupted` yapar.

## Sonuç

Control API'nin çağırdığı Kernel metodu process açmaz. Daemon `ExecutionControl` portunu kullanır; routing veya operation kararı vermez.
