// The migration integration test drops schemas. Refuse to touch anything that
// does not look like a database made for tests.
export function assertThrowawayDatabase(
  url: string,
  appDatabaseUrl: string | undefined = process.env.DATABASE_URL,
) {
  if (appDatabaseUrl && url.trim() === appDatabaseUrl.trim()) {
    throw new Error(
      "TEST_DATABASE_URL is the same as DATABASE_URL; the test would wipe the app's database.",
    )
  }
  const params = new URL(url).searchParams
  for (const key of ["database", "db", "dbname"]) {
    if (params.has(key)) {
      throw new Error(
        `TEST_DATABASE_URL must not override the database with ?${key}=; name it in the path.`,
      )
    }
  }
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""))
  if (!name.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must name a throwaway database ending in _test (got "${name}"); its schema is dropped.`,
    )
  }
}
