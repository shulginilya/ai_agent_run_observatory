import { requireDatabaseUrl } from "@/lib/db/env"

// Runs once when the server starts: exit at once with a clear message rather
// than serving pages that fail on the first database call.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    requireDatabaseUrl()
  } catch (error) {
    console.error(
      `Agent Run Observatory cannot start: ${(error as Error).message}`,
    )
    process.exit(1)
  }
}
