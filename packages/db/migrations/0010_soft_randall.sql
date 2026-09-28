ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_status_ck";--> statement-breakpoint
ALTER TABLE "execution_jobs" DROP CONSTRAINT "execution_jobs_status_ck";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_ck" CHECK ("agent_runs"."status" in ('planned', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_status_ck" CHECK ("execution_jobs"."status" in ('planned', 'claimed', 'bootstrapping', 'running', 'awaiting_approval', 'completed', 'failed', 'interrupted', 'cancelled'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION kilic_guard_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'runtime_sessions' THEN
    IF NOT ((OLD.status = 'starting' AND NEW.status IN ('active','failed','interrupted','closed')) OR
            (OLD.status = 'active' AND NEW.status IN ('failed','interrupted','closed','rate_limited','quota_exhausted','auth_required')) OR
            (OLD.status IN ('failed','interrupted','rate_limited','quota_exhausted','auth_required') AND NEW.status = 'starting')) THEN
      RAISE EXCEPTION 'invalid runtime session transition % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'active' AND (NEW.adapter_session_id IS NULL OR NEW.execution_epoch IS NULL) THEN
      RAISE EXCEPTION 'active runtime session requires a ready adapter handle and epoch';
    END IF;
  ELSIF TG_TABLE_NAME = 'agent_runs' THEN
    IF NOT ((OLD.status = 'planned' AND NEW.status IN ('running','failed','cancelled')) OR
            (OLD.status = 'running' AND NEW.status IN ('awaiting_approval','completed','failed','cancelled')) OR
            (OLD.status = 'awaiting_approval' AND NEW.status IN ('running','failed','cancelled')) OR
            (OLD.status = 'failed' AND NEW.status = 'planned')) THEN
      RAISE EXCEPTION 'invalid agent run transition % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'running' AND NOT EXISTS (
      SELECT 1 FROM execution_jobs WHERE agent_run_id = NEW.id AND status = 'running'
    ) THEN
      RAISE EXCEPTION 'running agent run requires a running execution job';
    END IF;
  ELSIF TG_TABLE_NAME = 'execution_jobs' THEN
    IF NOT ((OLD.status = 'planned' AND NEW.status IN ('claimed','cancelled')) OR
            (OLD.status = 'claimed' AND NEW.status IN ('bootstrapping','failed','interrupted','cancelled')) OR
            (OLD.status = 'bootstrapping' AND NEW.status IN ('running','failed','interrupted','cancelled')) OR
            (OLD.status = 'running' AND NEW.status IN ('awaiting_approval','completed','failed','interrupted','cancelled')) OR
            (OLD.status = 'awaiting_approval' AND NEW.status IN ('running','failed','interrupted','cancelled')) OR
            (OLD.status IN ('failed','interrupted') AND NEW.status = 'planned')) THEN
      RAISE EXCEPTION 'invalid execution job transition % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status IN ('running','awaiting_approval') AND NEW.started_at IS NULL THEN
      RAISE EXCEPTION 'active execution job requires a start time';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
