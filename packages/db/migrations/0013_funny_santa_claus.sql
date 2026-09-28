ALTER TABLE "approvals" ADD CONSTRAINT "approvals_id_workspace_uq" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_approval_workspace_fk" FOREIGN KEY ("pending_approval_id","workspace_id") REFERENCES "public"."approvals"("id","workspace_id") ON DELETE no action ON UPDATE no action;
