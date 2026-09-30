ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_repository_scope_fk" FOREIGN KEY ("repository_id","project_id") REFERENCES "public"."repositories"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_repository_project_ck" CHECK ("execution_jobs"."repository_id" IS NULL OR "execution_jobs"."project_id" IS NOT NULL);
--> statement-breakpoint
CREATE FUNCTION kilic_guard_execution_repository() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.repository_id IS DISTINCT FROM OLD.repository_id THEN
    IF OLD.repository_id IS NOT NULL OR OLD.status <> 'planned' OR NEW.status <> 'planned' THEN
      RAISE EXCEPTION 'Execution repository binding is immutable after planning';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER execution_job_repository_guard BEFORE UPDATE ON execution_jobs
FOR EACH ROW EXECUTE FUNCTION kilic_guard_execution_repository();
