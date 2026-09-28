CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"runtime_session_id" uuid,
	"orchestrator_id" uuid NOT NULL,
	"task_id" uuid,
	"parent_run_id" uuid,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"operation_id" uuid,
	"correlation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"access" text NOT NULL,
	"status" text NOT NULL,
	"isolation" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_rule_id" uuid,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"operation_id" uuid,
	"task_id" uuid,
	"requested_by_run_id" uuid,
	"correlation_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"task_id" uuid,
	"agent_run_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"media_type" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orchestrator_id" uuid NOT NULL,
	"runtime_session_id" uuid,
	"operation_id" uuid,
	"task_id" uuid,
	"correlation_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"operation_id" uuid,
	"title" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"language" text,
	"status" text NOT NULL,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid,
	"agent_run_id" uuid,
	"runtime_session_id" uuid,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"machine_key" text NOT NULL,
	"display_name" text NOT NULL,
	"hostname" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"agent_run_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"recommendation" text,
	"language" text,
	"knowledge_class" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harnesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"operation_id" uuid,
	"task_id" uuid,
	"agent_run_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"language" text,
	"knowledge_class" text NOT NULL,
	"status" text NOT NULL,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "memory_items_scope_ck" CHECK ((
        ("memory_items"."scope_type" = 'global' AND "memory_items"."workspace_id" IS NULL AND "memory_items"."project_id" IS NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'workspace' AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."project_id" IS NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'project' AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."project_id" IS NOT NULL AND "memory_items"."operation_id" IS NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'operation' AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."operation_id" IS NOT NULL AND "memory_items"."task_id" IS NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" = 'task' AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."project_id" IS NOT NULL AND "memory_items"."operation_id" IS NOT NULL AND "memory_items"."task_id" IS NOT NULL AND "memory_items"."agent_run_id" IS NULL) OR
        ("memory_items"."scope_type" IN ('run', 'agent') AND "memory_items"."workspace_id" IS NOT NULL AND "memory_items"."agent_run_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY NOT NULL,
	"harness_id" uuid NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"language" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orchestrators_scope_ck" CHECK (("orchestrators"."kind" = 'workspace' AND "orchestrators"."project_id" IS NULL) OR ("orchestrators"."kind" = 'project' AND "orchestrators"."project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"action" text NOT NULL,
	"effect" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "policy_rules_scope_ck" CHECK ((
        ("policy_rules"."scope_type" = 'global' AND "policy_rules"."workspace_id" IS NULL AND "policy_rules"."project_id" IS NULL) OR
        ("policy_rules"."scope_type" = 'workspace' AND "policy_rules"."workspace_id" IS NOT NULL AND "policy_rules"."project_id" IS NULL) OR
        ("policy_rules"."scope_type" = 'project' AND "policy_rules"."workspace_id" IS NOT NULL AND "policy_rules"."project_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "project_relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_project_id" uuid NOT NULL,
	"target_project_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"knowledge_class" text NOT NULL,
	"confidence" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_relations_distinct_ck" CHECK ("project_relations"."source_project_id" <> "project_relations"."target_project_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"local_path" text NOT NULL,
	"default_branch" text NOT NULL,
	"remote_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"routing_policy_id" uuid NOT NULL,
	"role" text NOT NULL,
	"harness_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope_type" text NOT NULL,
	"workspace_id" uuid,
	"project_id" uuid,
	"operation_id" uuid,
	"execution_profile" text,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "routing_policies_scope_ck" CHECK ((
        ("routing_policies"."scope_type" = 'global' AND "routing_policies"."workspace_id" IS NULL AND "routing_policies"."project_id" IS NULL AND "routing_policies"."operation_id" IS NULL) OR
        ("routing_policies"."scope_type" = 'workspace' AND "routing_policies"."workspace_id" IS NOT NULL AND "routing_policies"."project_id" IS NULL AND "routing_policies"."operation_id" IS NULL) OR
        ("routing_policies"."scope_type" = 'project' AND "routing_policies"."workspace_id" IS NOT NULL AND "routing_policies"."project_id" IS NOT NULL AND "routing_policies"."operation_id" IS NULL) OR
        ("routing_policies"."scope_type" = 'operation' AND "routing_policies"."workspace_id" IS NOT NULL AND "routing_policies"."operation_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "runtime_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orchestrator_id" uuid NOT NULL,
	"execution_node_id" uuid NOT NULL,
	"harness_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"adapter_session_id" text,
	"close_reason" text,
	"correlation_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id"),
	CONSTRAINT "task_dependencies_no_self_ck" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"orchestrator_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"language" text,
	"acceptance_criteria" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worktrees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repository_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"execution_node_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"base_ref" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_runtime_session_id_runtime_sessions_id_fk" FOREIGN KEY ("runtime_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_run_id_agent_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_policy_rule_id_policy_rules_id_fk" FOREIGN KEY ("policy_rule_id") REFERENCES "public"."policy_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_run_id_agent_runs_id_fk" FOREIGN KEY ("requested_by_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_runtime_session_id_runtime_sessions_id_fk" FOREIGN KEY ("runtime_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_supersedes_id_decisions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_causation_id_events_id_fk" FOREIGN KEY ("causation_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_runtime_session_id_runtime_sessions_id_fk" FOREIGN KEY ("runtime_session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_superseded_by_id_memory_items_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."memory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_harness_id_harnesses_id_fk" FOREIGN KEY ("harness_id") REFERENCES "public"."harnesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrators" ADD CONSTRAINT "orchestrators_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_source_project_id_projects_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_routes" ADD CONSTRAINT "role_routes_routing_policy_id_routing_policies_id_fk" FOREIGN KEY ("routing_policy_id") REFERENCES "public"."routing_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_routes" ADD CONSTRAINT "role_routes_harness_id_harnesses_id_fk" FOREIGN KEY ("harness_id") REFERENCES "public"."harnesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_routes" ADD CONSTRAINT "role_routes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_execution_node_id_execution_nodes_id_fk" FOREIGN KEY ("execution_node_id") REFERENCES "public"."execution_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_harness_id_harnesses_id_fk" FOREIGN KEY ("harness_id") REFERENCES "public"."harnesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_orchestrator_id_orchestrators_id_fk" FOREIGN KEY ("orchestrator_id") REFERENCES "public"."orchestrators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worktrees" ADD CONSTRAINT "worktrees_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worktrees" ADD CONSTRAINT "worktrees_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worktrees" ADD CONSTRAINT "worktrees_execution_node_id_execution_nodes_id_fk" FOREIGN KEY ("execution_node_id") REFERENCES "public"."execution_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_correlation_idx" ON "events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "events_aggregate_idx" ON "events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "events_workspace_time_idx" ON "events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_nodes_machine_key_uq" ON "execution_nodes" USING btree ("machine_key");--> statement-breakpoint
CREATE UNIQUE INDEX "harnesses_key_uq" ON "harnesses" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "models_harness_key_uq" ON "models" USING btree ("harness_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestrators_workspace_singleton" ON "orchestrators" USING btree ("workspace_id") WHERE "orchestrators"."kind" = 'workspace';--> statement-breakpoint
CREATE UNIQUE INDEX "orchestrators_project_singleton" ON "orchestrators" USING btree ("project_id") WHERE "orchestrators"."kind" = 'project';--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_slug_uq" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "role_routes_priority_uq" ON "role_routes" USING btree ("routing_policy_id","role","priority");