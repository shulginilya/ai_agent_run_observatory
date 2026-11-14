// JSONL session logs: one record per line with `type`, `uuid`, `parentUuid`,
// `timestamp` and `sessionId`; model messages hold content blocks (text,
// thinking, tool_use, tool_result). See fixtures/README.md.
import type { MessageInfo, TokenUsage } from "../model"
import type { DraftEntry, FormatAdapter, MappedRecord } from "./types"

type Rec = Record<string, unknown>

const isObject = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === "string" ? v : null)
const num = (v: unknown): number => (typeof v === "number" ? v : 0)

function usageOf(message: Rec): TokenUsage | null {
  const u = message.usage
  if (!isObject(u)) return null
  return {
    input: num(u.input_tokens),
    output: num(u.output_tokens),
    cacheCreation: num(u.cache_creation_input_tokens),
    cacheRead: num(u.cache_read_input_tokens),
  }
}

// Tool output is a string or a list of text blocks.
function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((b) => (isObject(b) ? (str(b.text) ?? "") : ""))
      .filter(Boolean)
      .join("\n")
  }
  return ""
}

function userEntries(record: Rec, timestamp: string | null): DraftEntry[] {
  const message = isObject(record.message) ? record.message : {}
  const content = message.content
  if (!Array.isArray(content)) {
    return [{ kind: "user", text: textOf(content), timestamp }]
  }
  const toolUseResult = isObject(record.toolUseResult)
    ? record.toolUseResult
    : null
  const subagentRunId = str(toolUseResult?.agentId)
  const entries: DraftEntry[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    if (block.type === "tool_result") {
      entries.push({
        kind: "tool_result",
        callId: str(block.tool_use_id) ?? "",
        output: textOf(block.content),
        isError: block.is_error === true,
        subagentRunId,
        timestamp,
      })
    } else if (block.type === "text" && str(block.text)?.trim()) {
      entries.push({ kind: "user", text: str(block.text)!, timestamp })
    }
  }
  return entries.length ? entries : [{ kind: "user", text: "", timestamp }]
}

function assistantEntries(record: Rec, timestamp: string | null): DraftEntry[] {
  const message = isObject(record.message) ? record.message : {}
  const info: MessageInfo = {
    id: str(message.id),
    model: str(message.model),
    usage: usageOf(message),
  }
  const content = Array.isArray(message.content) ? message.content : []
  const entries: DraftEntry[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    if (block.type === "text" && str(block.text)?.trim()) {
      entries.push({
        kind: "assistant",
        text: str(block.text)!,
        message: info,
        timestamp,
      })
    } else if (block.type === "thinking" && str(block.thinking)?.trim()) {
      entries.push({
        kind: "reasoning",
        text: str(block.thinking)!,
        message: info,
        timestamp,
      })
    } else if (block.type === "tool_use") {
      entries.push({
        kind: "tool_call",
        callId: str(block.id) ?? "",
        name: str(block.name) ?? "",
        input: block.input ?? null,
        message: info,
        timestamp,
      })
    }
  }
  // A record with only empty blocks still marks a turn in the run.
  return entries.length
    ? entries
    : [{ kind: "assistant", text: "", message: info, timestamp }]
}

export const sessionJsonl: FormatAdapter = {
  name: "session-jsonl",

  detect(record) {
    return (
      isObject(record) &&
      typeof record.type === "string" &&
      typeof record.uuid === "string" &&
      typeof record.sessionId === "string"
    )
  },

  mapRecord(record): MappedRecord {
    const timestamp = str(record.timestamp)
    let entries: DraftEntry[]
    switch (record.type) {
      case "user":
        entries = userEntries(record, timestamp)
        break
      case "assistant":
        entries = assistantEntries(record, timestamp)
        break
      case "system":
        entries = [
          {
            kind: "system",
            text: textOf(record.content),
            subtype: str(record.subtype),
            timestamp,
          },
        ]
        break
      case "attachment":
        entries = [
          { kind: "attachment", data: record.attachment ?? null, timestamp },
        ]
        break
      default:
        entries = [{ kind: "other", recordType: str(record.type), timestamp }]
    }
    return {
      recordId: str(record.uuid) ?? "",
      parentRecordId: str(record.parentUuid),
      sessionId: str(record.sessionId),
      entries,
    }
  },
}
