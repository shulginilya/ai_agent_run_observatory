// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  findCoAuthorTrailers,
  GIT_LOG_FORMAT,
  parseGitLog,
} from "@/scripts/check-attribution"

const commit = (sha: string, subject: string, body = "") => ({
  sha,
  subject,
  body,
})

describe("findCoAuthorTrailers", () => {
  it("passes commits that carry no co-author trailer", () => {
    expect(findCoAuthorTrailers([commit("a1", "Add CI", "Closes #2")])).toEqual(
      [],
    )
  })

  it("names a commit that carries a Co-Authored-By trailer", () => {
    const bad = commit(
      "b2",
      "Fix parser",
      "Fix parser\n\nCo-Authored-By: Someone <someone@example.com>",
    )
    expect(findCoAuthorTrailers([commit("a1", "Ok"), bad])).toEqual([bad])
  })

  it("catches the trailer whatever its letter case", () => {
    const bad = commit(
      "c3",
      "x",
      "x\n\nco-authored-by: Someone <s@example.com>",
    )
    expect(findCoAuthorTrailers([bad])).toEqual([bad])
  })

  it("ignores the phrase when it is not at the start of a line", () => {
    const ok = commit("d4", "x", "x\n\nWe never add a Co-Authored-By: line.")
    expect(findCoAuthorTrailers([ok])).toEqual([])
  })
})

describe("parseGitLog", () => {
  it("splits git log output into commits with sha, subject and body", () => {
    const out =
      "a1\x00Add CI\x00Add CI\n\nCloses #2\n\x1e\n" +
      "b2\x00Empty body\x00\x1e\n"
    expect(parseGitLog(out)).toEqual([
      commit("a1", "Add CI", "Add CI\n\nCloses #2\n"),
      commit("b2", "Empty body", ""),
    ])
  })

  it("asks git for the separators by escape, since argv cannot hold NUL", () => {
    expect(GIT_LOG_FORMAT).not.toContain("\x00")
    expect(GIT_LOG_FORMAT).toBe("%H%x00%s%x00%B%x1e")
  })

  it("returns no commits for an empty range", () => {
    expect(parseGitLog("")).toEqual([])
  })
})
