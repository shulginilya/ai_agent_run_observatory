import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Which format adapter parsed the log, so a session can be re-parsed later.
  sourceFormat: text("source_format").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const entries = pgTable(
  "entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    // Ids as the log gives them; not unique, since a log may repeat a record.
    entryId: text("entry_id").notNull(),
    parentId: text("parent_id"),
    kind: text("kind").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    subagentRunId: text("subagent_run_id"),
    // The record exactly as read from the log.
    raw: jsonb("raw").notNull(),
  },
  (t) => [
    index("entries_session_entry_idx").on(t.sessionId, t.entryId),
    index("entries_session_parent_idx").on(t.sessionId, t.parentId),
    index("entries_session_kind_idx").on(t.sessionId, t.kind),
    index("entries_session_timestamp_idx").on(t.sessionId, t.timestamp),
    index("entries_session_subagent_idx").on(t.sessionId, t.subagentRunId),
  ],
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Entry = typeof entries.$inferSelect
export type NewEntry = typeof entries.$inferInsert
