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

DROP TRIGGER IF EXISTS checkpoints_scope ON checkpoints;
CREATE TRIGGER checkpoints_scope
BEFORE INSERT OR UPDATE ON checkpoints
FOR EACH ROW EXECUTE FUNCTION kilic_checkpoint_scope();

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

DROP TRIGGER IF EXISTS memory_items_run_scope ON memory_items;
CREATE TRIGGER memory_items_run_scope
BEFORE INSERT OR UPDATE ON memory_items
FOR EACH ROW EXECUTE FUNCTION kilic_memory_run_scope();
