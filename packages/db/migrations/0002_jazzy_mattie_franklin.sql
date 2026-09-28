ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_id_project_workspace_uq" UNIQUE("id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_id_orchestrator_node_uq" UNIQUE("id","orchestrator_id","execution_node_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_scope_uq" UNIQUE("id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_orchestrator_scope_uq" UNIQUE("id","orchestrator_id","operation_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_orchestrator_workspace_fk" FOREIGN KEY ("orchestrator_id","workspace_id") REFERENCES "public"."orchestrators"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_orchestrator_fk" FOREIGN KEY ("runtime_session_id","orchestrator_id") REFERENCES "public"."runtime_sessions"("id","orchestrator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_scope_fk" FOREIGN KEY ("task_id","orchestrator_id","operation_id","project_id","workspace_id") REFERENCES "public"."tasks"("id","orchestrator_id","operation_id","project_id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_task_project_fk" FOREIGN KEY ("task_id","project_id","workspace_id") REFERENCES "public"."tasks"("id","project_id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_run_workspace_fk" FOREIGN KEY ("agent_run_id","workspace_id") REFERENCES "public"."agent_runs"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_orchestrator_fk" FOREIGN KEY ("orchestrator_id","project_id","workspace_id") REFERENCES "public"."orchestrators"("id","project_id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_worker_scope_ck" CHECK ("agent_runs"."kind" <> 'worker' OR ("agent_runs"."task_id" IS NOT NULL AND "agent_runs"."operation_id" IS NOT NULL AND "agent_runs"."project_id" IS NOT NULL AND "agent_runs"."runtime_session_id" IS NOT NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kilic_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS events_append_only ON events;
--> statement-breakpoint
CREATE TRIGGER events_append_only
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION kilic_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS checkpoints_append_only ON checkpoints;
--> statement-breakpoint
CREATE TRIGGER checkpoints_append_only
BEFORE UPDATE OR DELETE ON checkpoints
FOR EACH ROW EXECUTE FUNCTION kilic_reject_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kilic_checkpoint_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  orch_kind text;
  orch_project uuid;
  task_project uuid;
  task_operation uuid;
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT kind, project_id INTO orch_kind, orch_project
  FROM orchestrators
  WHERE id = NEW.orchestrator_id;

  SELECT project_id, operation_id INTO task_project, task_operation
  FROM tasks
  WHERE id = NEW.task_id;

  IF NEW.operation_id IS NOT NULL AND task_operation IS DISTINCT FROM NEW.operation_id THEN
    RAISE EXCEPTION 'checkpoint task is outside its operation';
  END IF;

  IF orch_kind = 'project' AND task_project IS DISTINCT FROM orch_project THEN
    RAISE EXCEPTION 'project orchestrator checkpoint cannot reference another project';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS checkpoints_scope ON checkpoints;
--> statement-breakpoint
CREATE TRIGGER checkpoints_scope
BEFORE INSERT OR UPDATE ON checkpoints
FOR EACH ROW EXECUTE FUNCTION kilic_checkpoint_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kilic_memory_run_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_project uuid;
  run_task uuid;
BEGIN
  IF NEW.agent_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id, task_id INTO run_project, run_task
  FROM agent_runs
  WHERE id = NEW.agent_run_id;

  IF NEW.project_id IS NOT NULL AND run_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'memory run belongs to another project';
  END IF;

  IF NEW.task_id IS NOT NULL AND run_task IS DISTINCT FROM NEW.task_id THEN
    RAISE EXCEPTION 'memory run belongs to another task';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS memory_items_run_scope ON memory_items;
--> statement-breakpoint
CREATE TRIGGER memory_items_run_scope
BEFORE INSERT OR UPDATE ON memory_items
FOR EACH ROW EXECUTE FUNCTION kilic_memory_run_scope();
