// @vitest-environment node
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { entries, sessions } from "@/lib/db/schema"

const columns = (t: Parameters<typeof getTableConfig>[0]) =>
  Object.fromEntries(
    getTableConfig(t).columns.map((c) => [
      c.name,
      { type: c.getSQLType(), notNull: c.notNull },
    ]),
  )

describe("sessions table", () => {
  it("records the source log format of every session", () => {
    expect(getTableConfig(sessions).name).toBe("sessions")
    expect(columns(sessions)).toMatchObject({
      id: { type: "uuid", notNull: true },
      source_format: { type: "text", notNull: true },
      created_at: { type: "timestamp with time zone", notNull: true },
    })
  })
})

describe("entries table", () => {
  it("keeps the raw record next to the indexed columns", () => {
    expect(getTableConfig(entries).name).toBe("entries")
    expect(columns(entries)).toMatchObject({
      session_id: { type: "uuid", notNull: true },
      entry_id: { type: "text", notNull: true },
      parent_id: { type: "text", notNull: false },
      kind: { type: "text", notNull: true },
      timestamp: { type: "timestamp with time zone", notNull: false },
      subagent_run_id: { type: "text", notNull: false },
      raw: { type: "jsonb", notNull: true },
    })
  })

  it("indexes entry id, parent id, kind, timestamp and subagent run id within a session", () => {
    const indexed = getTableConfig(entries).indexes.map((i) =>
      i.config.columns.map((c) => ("name" in c ? c.name : "?")),
    )
    expect(indexed).toEqual(
      expect.arrayContaining([
        ["session_id", "entry_id"],
        ["session_id", "parent_id"],
        ["session_id", "kind"],
        ["session_id", "timestamp"],
        ["session_id", "subagent_run_id"],
      ]),
    )
  })

  it("belongs to a session and is deleted with it", () => {
    const [fk] = getTableConfig(entries).foreignKeys
    const ref = fk.reference()
    expect(getTableConfig(ref.foreignTable).name).toBe("sessions")
    expect(ref.columns.map((c) => c.name)).toEqual(["session_id"])
    expect(fk.onDelete).toBe("cascade")
  })
})
