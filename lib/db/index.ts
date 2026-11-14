import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { requireDatabaseUrl } from "./env"
import * as schema from "./schema"

export type Db = PostgresJsDatabase<typeof schema>

let db: Db | undefined

// Connects on first use, so builds and tests that never touch the database
// do not need DATABASE_URL.
export function getDb(): Db {
  db ??= drizzle(postgres(requireDatabaseUrl()), { schema })
  return db
}

export { schema }
