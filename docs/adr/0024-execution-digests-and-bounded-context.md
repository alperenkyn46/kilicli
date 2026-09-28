# ADR-0024: Execution digest ve bounded bootstrap

## Durum

Kabul edildi.

## Bağlam

Ham chat transcript kalıcı Kılıç state'i değildir. Checkpoint task state'i taşır, fakat bir execution sırasında gözlemlenen karar ve bulguların episodic özeti için ayrı bir katman gerekir. Bütün memory tablosunu startup'a taşımak scope ve context kirliliği yaratır.

## Karar

- `ExecutionDigest` session/job kaynaklı episodic kayıttır; canonical task state, `Decision`, `Finding` veya `MemoryItem` değildir.
- Ham output aralığı digest/cursor ile tanımlanır. `(execution_job_id, source_digest)` unique olur. Ingestion durable queue'ya yazılır; başarısız iş retry edilir. Crash sırasında `processing` kalan kayıt stale timeout sonrası yeniden claim edilir ve attempt sayısı eski worker'ı fenced eder. Aynı aralık tekrar işlendiğinde aynı digest döner.
- Distillation sınırı `raw events/output → ExecutionDigest → proposed MemoryCandidate → canonical memory/decision/finding` olarak kalır. Bu gate LLM summarizer veya distiller çalıştırmaz. Candidate otomatik canonical yazı değildir.
- Bootstrap doctrine metnini, identity, active operation/task, ilgili checkpoint, en fazla 12 yüksek öncelikli policy ve en fazla 12 seçilmiş memory özetini taşır. Memory body 500 karakterle sınırlanır; ayrıntı scoped MCP retrieval ile alınır. Exact task checkpoint, sonra operation checkpoint, sonra orchestrator genel checkpoint seçilir. Başka operation/task checkpoint'i alınmaz.
- `global` sistem doktrinidir; `user` kişisel hafızadır. ADR-0020 scope ayrımı korunur.

## Sonuç

Brain'in dosya, hook veya lock biçimi taşınmaz. PostgreSQL source digest, unique key, queue ve transaction mekanizmayı sağlar. Runtime output'un kendisi canonical memory'ye otomatik terfi etmez.
