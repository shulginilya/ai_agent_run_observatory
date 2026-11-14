// Read by both the app and `pnpm db:migrate`, so it must not import app code.
export function requireDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and set DATABASE_URL to a Postgres connection string.",
    )
  }
  return url
}
