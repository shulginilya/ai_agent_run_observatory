import { requireDatabaseUrl } from "./env"

// Node.js only: exit at once with a clear message rather than serving pages
// that fail on the first database call.
export function exitUnlessConfigured() {
  try {
    requireDatabaseUrl()
  } catch (error) {
    console.error(
      `Agent Run Observatory cannot start: ${(error as Error).message}`,
    )
    process.exit(1)
  }
}
