// Fails when any commit in a range carries a co-author trailer.
// Usage: node scripts/check-attribution.ts <base-sha> <head-sha>
// An all-zero or missing base checks only the head commit.
import { execFileSync } from "node:child_process"

export type Commit = { sha: string; subject: string; body: string }

const TRAILER = /^co-authored-by:/im
const FIELD = "\x00"
const RECORD = "\x1e"
export const GIT_LOG_FORMAT = "%H%x00%s%x00%B%x1e"

export function parseGitLog(output: string): Commit[] {
  return output
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha, subject, body = ""] = record.split(FIELD)
      return { sha, subject, body }
    })
}

export function findCoAuthorTrailers(commits: Commit[]): Commit[] {
  return commits.filter((c) => TRAILER.test(c.body))
}

function main(argv: string[]): number {
  const [base, head] = argv
  if (!head) {
    console.error("usage: check-attribution.ts <base-sha> <head-sha>")
    return 2
  }
  const range = !base || /^0+$/.test(base) ? ["-1", head] : [`${base}..${head}`]
  const output = execFileSync(
    "git",
    ["log", `--format=${GIT_LOG_FORMAT}`, ...range],
    { encoding: "utf8" },
  )
  const commits = parseGitLog(output)
  const offenders = findCoAuthorTrailers(commits)
  if (offenders.length === 0) {
    console.log(
      `attribution: ${commits.length} commit(s) checked, no co-author trailers`,
    )
    return 0
  }
  for (const c of offenders) {
    console.error(
      `::error::${c.sha.slice(0, 12)} "${c.subject}" has a Co-Authored-By trailer`,
    )
  }
  console.error(
    `attribution: ${offenders.length} commit(s) carry a co-author trailer; rewrite them without it`,
  )
  return 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
