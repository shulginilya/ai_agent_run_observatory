// @vitest-environment node
// Runs `pnpm db:migrate` against a real Postgres. Opt in with
// TEST_DATABASE_URL naming a throwaway database ending in _test: its schema is
// dropped. CI runs it against a Postgres service.
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { assertThrowawayDatabase } from "./support/throwaway-db"

const url = process.env.TEST_DATABASE_URL
const script = join(__dirname, "..", "scripts", "migrate.ts")
// An empty working directory, so a developer's own .env.local is not read.
const cwd = mkdtempSync(join(tmpdir(), "db-migrate-"))
afterAll(() => rmSync(cwd, { recursive: true, force: true }))

function migrate(env: Record<string, string | undefined>) {
  const { DATABASE_URL: _drop, ...rest } = process.env // eslint-disable-line @typescript-eslint/no-unused-vars
  return spawnSync("node", ["--no-warnings", script], {
    cwd,
    env: { ...rest, ...env },
    encoding: "utf8",
    timeout: 45_000,
  })
}

describe("pnpm db:migrate without DATABASE_URL", () => {
  it("exits non-zero and names the variable before connecting", () => {
    const run = migrate({})
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain("DATABASE_URL")
  })
})

describe.skipIf(!url)(
  "pnpm db:migrate against Postgres",
  { timeout: 60_000 },
  () => {
    const sql = postgres(url ?? "", { max: 1, onnotice: () => {} })
    const columns = () => sql`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns where table_schema = 'public'
    order by table_name, column_name`
    const indexes = () => sql`
    select indexname, indexdef from pg_indexes where schemaname = 'public'
    order by indexname`
    const migrations = () =>
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`

    beforeAll(async () => {
      assertThrowawayDatabase(url ?? "")
      await sql.unsafe(
        "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
      )
    })
    afterAll(() => sql.end())

    it("creates sessions and entries with the ticket's columns", async () => {
      const run = migrate({ DATABASE_URL: url })
      expect(run.status, run.stderr).toBe(0)
      const rows = (await columns()).map(
        (c) =>
          `${c.table_name}.${c.column_name} ${c.data_type} ${c.is_nullable === "YES" ? "null" : "not null"}`,
      )
      expect(rows).toEqual([
        "entries.entry_id text not null",
        "entries.id bigint not null",
        "entries.kind text not null",
        "entries.parent_id text null",
        "entries.raw jsonb not null",
        "entries.session_id uuid not null",
        "entries.subagent_run_id text null",
        "entries.timestamp timestamp with time zone null",
        "sessions.created_at timestamp with time zone not null",
        "sessions.id uuid not null",
        "sessions.source_format text not null",
      ])
    })

    it("indexes entry id, parent id, kind, timestamp and subagent run id within a session", async () => {
      const defs = Object.fromEntries(
        (await indexes()).map((i) => [i.indexname, i.indexdef as string]),
      )
      const on = (name: string) => defs[name]?.replace(/^.*USING btree /, "")
      expect(on("entries_session_entry_idx")).toBe("(session_id, entry_id)")
      expect(on("entries_session_parent_idx")).toBe("(session_id, parent_id)")
      expect(on("entries_session_kind_idx")).toBe("(session_id, kind)")
      expect(on("entries_session_timestamp_idx")).toBe(
        '(session_id, "timestamp")',
      )
      expect(on("entries_session_subagent_idx")).toBe(
        "(session_id, subagent_run_id)",
      )
    })

    it("changes nothing and exits 0 when run again", async () => {
      const before = [await columns(), await indexes(), await migrations()]
      const run = migrate({ DATABASE_URL: url })
      expect(run.status, run.stderr).toBe(0)
      expect([await columns(), await indexes(), await migrations()]).toEqual(
        before,
      )
    })

    it("stores an entry under its session and deletes it with the session", async () => {
      const [s] = await sql`
      insert into sessions (source_format) values ('session-jsonl') returning id`
      await sql`
      insert into entries (session_id, entry_id, kind, raw)
      values (${s.id}, 'e1', 'user', ${sql.json({ type: "user" })})`
      await expect(
        sql`insert into entries (session_id, entry_id, kind, raw)
          values (gen_random_uuid(), 'e2', 'user', '{}')`,
      ).rejects.toThrow(/foreign key/)
      await sql`delete from sessions where id = ${s.id}`
      const [{ count }] = await sql`select count(*)::int as count from entries`
      expect(count).toBe(0)
    })
  },
)
