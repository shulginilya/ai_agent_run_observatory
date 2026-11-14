// @vitest-environment node
// Runs `pnpm db:migrate` against a real Postgres. Opt in with
// TEST_DATABASE_URL pointing at a throwaway database: its schema is dropped.
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const url = process.env.TEST_DATABASE_URL
const script = join(__dirname, "..", "scripts", "migrate.ts")
// An empty working directory, so a developer's own .env.local is not read.
const cwd = mkdtempSync(join(tmpdir(), "db-migrate-"))

function migrate(env: Record<string, string | undefined>) {
  const { DATABASE_URL: _drop, ...rest } = process.env // eslint-disable-line @typescript-eslint/no-unused-vars
  return spawnSync("node", ["--no-warnings", script], {
    cwd,
    env: { ...rest, ...env },
    encoding: "utf8",
    timeout: 30_000,
  })
}

describe("pnpm db:migrate without DATABASE_URL", () => {
  it("exits non-zero and names the variable before connecting", () => {
    const run = migrate({})
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain("DATABASE_URL")
  })
})

describe.skipIf(!url)("pnpm db:migrate against Postgres", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} })
  // Columns, indexes and applied migrations: enough to see any schema change.
  const schema = async () => [
    ...(await sql`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns where table_schema = 'public'
      order by table_name, column_name`),
    ...(await sql`
      select indexdef from pg_indexes where schemaname = 'public'
      order by indexname`),
    ...(await sql`select count(*)::int as migrations from drizzle.__drizzle_migrations`),
  ]

  beforeAll(async () => {
    await sql.unsafe(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    )
  })
  afterAll(() => sql.end())

  it("creates the sessions and entries tables", async () => {
    const run = migrate({ DATABASE_URL: url })
    expect(run.status, run.stderr).toBe(0)
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`
    expect(tables.map((t) => t.table_name)).toEqual(["entries", "sessions"])
  })

  it("changes nothing and exits 0 when run again", async () => {
    const before = await schema()
    const run = migrate({ DATABASE_URL: url })
    expect(run.status, run.stderr).toBe(0)
    expect(await schema()).toEqual(before)
  })

  it("stores an entry under its session and deletes it with the session", async () => {
    const [s] = await sql`
      insert into sessions (source_format) values ('sample-jsonl') returning id`
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
})
