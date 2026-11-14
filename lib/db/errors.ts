// Drizzle wraps driver failures; the reason (bad password, unreachable host,
// SQL error) is in `cause`. Print the whole chain, one message per line.
export function describeError(error: unknown): string {
  const lines: string[] = []
  let current: unknown = error
  while (current !== undefined && current !== null && lines.length < 10) {
    if (current instanceof Error) {
      lines.push(current.message)
      current = current.cause
    } else {
      lines.push(String(current))
      break
    }
  }
  return lines.join("\n")
}
