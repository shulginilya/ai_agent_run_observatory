// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { parseSession, type Entry, type Session } from "@/lib/parser"
import { buildRunTree, type RunTree, type TreeNode } from "@/lib/run-tree"

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

function walk(tree: RunTree, visit: (n: TreeNode) => void) {
  const go = (n: TreeNode) => {
    visit(n)
    n.children.forEach(go)
  }
  tree.roots.forEach(go)
}
const nodesOf = (tree: RunTree) => {
  const all: TreeNode[] = []
  walk(tree, (n) => all.push(n))
  return all
}
const find = (tree: RunTree, pred: (e: Entry) => boolean) =>
  nodesOf(tree).filter((n) => pred(n.entry))

// A tiny hand-built session for cases the fixtures do not have.
function session(entries: Partial<Entry>[]): Session {
  return {
    format: "session-jsonl",
    sessionId: "s",
    runs: [],
    warnings: [],
    entries: entries.map((e, i) => ({
      kind: "user",
      text: "",
      id: `e${i}`,
      recordId: `r${i}`,
      parentId: null,
      timestamp: null,
      runId: null,
      line: i + 1,
      raw: {},
      ...e,
    })) as Entry[],
  }
}

describe("parent links and order", () => {
  it("attaches every entry of small.jsonl under the prompt, in order", () => {
    const parsed = parseSession(read("small.jsonl"))
    const tree = buildRunTree(parsed).main
    expect(tree.roots).toHaveLength(1)
    const chain: string[] = []
    let node: TreeNode | undefined = tree.roots[0]
    while (node) {
      chain.push(node.entry.id)
      node = node.children[0]
    }
    expect(chain).toEqual(parsed.entries.map((e) => e.id))
  })

  it("orders siblings by timestamp, then file order", () => {
    const tree = buildRunTree(
      session([
        { id: "root" },
        { id: "late", parentId: "root", timestamp: "2025-01-01T00:00:02Z" },
        { id: "early", parentId: "root", timestamp: "2025-01-01T00:00:01Z" },
        { id: "tie-a", parentId: "root", timestamp: "2025-01-01T00:00:03Z" },
        { id: "tie-b", parentId: "root", timestamp: "2025-01-01T00:00:03Z" },
      ]),
    ).main
    expect(tree.roots[0].children.map((n) => n.entry.id)).toEqual([
      "early",
      "late",
      "tie-a",
      "tie-b",
    ])
  })

  it("keeps both sides of a branch under their shared parent", () => {
    const tree = buildRunTree(
      parseSession(read("with-subagents.jsonl"), {
        subagents: subagentsOf("with-subagents"),
      }),
    ).main
    const forks = nodesOf(tree).filter((n) => n.children.length > 1)
    expect(forks).toHaveLength(1)
    const [a, b] = forks[0].children
    expect(a.entry.timestamp! <= b.entry.timestamp!).toBe(true)
  })

  it("makes an entry whose parent is missing a root", () => {
    const tree = buildRunTree(
      session([{ id: "a" }, { id: "b", parentId: "nowhere" }]),
    ).main
    expect(tree.roots.map((n) => n.entry.id)).toEqual(["a", "b"])
  })

  it("returns an empty tree for an empty session", () => {
    expect(buildRunTree(parseSession(""))).toEqual({
      main: { runId: null, roots: [] },
      unattachedRuns: [],
    })
  })

  it.each(["small.jsonl", "failed-tools.jsonl", "edge-cases.jsonl"])(
    "places every entry of %s exactly once",
    (name) => {
      const parsed = parseSession(read(name))
      const ids = nodesOf(buildRunTree(parsed).main).map((n) => n.entry.id)
      expect(ids.sort()).toEqual(parsed.entries.map((e) => e.id).sort())
    },
  )
})

