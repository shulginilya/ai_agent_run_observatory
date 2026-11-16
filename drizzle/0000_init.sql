CREATE TABLE "entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"entry_id" text NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"timestamp" timestamp with time zone,
	"subagent_run_id" text,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_format" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_session_entry_idx" ON "entries" USING btree ("session_id","entry_id");--> statement-breakpoint
CREATE INDEX "entries_session_parent_idx" ON "entries" USING btree ("session_id","parent_id");--> statement-breakpoint
CREATE INDEX "entries_session_kind_idx" ON "entries" USING btree ("session_id","kind");--> statement-breakpoint
CREATE INDEX "entries_session_timestamp_idx" ON "entries" USING btree ("session_id","timestamp");--> statement-breakpoint
CREATE INDEX "entries_session_subagent_idx" ON "entries" USING btree ("session_id","subagent_run_id");