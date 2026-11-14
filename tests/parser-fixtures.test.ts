// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { parseSession, type Entry } from "@/lib/parser"

const DIR = join(__dirname, "..", "fixtures", "sessions")
const read = (name: string) => readFileSync(join(DIR, name), "utf8")
const subagentsOf = (session: string) => {
  const dir = join(DIR, session, "subagents")
  return Object.fromEntries(
    readdirSync(dir).map((f) => [
      f.replace(/^agent-|\.jsonl$/g, ""),
      readFileSync(join(dir, f), "utf8"),
    ]),
  )
}
const kinds = (entries: Entry[]) => entries.map((e) => e.kind)
const ofKind = <K extends Entry["kind"]>(entries: Entry[], kind: K) =>
  entries.filter((e): e is Extract<Entry, { kind: K }> => e.kind === kind)

describe("session-jsonl adapter on small.jsonl", () => {
  const session = parseSession(read("small.jsonl"))

  it("maps every record into the neutral model", () => {
    expect(session.format).toBe("session-jsonl")
    expect(session.sessionId).toBe("e85ea1c6-18b5-4192-8445-7cd35438a465")
    expect(session.warnings).toEqual([])
    expect(kinds(session.entries)).toEqual([
      "user",
      "reasoning",
      "tool_call",
      "tool_result",
      "assistant",
      "tool_call",
      "tool_result",
      "reasoning",
      "tool_call",
      "tool_result",
      "tool_call",
      "tool_result",
      "assistant",
    ])
  })

  it("links every entry to the one before it", () => {
    const [first, ...rest] = session.entries
    expect(first.parentId).toBeNull()
    rest.forEach((entry, i) =>
      expect(entry.parentId).toBe(session.entries[i].id),
    )
  })

  it("gives each entry a unique id, its record, line, timestamp and raw record", () => {
    const ids = session.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(session.entries[2]).toMatchObject({
      id: "b0e4d565-1d53-4979-8f43-56ab3cee89bc:1",
      recordId: "b0e4d565-1d53-4979-8f43-56ab3cee89bc",
      line: 2,
      timestamp: "2025-03-04T09:15:12.070Z",
      runId: null,
    })
    expect(session.entries[2].raw).toMatchObject({ type: "assistant" })
  })

  it("keeps tool name, input and call id on calls, and output and error flag on results", () => {
    const [call] = ofKind(session.entries, "tool_call")
    const [result] = ofKind(session.entries, "tool_result")
    expect(call).toMatchObject({
      callId: "toolu_ea5cf9da7ee304483fe5f50d",
      name: "Bash",
      input: { command: "npm test -- cart", description: "Run cart tests" },
    })
    expect(result).toMatchObject({
      callId: "toolu_ea5cf9da7ee304483fe5f50d",
      isError: false,
      subagentRunId: null,
    })
    expect(result.output).toContain("expected 90, received 100")
  })

  it("keeps the model message id, model and token usage on assistant entries", () => {
    const [reasoning] = ofKind(session.entries, "reasoning")
    expect(reasoning.message).toEqual({
      id: "msg_cabd56ff9a67aafb6f89d064",
      model: "example-model-1",
      usage: { input: 139, output: 43, cacheCreation: 736, cacheRead: 2454 },
    })
  })
})

describe("session-jsonl adapter on failed-tools.jsonl", () => {
  const session = parseSession(read("failed-tools.jsonl"))
  it("marks errored tool results", () => {
    expect(
      ofKind(session.entries, "tool_result").filter((r) => r.isError),
    ).toHaveLength(3)
  })
  it("keeps the last call even though it has no result", () => {
    expect(session.entries.at(-1)?.kind).toBe("tool_call")
  })
})