describe("tool call pairing", () => {
  it("pairs a call with its result, error flag and duration", () => {
    const tree = buildRunTree(parseSession(read("small.jsonl"))).main
    const [call] = find(tree, (e) => e.kind === "tool_call")
    expect(call.pairing).toMatchObject({
      status: "ok",
      durationMs: 4747,
      result: { kind: "tool_result", callId: "toolu_ea5cf9da7ee304483fe5f50d" },
    })
  })

  it("marks the errored results of failed-tools.jsonl as errors", () => {
    const tree = buildRunTree(parseSession(read("failed-tools.jsonl"))).main
    const statuses = find(tree, (e) => e.kind === "tool_call").map(
      (n) => n.pairing?.status,
    )
    expect(statuses.filter((s) => s === "error")).toHaveLength(3)
  })

  it("marks a call with no result as 'no-result' instead of failing", () => {
    const tree = buildRunTree(parseSession(read("failed-tools.jsonl"))).main
    const calls = find(tree, (e) => e.kind === "tool_call")
    expect(calls.at(-1)?.pairing).toEqual({
      status: "no-result",
      result: null,
      durationMs: null,
    })
  })

  it("pairs parallel calls by call id, not by position", () => {
    const tree = buildRunTree(
      parseSession(read("with-subagents.jsonl"), {
        subagents: subagentsOf("with-subagents"),
      }),
    ).main
    for (const call of find(tree, (e) => e.kind === "tool_call")) {
      if (call.pairing?.result) {
        expect(call.pairing.result.callId).toBe(
          (call.entry as Extract<Entry, { kind: "tool_call" }>).callId,
        )
      }
    }
  })

  it("leaves the duration empty when a timestamp is missing", () => {
    const tree = buildRunTree(
      session([
        {
          id: "c",
          kind: "tool_call",
          callId: "x",
          name: "T",
          input: {},
          timestamp: null,
        } as Partial<Entry>,
        {
          id: "r",
          kind: "tool_result",
          callId: "x",
          output: "",
          isError: false,
          subagentRunId: null,
          parentId: "c",
          timestamp: "2025-01-01T00:00:01Z",
        } as Partial<Entry>,
      ]),
    ).main
    expect(tree.roots[0].pairing).toMatchObject({
      status: "ok",
      durationMs: null,
    })
  })

  it("flags a result whose call is not in the session", () => {
    const tree = buildRunTree(
      session([
        {
          id: "r",
          kind: "tool_result",
          callId: "ghost",
          output: "",
          isError: false,
          subagentRunId: null,
        } as Partial<Entry>,
      ]),
    ).main
    expect(tree.roots[0].orphan).toBe(true)
  })
})

describe("subagent runs", () => {
  const parsed = parseSession(read("with-subagents.jsonl"), {
    subagents: subagentsOf("with-subagents"),
  })
  const tree = buildRunTree(parsed)

  it("groups each run under the call that spawned it", () => {
    const spawners = find(tree.main, () => true).filter((n) => n.subagentRun)
    expect(spawners).toHaveLength(2)
    for (const node of spawners) {
      expect(node.entry.kind).toBe("tool_call")
      const run = node.subagentRun!
      const runEntries = parsed.entries.filter((e) => e.runId === run.runId)
      expect(
        nodesOf(run)
          .map((n) => n.entry.id)
          .sort(),
      ).toEqual(runEntries.map((e) => e.id).sort())
    }
    expect(tree.unattachedRuns).toEqual([])
  })

  it("keeps subagent entries out of the main run", () => {
    expect(nodesOf(tree.main).every((n) => n.entry.runId === null)).toBe(true)
  })

  it("pairs a failed call inside its subagent run", () => {
    const runs = find(tree.main, () => true).flatMap((n) =>
      n.subagentRun ? [n.subagentRun] : [],
    )
    const failed = runs.flatMap((r) =>
      find(r, (e) => e.kind === "tool_call").filter(
        (n) => n.pairing?.status === "error",
      ),
    )
    expect(failed).toHaveLength(1)
  })

  it("keeps a run that no call spawned at the top level", () => {
    const [id, log] = Object.entries(subagentsOf("with-subagents"))[0]
    const t = buildRunTree(
      parseSession(read("small.jsonl"), { subagents: { [id]: log } }),
    )
    expect(t.unattachedRuns.map((r) => r.runId)).toEqual([id])
    expect(t.unattachedRuns[0].roots.length).toBeGreaterThan(0)
  })
})

