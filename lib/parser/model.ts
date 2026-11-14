// The provider-neutral session model. Every feature reads this, never a raw
// log, so a new log format only needs a new adapter.

export type TokenUsage = {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

// The model message an entry came from. A message can span several entries
// (one per content block, or split over several records); de-duplicate usage
// by `id`.
export type MessageInfo = {
  id: string | null
  model: string | null
  usage: TokenUsage | null
}

type Base = {
  // Unique within the session: `<run>:<line>:<block index>`, where run is
  // "main" or the subagent run id.
  id: string
  // The id the log gives the record this entry came from; null when the
  // record has none.
  recordId: string | null
  // The entry this one follows: the previous block of the same record, or the
  // last entry of the parent record. Null for the first entry of a run.
  parentId: string | null
  timestamp: string | null
  // Null for the main run; the subagent run id for a subagent's entries.
  runId: string | null
  // 1-based line in the file the entry was read from.
  line: number
  // The record exactly as read.
  raw: unknown
}

export type UserEntry = Base & { kind: "user"; text: string }
export type AssistantEntry = Base & {
  kind: "assistant"
  text: string
  message: MessageInfo
}
export type ReasoningEntry = Base & {
  kind: "reasoning"
  text: string
  message: MessageInfo
}
export type ToolCallEntry = Base & {
  kind: "tool_call"
  callId: string
  name: string
  input: unknown
  message: MessageInfo
}
export type ToolResultEntry = Base & {
  kind: "tool_result"
  callId: string
  output: string
  isError: boolean
  // Set when this result is the end of a call that spawned a subagent run.
  subagentRunId: string | null
}
export type SystemEntry = Base & {
  kind: "system"
  text: string
  subtype: string | null
}
export type AttachmentEntry = Base & { kind: "attachment"; data: unknown }
export type OtherEntry = Base & { kind: "other"; recordType: string | null }

export type Entry =
  | UserEntry
  | AssistantEntry
  | ReasoningEntry
  | ToolCallEntry
  | ToolResultEntry
  | SystemEntry
  | AttachmentEntry
  | OtherEntry

export type EntryKind = Entry["kind"]

export type SubagentRun = {
  id: string
  // The tool result entry that reported the run, if the main log has one.
  spawnedBy: string | null
}

export type ParseWarning = {
  code:
    | "no-entries"
    | "malformed-line"
    | "missing-subagent-log"
    | "unspawned-subagent-log"
    | "unknown-parent"
    | "duplicate-record"
  message: string
  line?: number
  runId?: string
}

export type Session = {
  format: string | null
  sessionId: string | null
  entries: Entry[]
  runs: SubagentRun[]
  warnings: ParseWarning[]
}
