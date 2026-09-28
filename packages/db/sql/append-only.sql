CREATE OR REPLACE FUNCTION kilic_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS events_append_only ON events;
CREATE TRIGGER events_append_only
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION kilic_reject_mutation();

DROP TRIGGER IF EXISTS checkpoints_append_only ON checkpoints;
CREATE TRIGGER checkpoints_append_only
BEFORE UPDATE OR DELETE ON checkpoints
FOR EACH ROW EXECUTE FUNCTION kilic_reject_mutation();