describe("hostile shapes", () => {
  const call = (
    id: string,
    callId: string,
    ts: string,
    parentId: string | null = null,
  ) =>
    ({
      id,
      kind: "tool_call",
      callId,
      name: "T",
      input: {},
      parentId,
      timestamp: ts,
      message: { id: null, model: null, usage: null },
    }) as Partial<Entry>
  const result = (
    id: string,
    callId: string,
    ts: string,
    parentId: string | null = null,
  ) =>
    ({
      id,
      kind: "tool_result",
      callId,
      output: "",
      isError: false,
      subagentRunId: null,
      parentId,
      timestamp: ts,
    }) as Partial<Entry>

  it("keeps entries caught in a parent loop, as roots", () => {
    const tree = buildRunTree(
      session([
        { id: "a" },
        { id: "b", parentId: "c" },
        { id: "c", parentId: "b" },
        { id: "d", parentId: "d" },
      ]),
    ).main
    const ids = nodesOf(tree)
      .map((n) => n.entry.id)
      .sort()
    expect(ids).toEqual(["a", "b", "c", "d"])
    expect(tree.roots.map((n) => n.entry.id)).toEqual(["a", "b", "d"])
    expect(
      tree.roots.filter((n) => n.brokenParent).map((n) => n.entry.id),
    ).toEqual(["b", "d"])
  })

  it("pairs repeated call ids in order and never with a later call", () => {
    const tree = buildRunTree(
      session([
        call("c1", "", "2025-01-01T00:00:01Z"),
        result("r1", "", "2025-01-01T00:00:02Z", "c1"),
        call("c2", "", "2025-01-01T00:00:10Z", "r1"),
      ]),
    ).main
    const calls = find(tree, (e) => e.kind === "tool_call")
    expect(
      calls.map((n) => [n.entry.id, n.pairing?.status, n.pairing?.durationMs]),
    ).toEqual([
      ["c1", "ok", 1000],
      ["c2", "no-result", null],
    ])
  })

  it("pairs the first result of a call and flags a second one as an orphan", () => {
    const tree = buildRunTree(
      session([
        call("c", "x", "2025-01-01T00:00:01Z"),
        result("r1", "x", "2025-01-01T00:00:02Z", "c"),
        result("r2", "x", "2025-01-01T00:00:03Z", "r1"),
      ]),
    ).main
    const [c] = find(tree, (e) => e.id === "c")
    expect(c.pairing?.result?.id).toBe("r1")
    expect(
      find(tree, (e) => e.kind === "tool_result").map((n) => [
        n.entry.id,
        !!n.orphan,
      ]),
    ).toEqual([
      ["r1", false],
      ["r2", true],
    ])
  })

  it("orders timestamped siblings by time even with an untimed one between them", () => {
    const tree = buildRunTree(
      session([
        { id: "root" },
        { id: "t3", parentId: "root", timestamp: "2025-01-01T00:00:03Z" },
        { id: "none", parentId: "root", timestamp: null },
        { id: "t1", parentId: "root", timestamp: "2025-01-01T00:00:01Z" },
      ]),
    ).main
    const order = tree.roots[0].children.map((n) => n.entry.id)
    expect(order.indexOf("t1")).toBeLessThan(order.indexOf("t3"))
    expect(order.indexOf("t3")).toBeLessThan(order.indexOf("none"))
  })

  it("orders roots by time", () => {
    const tree = buildRunTree(
      session([
        { id: "late", timestamp: "2025-01-01T00:00:05Z" },
        { id: "early", parentId: "nowhere", timestamp: "2025-01-01T00:00:01Z" },
      ]),
    ).main
    expect(tree.roots.map((n) => n.entry.id)).toEqual(["early", "late"])
  })

  it("flags no paired result as an orphan", () => {
    const tree = buildRunTree(parseSession(read("small.jsonl"))).main
    const results = find(tree, (e) => e.kind === "tool_result")
    expect(results).toHaveLength(4)
    expect(results.every((n) => !n.orphan)).toBe(true)
  })
})

describe("scale and loop edges", () => {
  it("builds a 10,000-entry chain without running out of stack", () => {
    const entries = Array.from({ length: 10_000 }, (_, i) => ({
      id: `e${i}`,
      parentId: i === 0 ? null : `e${i - 1}`,
    }))
    const tree = buildRunTree(session(entries)).main
    let depth = 0
    for (let n: TreeNode | undefined = tree.roots[0]; n; n = n.children[0])
      depth++
    expect(depth).toBe(10_000)
  })

  it("cuts a loop at a member, not at a child hanging off it", () => {
    const tree = buildRunTree(
      session([
        { id: "c", parentId: "b" },
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ]),
    ).main
    expect(tree.roots.map((n) => n.entry.id)).toEqual(["a"])
    expect(tree.roots[0].brokenParent).toBe(true)
    expect(tree.roots[0].children.map((n) => n.entry.id)).toEqual(["b"])
    expect(tree.roots[0].children[0].children.map((n) => n.entry.id)).toEqual([
      "c",
    ])
    expect(nodesOf(tree).filter((n) => n.brokenParent)).toHaveLength(1)
  })
})

describe("large hostile logs", () => {
  it("pairs 50,000 id-less calls in linear time", () => {
    const entries: Partial<Entry>[] = []
    for (let i = 0; i < 50_000; i++) {
      entries.push({
        id: `c${i}`,
        kind: "tool_call",
        callId: "",
        name: "T",
        input: {},
        parentId: i ? `r${i - 1}` : null,
        message: { id: null, model: null, usage: null },
      } as Partial<Entry>)
      entries.push({
        id: `r${i}`,
        kind: "tool_result",
        callId: "",
        output: "",
        isError: false,
        subagentRunId: null,
        parentId: `c${i}`,
      } as Partial<Entry>)
    }
    const started = performance.now()
    const tree = buildRunTree(session(entries)).main
    // Linear pairing takes ~100 ms here; the quadratic version took ~7 s.
    expect(performance.now() - started).toBeLessThan(2_000)
    let node: TreeNode | undefined = tree.roots[0]
    let paired = 0
    while (node) {
      if (node.pairing?.status === "ok") paired++
      node = node.children[0]
    }
    expect(paired).toBe(50_000)
  })

  it("handles one entry with 200,000 children", () => {
    const entries: Partial<Entry>[] = [{ id: "root" }]
    for (let i = 0; i < 200_000; i++)
      entries.push({ id: `k${i}`, parentId: "root" })
    const tree = buildRunTree(session(entries)).main
    expect(tree.roots[0].children).toHaveLength(200_000)
  })
})
