import { defineConfig } from "drizzle-kit"

// Used by `pnpm db:generate` to write SQL migrations from lib/db/schema.ts.
// Migrations are applied by `pnpm db:migrate` (scripts/migrate.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
})
