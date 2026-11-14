// @vitest-environment node
import { describe, expect, it } from "vitest"

import { parseSession, UnsupportedFormatError } from "@/lib/parser"

const rec = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "user",
    uuid: "u1",
    parentUuid: null,
    timestamp: "2025-01-01T00:00:00.000Z",
    sessionId: "s1",
    message: { role: "user", content: "hello" },
    ...over,
  })

describe("parseSession: input handling", () => {
  it("returns an empty session with a 'no entries' warning for an empty file", () => {
    const session = parseSession("")
    expect(session.entries).toEqual([])
    expect(session.warnings).toEqual([
      expect.objectContaining({ code: "no-entries" }),
    ])
  })

  it("treats a file of blank lines as empty", () => {
    expect(parseSession("\n  \r\n\n").warnings[0].code).toBe("no-entries")
  })

  it("skips a line that is not JSON, reports its line number and parses the rest", () => {
    const text = [
      rec(),
      "{not json",
      rec({ uuid: "u2", parentUuid: "u1" }),
    ].join("\n")
    const session = parseSession(text)
    expect(session.entries.map((e) => e.recordId)).toEqual(["u1", "u2"])
    expect(session.warnings).toEqual([
      expect.objectContaining({ code: "malformed-line", line: 2 }),
    ])
  })

  it("detects the format from the first parsable record when line 1 is broken", () => {
    const session = parseSession(["oops", rec()].join("\n"))
    expect(session.format).toBe("session-jsonl")
    expect(session.entries).toHaveLength(1)
  })

  it("accepts CRLF line endings and a trailing newline without warnings", () => {
    const session = parseSession(rec() + "\r\n" + rec({ uuid: "u2" }) + "\r\n")
    expect(session.entries).toHaveLength(2)
    expect(session.warnings).toEqual([])
  })

  it("stops with an error listing the supported formats for an unknown format", () => {
    const run = () => parseSession('{"foo":1}\n{"foo":2}')
    expect(run).toThrow(UnsupportedFormatError)
    expect(run).toThrow(/unsupported log format.*session-jsonl/i)
  })

  it("stops with the same error when no line is JSON", () => {
    expect(() => parseSession("id,name\n1,a")).toThrow(UnsupportedFormatError)
  })

  it("keeps a record type it does not recognise as an 'other' entry", () => {
    const session = parseSession(
      [
        rec(),
        rec({ type: "telemetry-ping", uuid: "t1", parentUuid: "u1" }),
      ].join("\n"),
    )
    expect(session.entries[1]).toMatchObject({
      kind: "other",
      recordType: "telemetry-ping",
      recordId: "t1",
    })
  })

  it("is pure: the same input gives deep-equal output", () => {
    const text = [rec(), rec({ uuid: "u2", parentUuid: "u1" })].join("\n")
    expect(parseSession(text)).toEqual(parseSession(text))
  })
})

describe("parseSession: links", () => {
  it("warns when a record's parent is not in the log, and starts it as a root", () => {
    const session = parseSession(rec({ uuid: "u2", parentUuid: "gone" }))
    expect(session.entries[0].parentId).toBeNull()
    expect(session.warnings).toEqual([
      expect.objectContaining({ code: "unknown-parent", line: 1 }),
    ])
  })
})

describe("lib/parser structure", () => {
  it("does no I/O: no module in lib/parser imports node built-ins", async () => {
    const { readdirSync, readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const root = join(__dirname, "..", "lib", "parser")
    const files = readdirSync(root, {
      recursive: true,
      encoding: "utf8",
    }).filter((f) => f.endsWith(".ts"))
    expect(files.length).toBeGreaterThan(3)
    for (const f of files) {
      expect(readFileSync(join(root, f), "utf8"), f).not.toMatch(
        /from "(node:|fs|path|child_process)/,
      )
    }
  })
})