describe("session-jsonl adapter on edge-cases.jsonl", () => {
  const session = parseSession(read("edge-cases.jsonl"))

  it("reports the malformed line and parses the rest", () => {
    expect(session.warnings.filter((w) => w.code === "malformed-line")).toEqual(
      [expect.objectContaining({ line: 4 })],
    )
    expect(new Set(session.entries.map((e) => e.line))).toEqual(
      new Set([1, 2, 3, 5, 6, 7, 8, 9]),
    )
  })

  it("keeps the unknown record type as 'other'", () => {
    expect(ofKind(session.entries, "other")).toEqual([
      expect.objectContaining({ recordType: "telemetry-ping", line: 5 }),
    ])
  })

  it("drops an empty text block but keeps the text block after it", () => {
    const line6 = session.entries.filter((e) => e.line === 6)
    expect(kinds(line6)).toEqual(["assistant"])
  })

  it("leaves usage empty when the record has none", () => {
    const withoutUsage = ofKind(session.entries, "assistant").filter(
      (e) => e.message.usage === null,
    )
    expect(withoutUsage.length).toBeGreaterThan(0)
  })
})

describe("session-jsonl adapter on with-subagents.jsonl", () => {
  const subagents = subagentsOf("with-subagents")
  const session = parseSession(read("with-subagents.jsonl"), { subagents })

  it("maps system and attachment records to their own kinds", () => {
    expect(ofKind(session.entries, "system")).toHaveLength(1)
    expect(ofKind(session.entries, "attachment")).toHaveLength(1)
  })

  it("turns a parallel-call record into two calls and its answer into two results", () => {
    const line6 = session.entries.filter(
      (e) => e.line === 6 && e.runId === null,
    )
    const line7 = session.entries.filter(
      (e) => e.line === 7 && e.runId === null,
    )
    expect(kinds(line6)).toEqual(["assistant", "tool_call", "tool_call"])
    expect(kinds(line7)).toEqual(["tool_result", "tool_result"])
    const calls = ofKind(line6, "tool_call").map((c) => c.callId)
    expect(ofKind(line7, "tool_result").map((r) => r.callId)).toEqual(calls)
  })

  it("keeps the shared message id on both halves of a split message", () => {
    const ids = [8, 9].map(
      (line) =>
        session.entries.find(
          (e) => e.line === line && e.runId === null && "message" in e,
        ) as { message: { id: string } } | undefined,
    )
    expect(ids[0]?.message.id).toBeTruthy()
    expect(ids[1]?.message.id).toBe(ids[0]?.message.id)
  })

  it("keeps both sides of a branch with their shared parent", () => {
    const branch = session.entries.filter((e) => e.line === 15 || e.line === 16)
    const firsts = [15, 16].map((l) => branch.find((e) => e.line === l)!)
    expect(firsts[0].parentId).toBe(firsts[1].parentId)
  })

  it("includes subagent entries, attributed to the run the spawning call reported", () => {
    expect(session.warnings).toEqual([])
    expect(session.runs).toHaveLength(2)
    for (const run of session.runs) {
      const spawner = session.entries.find((e) => e.id === run.spawnedBy)
      expect(spawner).toMatchObject({
        kind: "tool_result",
        subagentRunId: run.id,
      })
      const runEntries = session.entries.filter((e) => e.runId === run.id)
      expect(runEntries.length).toBeGreaterThan(0)
      expect(runEntries[0].parentId).toBeNull()
    }
  })

  it("finds the failed tool call inside a subagent run", () => {
    const failed = ofKind(session.entries, "tool_result").filter(
      (r) => r.isError && r.runId !== null,
    )
    expect(failed.length).toBeGreaterThan(0)
  })

  it("warns when a spawned subagent's log is missing", () => {
    const mainOnly = parseSession(read("with-subagents.jsonl"))
    expect(mainOnly.entries.every((e) => e.runId === null)).toBe(true)
    expect(mainOnly.warnings.map((w) => w.code)).toEqual([
      "missing-subagent-log",
      "missing-subagent-log",
    ])
  })

  it("keeps but flags a subagent log that no call spawned", () => {
    const [id, log] = Object.entries(subagents)[0]
    const s = parseSession(read("small.jsonl"), { subagents: { [id]: log } })
    expect(s.entries.some((e) => e.runId === id)).toBe(true)
    expect(s.warnings).toEqual([
      expect.objectContaining({ code: "unspawned-subagent-log", runId: id }),
    ])
  })
})

describe("every fixture", () => {
  it.each(readdirSync(DIR).filter((f) => f.endsWith(".jsonl")))(
    "%s parses without throwing",
    (name) => {
      expect(() => parseSession(read(name))).not.toThrow()
    },
  )
})
