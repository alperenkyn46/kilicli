CREATE TABLE "repository_checkouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repository_id" uuid NOT NULL,
	"execution_node_id" uuid NOT NULL,
	"local_path" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "repository_checkouts_status_ck" CHECK ("repository_checkouts"."status" in ('present', 'missing'))
);
--> statement-breakpoint
ALTER TABLE "memory_items" DROP CONSTRAINT "memory_items_scope_ck";--> statement-breakpoint
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_supersedes_id_decisions_id_fk";
--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_nodes" ADD COLUMN "boot_id" text;--> statement-breakpoint
ALTER TABLE "memory_items" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD COLUMN "execution_epoch" text;--> statement-breakpoint
ALTER TABLE "repository_checkouts" ADD CONSTRAINT "repository_checkouts_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_checkouts" ADD CONSTRAINT "repository_checkouts_execution_node_id_execution_nodes_id_fk" FOREIGN KEY ("execution_node_id") REFERENCES "public"."execution_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_checkouts_repo_node_uq" ON "repository_checkouts" USING btree ("repository_id","execution_node_id");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_id_project_uq" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_id_orchestrator_uq" UNIQUE("id","orchestrator_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_operation_uq" UNIQUE("id","operation_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_scope_uq" UNIQUE("id","operation_id","project_id","workspace_id");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_orchestrator_workspace_fk" FOREIGN KEY ("orchestrator_id","workspace_id") REFERENCES "public"."orchestrators"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_task_workspace_fk" FOREIGN KEY ("task_id","workspace_id") REFERENCES "public"."tasks"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_task_operation_fk" FOREIGN KEY ("task_id","operation_id") REFERENCES "public"."tasks"("id","operation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_session_orchestrator_fk" FOREIGN KEY ("runtime_session_id","orchestrator_id") REFERENCES "public"."runtime_sessions"("id","orchestrator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_supersedes_workspace_fk" FOREIGN KEY ("supersedes_id","workspace_id") REFERENCES "public"."decisions"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_task_scope_fk" FOREIGN KEY ("task_id","operation_id","project_id","workspace_id") REFERENCES "public"."tasks"("id","operation_id","project_id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_run_workspace_fk" FOREIGN KEY ("agent_run_id","workspace_id") REFERENCES "public"."agent_runs"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_source_workspace_fk" FOREIGN KEY ("source_project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_target_workspace_fk" FOREIGN KEY ("target_project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."operations"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" DROP COLUMN "local_path";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_kind_ck" CHECK ("agent_runs"."kind" in ('orchestrator_mind', 'worker'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_ck" CHECK ("agent_runs"."status" in ('planned', 'running', 'completed', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_access_ck" CHECK ("agent_runs"."access" in ('read_only', 'write', 'none'));--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_status_ck" CHECK ("approvals"."status" in ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_trigger_ck" CHECK ("checkpoints"."trigger" in ('major_decision', 'phase_completed', 'before_compaction', 'before_runtime_switch', 'after_failed_attempt', 'before_risky_change', 'before_user_visible_completion'));--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_task_requires_operation_ck" CHECK ("checkpoints"."task_id" is null or "checkpoints"."operation_id" is not null);--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_status_ck" CHECK ("decisions"."status" in ('active', 'archived', 'superseded'));--> statement-breakpoint
ALTER TABLE "execution_nodes" ADD CONSTRAINT "execution_nodes_kind_ck" CHECK ("execution_nodes"."kind" in ('local', 'remote'));--> statement-breakpoint
ALTER TABLE "execution_nodes" ADD CONSTRAINT "execution_nodes_status_ck" CHECK ("execution_nodes"."status" in ('online', 'offline'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_knowledge_ck" CHECK ("findings"."knowledge_class" in ('authoritative', 'inferred', 'historical'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_status_ck" CHECK ("findings"."status" in ('active', 'archived', 'superseded'));--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_scope_type_ck" CHECK ("memory_items"."scope_type" in ('global', 'user', 'workspace', 'project', 'operation', 'task', 'run'));--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_knowledge_ck" CHECK ("memory_items"."knowledge_class" in ('authoritative', 'inferred', 'historical'));--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_status_ck" CHECK ("memory_items"."status" in ('active', 'archived', 'superseded'));--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_scope_ck" CHECK ((
        ("memory_items"."scope_type" = 'global' AND "memory_items"."owner_user_id" IS NULL AND "memory_items"."workspace_id" IS NULL AND "memory_items"."project_id" IS NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'user' AND "memory_items"."owner_user_id" IS NOT NULL AND "memory_items"."workspace_id" IS NULL AND "memory_items"."project_id" IS NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'workspace' AND "memory_items"."owner_user_id" IS NULL AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."project_id" IS NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'project' AND "memory_items"."owner_user_id" IS NULL AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."project_id" IS NOT NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'operation' AND "memory_items"."owner_user_id" IS NULL AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."operation_id" IS NOT NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'task' AND "memory_items"."owner_user_id" IS NULL AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."project_id" IS NOT NULL AND "memory_items"."operation_id" IS NOT NULL AND "memory_items"."task_id" IS NOT NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'run' AND "memory_items"."owner_user_id" IS NULL AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."agent_run_id" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_status_ck" CHECK ("operations"."status" in ('draft', 'active', 'blocked', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_kind_ck" CHECK ("orchestrators"."kind" in ('workspace', 'project'));--> statement-breakpoint
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_status_ck" CHECK ("orchestrators"."status" in ('active', 'suspended', 'archived'));--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_scope_type_ck" CHECK ("policy_rules"."scope_type" in ('global', 'workspace', 'project'));--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_effect_ck" CHECK ("policy_rules"."effect" in ('allow', 'require_approval', 'deny'));--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_knowledge_ck" CHECK ("project_relations"."knowledge_class" in ('authoritative', 'inferred', 'historical'));--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_scope_type_ck" CHECK ("routing_policies"."scope_type" in ('global', 'workspace', 'project', 'operation'));--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_profile_ck" CHECK ("routing_policies"."execution_profile" is null or "routing_policies"."execution_profile" in ('quality', 'balanced', 'cheap', 'emergency'));--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_purpose_ck" CHECK ("runtime_sessions"."purpose" in ('orchestrator_mind', 'worker'));--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_status_ck" CHECK ("runtime_sessions"."status" in ('starting', 'active', 'interrupted', 'closed', 'failed', 'rate_limited', 'quota_exhausted', 'auth_required'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_ck" CHECK ("tasks"."status" in ('pending', 'ready', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_ck" CHECK ("workspace_members"."role" in ('owner', 'member'));--> statement-breakpoint
ALTER TABLE "worktrees" ADD CONSTRAINT "worktrees_status_ck" CHECK ("worktrees"."status" in ('active', 'removed'));