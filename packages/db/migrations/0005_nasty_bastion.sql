CREATE TABLE "digest_ingestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"execution_job_id" uuid NOT NULL,
	"source_digest" text NOT NULL,
	"source_cursor" text,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"digest_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "digest_ingestions_source_uq" UNIQUE("execution_job_id","source_digest"),
	CONSTRAINT "digest_ingestions_status_ck" CHECK ("digest_ingestions"."status" in ('pending', 'processing', 'completed', 'retry'))
);
--> statement-breakpoint
ALTER TABLE "digest_ingestions" ADD CONSTRAINT "digest_ingestions_execution_job_id_execution_jobs_id_fk" FOREIGN KEY ("execution_job_id") REFERENCES "public"."execution_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_ingestions" ADD CONSTRAINT "digest_ingestions_digest_id_execution_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."execution_digests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "digest_ingestions_due_idx" ON "digest_ingestions" USING btree ("status","next_attempt_at");