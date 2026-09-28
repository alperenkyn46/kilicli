CREATE TABLE "effect_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_key" text NOT NULL,
	"execution_job_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"request_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "effect_grants_request_uq" UNIQUE("execution_job_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "execution_digests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"execution_job_id" uuid NOT NULL,
	"runtime_session_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"operation_id" uuid,
	"task_id" uuid,
	"source_digest" text NOT NULL,
	"source_cursor" text,
	"summary" text NOT NULL,
	"observed_decisions" jsonb NOT NULL,
	"observed_findings" jsonb NOT NULL,
	"touched_artifacts" jsonb NOT NULL,
	"verification_result" text,
	"open_questions" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "execution_digests_source_uq" UNIQUE("execution_job_id","source_digest")
);
--> statement-breakpoint
CREATE TABLE "execution_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"runtime_session_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"orchestrator_id" uuid NOT NULL,
	"execution_node_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"operation_id" uuid,
	"task_id" uuid,
	"repository_id" uuid,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid,
	"handoff_checkpoint_id" uuid,
	"status" text NOT NULL,
	"claim_epoch" text,
	"lease_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"outcome" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "execution_jobs_idempotency_uq" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "execution_jobs_agent_run_uq" UNIQUE("agent_run_id"),
	CONSTRAINT "execution_jobs_status_ck" CHECK ("execution_jobs"."status" in ('planned', 'claimed', 'bootstrapping', 'running', 'completed', 'failed', 'interrupted', 'cancelled')),
	CONSTRAINT "execution_jobs_claim_ck" CHECK (("execution_jobs"."status" = 'planned' AND "execution_jobs"."claim_epoch" IS NULL) OR ("execution_jobs"."status" <> 'planned' AND "execution_jobs"."claim_epoch" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "effect_grants" ADD CONSTRAINT "effect_grants_execution_job_id_execution_jobs_id_fk" FOREIGN KEY ("execution_job_id") REFERENCES "public"."execution_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effect_grants" ADD CONSTRAINT "effect_grants_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_execution_job_id_execution_jobs_id_fk" FOREIGN KEY ("execution_job_id") REFERENCES "public"."execution_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_runtime_session_id_runtime_sessions_id_fk" FOREIGN KEY ("runtime_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_digests" ADD CONSTRAINT "execution_digests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_runtime_session_id_runtime_sessions_id_fk" FOREIGN KEY ("runtime_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_execution_node_id_execution_nodes_id_fk" FOREIGN KEY ("execution_node_id") REFERENCES "public"."execution_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_causation_id_events_id_fk" FOREIGN KEY ("causation_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_handoff_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("handoff_checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_orchestrator_scope_fk" FOREIGN KEY ("orchestrator_id","workspace_id") REFERENCES "public"."orchestrators"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_session_scope_fk" FOREIGN KEY ("runtime_session_id","orchestrator_id","execution_node_id") REFERENCES "public"."runtime_sessions"("id","orchestrator_id","execution_node_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_project_scope_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_operation_scope_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_task_scope_fk" FOREIGN KEY ("task_id","orchestrator_id","operation_id","project_id","workspace_id") REFERENCES "public"."tasks"("id","orchestrator_id","operation_id","project_id","workspace_id") ON DELETE no action ON UPDATE no action;