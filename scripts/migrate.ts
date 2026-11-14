// Applies the SQL migrations in drizzle/ to DATABASE_URL. Safe to rerun:
// applied migrations are recorded and skipped.
import { existsSync } from "node:fs"
import { join } from "node:path"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

import { requireDatabaseUrl } from "../lib/db/env.ts"

// Same files Next.js reads; variables already set in the shell win, and
// .env.local wins over .env.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file)
}

async function main() {
  let url: string
  try {
    url = requireDatabaseUrl()
  } catch (error) {
    console.error(`db:migrate: ${(error as Error).message}`)
    process.exit(1)
  }
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), {
      migrationsFolder: join(import.meta.dirname, "..", "drizzle"),
    })
    console.log("db:migrate: database is up to date")
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`db:migrate: ${(error as Error).message}`)
  process.exit(1)
})
