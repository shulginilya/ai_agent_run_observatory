// @vitest-environment node
import { describe, expect, it } from "vitest"

import { parseSession, UnsupportedFormatError } from "@/lib/parser"
import { adapters } from "@/lib/parser/adapters"

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

describe("parseSession: identity", () => {
  it("gives every entry a unique id, even for records without an id or repeated ids", () => {
    const text = [
      rec(),
      JSON.stringify({ type: "summary", leafUuid: "u1" }),
      JSON.stringify({ type: "summary", leafUuid: "u1" }),
      rec({ uuid: "u1" }),
    ].join("\n")
    const ids = parseSession(text).entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(4)
  })

  it("keeps ids apart between the main log and a subagent log that reuses record ids", () => {
    const spawn = rec({
      uuid: "u2",
      parentUuid: "u1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }],
      },
      toolUseResult: { agentId: "ag" },
    })
    const s = parseSession([rec(), spawn].join("\n"), {
      subagents: { ag: rec() },
    })
    const ids = s.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("links children to the first copy of a repeated record and warns", () => {
    const text = [rec(), rec({ uuid: "u2", parentUuid: "u1" }), rec()].join(
      "\n",
    )
    const s = parseSession(text)
    expect(s.entries[1].parentId).toBe(s.entries[0].id)
    expect(s.warnings).toEqual([
      expect.objectContaining({ code: "duplicate-record", line: 3 }),
    ])
  })

  it("keeps a record without an id as a root, not linked to other id-less records", () => {
    const s = parseSession(
      [
        rec(),
        JSON.stringify({ type: "summary" }),
        JSON.stringify({ type: "summary" }),
      ].join("\n"),
    )
    expect(s.entries[1]).toMatchObject({ recordId: null, parentId: null })
    expect(s.entries[2]).toMatchObject({ recordId: null, parentId: null })
  })
})

describe("parseSession: robustness", () => {
  it("ignores a UTF-8 byte order mark", () => {
    const s = parseSession("\uFEFF" + rec())
    expect(s.entries).toHaveLength(1)
    expect(s.warnings).toEqual([])
  })

  it("detects the format past leading records that carry no ids", () => {
    const s = parseSession(
      [JSON.stringify({ type: "summary", leafUuid: "u1" }), rec()].join("\n"),
    )
    expect(s.format).toBe("session-jsonl")
    expect(s.entries.map((e) => e.kind)).toEqual(["other", "user"])
  })

  it("marks only the single result of a record as the subagent spawn", () => {
    const answer = (content: unknown[]) =>
      rec({
        uuid: "u2",
        parentUuid: "u1",
        message: { role: "user", content },
        toolUseResult: { agentId: "ag" },
      })
    const result = (id: string) => ({
      type: "tool_result",
      tool_use_id: id,
      content: "x",
    })
    const single = parseSession([rec(), answer([result("t1")])].join("\n"))
    expect(single.runs).toEqual([{ id: "ag", spawnedBy: single.entries[1].id }])
    const many = parseSession(
      [rec(), answer([result("t2"), result("t1")])].join("\n"),
    )
    expect(
      many.entries
        .filter((e) => e.kind === "tool_result")
        .map((e) => "subagentRunId" in e && e.subagentRunId),
    ).toEqual([null, null])
  })

  it("maps empty and redacted reasoning blocks to reasoning, not an empty reply", () => {
    const s = parseSession(
      rec({
        type: "assistant",
        message: {
          id: "m1",
          content: [
            { type: "thinking", thinking: "" },
            { type: "redacted_thinking", data: "opaque" },
          ],
        },
      }),
    )
    expect(s.entries.map((e) => e.kind)).toEqual(["reasoning", "reasoning"])
  })
})

describe("lib/parser structure", () => {
  const files = async () => {
    const { readdirSync, readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const root = join(__dirname, "..", "lib", "parser")
    return readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ path: f, text: readFileSync(join(root, f), "utf8") }))
  }

  it("does no I/O: every import is relative and stays inside lib/parser", async () => {
    const all = await files()
    expect(all.length).toBeGreaterThan(3)
    for (const { path, text } of all) {
      const specifiers = [
        ...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
      ].map((m) => m[1])
      for (const spec of specifiers) {
        expect(spec, `${path} imports ${spec}`).toMatch(/^\.\.?\//)
        const depth = path.split("/").length - 1
        const ups = spec.match(/\.\.\//g)?.length ?? 0
        expect(ups, `${path} imports ${spec}`).toBeLessThanOrEqual(depth)
      }
      expect(text, path).not.toMatch(/\brequire\(|\bfetch\(|\bprocess\./)
    }
  })

  it("lists formats only in the adapter registry", async () => {
    for (const { path, text } of await files()) {
      if (path.startsWith("adapters/")) continue
      expect(text, path).not.toMatch(/from "\.\/adapters\/(?!index)/)
    }
    try {
      parseSession('{"foo":1}')
    } catch (error) {
      expect((error as UnsupportedFormatError).supportedFormats).toEqual(
        adapters.map((a) => a.name),
      )
    }
    expect.assertions(
      1 + (await files()).filter((f) => !f.path.startsWith("adapters/")).length,
    )
  })
})
