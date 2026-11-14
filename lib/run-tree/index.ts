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
  // The entry's parent link formed a loop, so it was made a root.
  brokenParent?: boolean
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
  const order = new Map<TreeNode, number>()
  entries.forEach((entry, i) => {
    const node: TreeNode = { entry, children: [] }
    nodes.set(entry.id, node)
    order.set(node, i)
  })

  const roots: TreeNode[] = []
  const parentOf = new Map<TreeNode, TreeNode>()
  for (const node of nodes.values()) {
    const parent = node.entry.parentId
      ? nodes.get(node.entry.parentId)
      : undefined
    if (parent) {
      parent.children.push(node)
      parentOf.set(node, parent)
    } else {
      roots.push(node)
    }
  }

  // Links that loop (a self-parent, a→b→a) leave entries no root can reach.
  // Cut each loop at its first entry in file order and make that a root.
  const reached = new Set<TreeNode>()
  const reach = (start: TreeNode) => {
    const stack = [start]
    while (stack.length) {
      const node = stack.pop()!
      if (reached.has(node)) continue
      reached.add(node)
      stack.push(...node.children)
    }
  }
  roots.forEach(reach)
  for (const node of nodes.values()) {
    if (reached.has(node)) continue
    const parent = parentOf.get(node)!
    parent.children = parent.children.filter((c) => c !== node)
    node.brokenParent = true
    roots.push(node)
    reach(node)
  }

  // Siblings by time, file order breaking ties. An untimed entry takes the
  // time of the sibling before it in the file, so the order stays total.
  const sortSiblings = (list: TreeNode[]) => {
    const inFileOrder = [...list].sort((a, b) => order.get(a)! - order.get(b)!)
    const key = new Map<TreeNode, number>()
    let last = Number.NEGATIVE_INFINITY
    for (const node of inFileOrder) {
      last = time(node.entry.timestamp) ?? last
      key.set(node, last)
    }
    return inFileOrder.sort(
      (a, b) => key.get(a)! - key.get(b)! || order.get(a)! - order.get(b)!,
    )
  }
  const sortedRoots = sortSiblings(roots)
  for (const node of nodes.values()) node.children = sortSiblings(node.children)

  // Pair calls and results by call id within this run. A repeated id pairs
  // in file order: each result goes to the earliest unpaired call before it.
  const callsById = new Map<string, TreeNode[]>()
  for (const node of nodes.values()) {
    if (node.entry.kind !== "tool_call") continue
    const list = callsById.get(node.entry.callId) ?? []
    list.push(node)
    callsById.set(node.entry.callId, list)
  }
  for (const node of nodes.values()) {
    if (node.entry.kind !== "tool_result") continue
    const call = callsById
      .get(node.entry.callId)
      ?.find((c) => !c.pairing && order.get(c)! < order.get(node)!)
    if (!call) {
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
  for (const list of callsById.values()) {
    for (const node of list) {
      node.pairing ??= { status: "no-result", result: null, durationMs: null }
    }
  }

  return { runId, roots: sortedRoots }
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
  const callByResult = new Map<string, TreeNode>()
  const walk = (node: TreeNode) => {
    if (node.pairing?.result) callByResult.set(node.pairing.result.id, node)
    node.children.forEach(walk)
  }
  main.roots.forEach(walk)

  const unattachedRuns: RunTree[] = []
  for (const run of session.runs) {
    const call = run.spawnedBy ? callByResult.get(run.spawnedBy) : undefined
    if (call && !call.subagentRun) call.subagentRun = runTree(run.id)
    else unattachedRuns.push(runTree(run.id))
  }

  return { main, unattachedRuns }
}
