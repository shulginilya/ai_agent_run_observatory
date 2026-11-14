// Runs once when the server starts. The check lives in a Node.js-only module,
// loaded only on the Node.js runtime, so the Edge bundle never sees
// process.exit.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { exitUnlessConfigured } = await import("@/lib/db/startup")
  exitUnlessConfigured()
}
