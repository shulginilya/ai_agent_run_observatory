// Links parsed entries into trees: one per run, each entry under its parent,
// tool calls paired with their results, subagent runs under the call that
// spawned them. Pure: a Session in, a tree out.
import type { Entry, Session, ToolResultEntry } from "../parser"

export type CallPairing = {
  // "ok" and "error" follow the result's error flag; "no-result" means the
  // session ended before the call returned.
  status: "ok" | "error" | "no-result"
  result: ToolResultEntry | null
  // Result time minus call time; null when either timestamp is missing.
  durationMs: number | null
}

export type TreeNode = {
  entry: Entry
  children: TreeNode[]
  // Tool calls only.
  pairing?: CallPairing
  // Tool calls that spawned a subagent run.
  subagentRun?: RunTree
  // Tool results whose call is not in the run.
  orphan?: boolean
}

export type RunTree = {
  // Null for the main run.
  runId: string | null
  roots: TreeNode[]
}

export type SessionTree = {
  main: RunTree
  // Subagent runs no call in the main log spawned.
  unattachedRuns: RunTree[]
}

const time = (ts: string | null) => {
  if (ts === null) return null
  const ms = Date.parse(ts)
  return Number.isNaN(ms) ? null : ms
}

function buildRun(runId: string | null, entries: Entry[]): RunTree {
  const nodes = new Map<string, TreeNode>()
  const order = new Map<string, number>()
  entries.forEach((entry, i) => {
    nodes.set(entry.id, { entry, children: [] })
    order.set(entry.id, i)
  })

  const roots: TreeNode[] = []
  for (const entry of entries) {
    const node = nodes.get(entry.id)!
    const parent = entry.parentId ? nodes.get(entry.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  // Siblings by time; file order when times tie or are missing.
  const byTime = (a: TreeNode, b: TreeNode) => {
    const ta = time(a.entry.timestamp)
    const tb = time(b.entry.timestamp)
    if (ta !== null && tb !== null && ta !== tb) return ta - tb
    return order.get(a.entry.id)! - order.get(b.entry.id)!
  }
  roots.sort(byTime)
  for (const node of nodes.values()) node.children.sort(byTime)

  // Pair calls and results by call id within this run.
  const calls = new Map<string, TreeNode>()
  for (const node of nodes.values()) {
    if (node.entry.kind === "tool_call") calls.set(node.entry.callId, node)
  }
  for (const node of nodes.values()) {
    if (node.entry.kind !== "tool_result") continue
    const call = calls.get(node.entry.callId)
    if (!call || call.pairing) {
      node.orphan = true
      continue
    }
    const callAt = time(call.entry.timestamp)
    const resultAt = time(node.entry.timestamp)
    call.pairing = {
      status: node.entry.isError ? "error" : "ok",
      result: node.entry,
      durationMs:
        callAt !== null && resultAt !== null ? resultAt - callAt : null,
    }
  }
  for (const node of calls.values()) {
    node.pairing ??= { status: "no-result", result: null, durationMs: null }
  }

  return { runId, roots }
}

export function buildRunTree(session: Session): SessionTree {
  const byRun = new Map<string | null, Entry[]>()
  for (const entry of session.entries) {
    const list = byRun.get(entry.runId) ?? []
    list.push(entry)
    byRun.set(entry.runId, list)
  }

  const runTree = (id: string) => buildRun(id, byRun.get(id) ?? [])
  const main = buildRun(null, byRun.get(null) ?? [])

  // A subagent run hangs under the call whose result reported it.
  const callsById = new Map<string, TreeNode>()
  const walk = (node: TreeNode) => {
    if (node.entry.kind === "tool_call") callsById.set(node.entry.callId, node)
    node.children.forEach(walk)
  }
  main.roots.forEach(walk)

  const unattachedRuns: RunTree[] = []
  for (const run of session.runs) {
    const spawner = session.entries.find(
      (e): e is ToolResultEntry =>
        e.id === run.spawnedBy && e.kind === "tool_result",
    )
    const call = spawner ? callsById.get(spawner.callId) : undefined
    if (call && !call.subagentRun) call.subagentRun = runTree(run.id)
    else unattachedRuns.push(runTree(run.id))
  }

  return { main, unattachedRuns }
}
