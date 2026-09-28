CREATE TABLE "runtime_handoffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"predecessor_session_id" uuid NOT NULL,
	"successor_session_id" uuid,
	"orchestrator_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_id" uuid,
	"task_id" uuid,
	"checkpoint_id" uuid,
	"digest_id" uuid,
	"repository_state" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "runtime_handoffs_status_ck" CHECK ("runtime_handoffs"."status" in ('requested', 'checkpointed', 'successor_planned', 'successor_ready', 'predecessor_retired', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_predecessor_session_id_runtime_sessions_id_fk" FOREIGN KEY ("predecessor_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_successor_session_id_runtime_sessions_id_fk" FOREIGN KEY ("successor_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_digest_id_execution_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."execution_digests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_causation_id_events_id_fk" FOREIGN KEY ("causation_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_predecessor_scope_fk" FOREIGN KEY ("predecessor_session_id","orchestrator_id") REFERENCES "public"."runtime_sessions"("id","orchestrator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_successor_scope_fk" FOREIGN KEY ("successor_session_id","orchestrator_id") REFERENCES "public"."runtime_sessions"("id","orchestrator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_orchestrator_scope_fk" FOREIGN KEY ("orchestrator_id","workspace_id") REFERENCES "public"."orchestrators"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_handoffs" ADD CONSTRAINT "runtime_handoffs_operation_scope_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;