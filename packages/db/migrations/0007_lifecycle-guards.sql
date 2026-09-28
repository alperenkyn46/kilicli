-- Custom SQL migration file, put your code below! --
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
            (OLD.status = 'running' AND NEW.status IN ('completed','failed','cancelled')) OR
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
            (OLD.status = 'running' AND NEW.status IN ('completed','failed','interrupted','cancelled')) OR
            (OLD.status IN ('failed','interrupted') AND NEW.status = 'planned')) THEN
      RAISE EXCEPTION 'invalid execution job transition % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'running' AND NEW.started_at IS NULL THEN
      RAISE EXCEPTION 'running execution job requires a start time';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER runtime_sessions_lifecycle BEFORE UPDATE ON runtime_sessions
FOR EACH ROW EXECUTE FUNCTION kilic_guard_lifecycle();
--> statement-breakpoint
CREATE TRIGGER agent_runs_lifecycle BEFORE UPDATE ON agent_runs
FOR EACH ROW EXECUTE FUNCTION kilic_guard_lifecycle();
--> statement-breakpoint
CREATE TRIGGER execution_jobs_lifecycle BEFORE UPDATE ON execution_jobs
FOR EACH ROW EXECUTE FUNCTION kilic_guard_lifecycle();
