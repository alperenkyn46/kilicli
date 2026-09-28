# ADR-0023: Execution jobs, scoped effects, and durable handoff

## Durum

Kabul edildi.

## Bağlam

ADR-0017 process handle'ın açılmasını session readiness için yeterli görüyordu. Bu, bir Mind turn'ünün veya worker task'ının gerçekten çalıştığını göstermiyordu. HTTP retry ve iki daemon aynı work'ü başlatabiliyordu. Dispatch approval da runtime içindeki irreversible effect için yeterli scope taşımıyordu.

## Karar

- `RuntimeSession` disposable process handle'dır. `ExecutionJob` bir Mind turn veya worker run için kalıcı execution niyetidir. Mind session birden fazla turn taşıyabilir; her turn ayrı idempotency key ve metin digest'i ile planlanır.
- Job `planned → claimed → bootstrapping → running → completed|failed|interrupted|cancelled` izler. `running` yalnız adapter `send` ilk event'i verdiğinde yazılır. Job claim, node ve boot epoch ile PostgreSQL compare-and-set'tir; idempotency key workspace içinde tektir. Lease yenileme node boot epoch'u ile fenced olur. Claim ve lifecycle event aynı transaction'da yazılır.
- Execution plane sessiz bir stream sırasında da lease'i periyodik yeniler. Lease kaybında runtime'a interrupt gönderir ve turn'ü başarılı saymaz.
- Session `active` yalnız doctrine metni, scoped bootstrap ve tool surface adapter'a iletilip adapter readiness doğrulandıktan sonra yazılır. `active`, o anda bir turn çalıştığı anlamına gelmez.
- Dispatch approval, effect authorization değildir. Runtime'ın her effect isteği exact job, principal, action, resource ve request key için broker'a gider. Broker policy ile `allow`, `deny` veya `require_approval` döndürür. Grant bir kullanımlık ve süre sınırlıdır. Adapter effect'i broker cevabını almadan uygulayamaz.
- Control API local user/service principal'ı token'dan üretir. Daemon service token doğrular. Caller body'deki user identity yetki kaynağı değildir. Remote authentication sonraki ADR'ye bırakılır.
- Runtime handoff için önce checkpoint ve repository/worktree snapshot kalıcılaşır. Successor planlanıp bootstrap/readiness doğrulanana kadar predecessor kapatılmaz. Successor start başarısızsa handoff `failed` kalır ve predecessor session korunur. Routing kararı Kernel'dadır. Quota/rate-limit normalize failure bu yolu tetikler.
- Handoff'un requested→checkpointed bağlantısı ve successor session→successor_planned bağlantısı ayrı ayrı transaction boundary'lerinde atomiktir. Daemon başlangıcında checkpointed veya successor_planned handoff'lar durable kayıtlardan yeniden kurulur; önceki process kaybolmuşsa successor yeniden açılır. Kurtarma başarısızlığı açık `failed` state ve event bırakır.
- Worktree kaydı, eksik dizin tespit edildiğinde yalnız Git'in stale worktree metadata'sı temizlenip yokluğu doğrulandıktan sonra `removed` olur. Worker branch'i otomatik silinmez; orphan branch ayrı reconciliation sonucu olarak raporlanır.
- ADR-0017'deki “handle yaşıyorsa active” koşulu readiness ve bootstrap teslimiyle sıkılaştırıldı. ADR-0018 inheritance her scope içinde profile route, ardından neutral route sırasıyla uygulanır.

## Sonuç

Gerçek adapter, `start`, `ready`, `send`, `resolveEffect`, `interrupt`, `close` contract'ını karşılamak zorundadır. Kılıç, bootstrap'siz veya tool broker'ı atlayan adapter'ı güvenilir execution kaynağı sayamaz. Lease ve epoch old daemon işlemlerini fencing için kullanılır; remote node ve provider-specific liveness sonraki gate'te ayrıca doğrulanır.
