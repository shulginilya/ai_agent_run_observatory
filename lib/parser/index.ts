// Turns a session log into the neutral session model. Pure: text in, data
// out. Where the text comes from (upload, fixture, database) is the caller's
// business.
import { adapters, type FormatAdapter } from "./adapters"
import type { Entry, ParseWarning, Session, SubagentRun } from "./model"

export type ParseOptions = {
  // Subagent logs stored next to the main log, keyed by subagent run id.
  subagents?: Record<string, string>
}

export class UnsupportedFormatError extends Error {
  readonly supportedFormats: string[]
  constructor(supported: string[]) {
    super(`Unsupported log format. Supported formats: ${supported.join(", ")}.`)
    this.name = "UnsupportedFormatError"
    this.supportedFormats = supported
  }
}

type Line = { line: number; record: Record<string, unknown> }

function readLines(text: string, warnings: ParseWarning[], runId?: string) {
  const lines: Line[] = []
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      if (!raw.trim()) return
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        warnings.push({
          code: "malformed-line",
          line: i + 1,
          ...(runId ? { runId } : {}),
          message: `Line ${i + 1}${runId ? ` of subagent log ${runId}` : ""} is not valid JSON; skipped.`,
        })
        return
      }
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        lines.push({ line: i + 1, record: value as Record<string, unknown> })
      } else {
        warnings.push({
          code: "malformed-line",
          line: i + 1,
          ...(runId ? { runId } : {}),
          message: `Line ${i + 1} is not a JSON object; skipped.`,
        })
      }
    })
  return lines
}

// Maps one log (main or subagent) and links each entry to the entry before it.
function mapLog(
  adapter: FormatAdapter,
  lines: Line[],
  runId: string | null,
  warnings: ParseWarning[],
) {
  const entries: Entry[] = []
  const lastEntryOfRecord = new Map<string, string>()
  const pending: { entry: Entry; parentRecordId: string | null }[] = []
  let sessionId: string | null = null

  for (const { line, record } of lines) {
    const mapped = adapter.mapRecord(record)
    sessionId ??= mapped.sessionId
    let previous: string | null = null
    mapped.entries.forEach((draft, index) => {
      const entry = {
        ...draft,
        id: `${runId ?? "main"}:${line}:${index}`,
        recordId: mapped.recordId,
        parentId: previous,
        runId,
        line,
        raw: record,
      } as Entry
      if (index === 0)
        pending.push({ entry, parentRecordId: mapped.parentRecordId })
      previous = entry.id
      entries.push(entry)
    })
    if (previous && mapped.recordId !== null) {
      if (lastEntryOfRecord.has(mapped.recordId)) {
        // Children link to the first copy; a repeat must not re-route them.
        warnings.push({
          code: "duplicate-record",
          line,
          ...(runId ? { runId } : {}),
          message: `Record ${mapped.recordId} on line ${line} repeats an earlier record id; its children link to the first copy.`,
        })
      } else {
        lastEntryOfRecord.set(mapped.recordId, previous)
      }
    }
  }

  for (const { entry, parentRecordId } of pending) {
    if (parentRecordId === null) continue
    const parent = lastEntryOfRecord.get(parentRecordId)
    if (parent) {
      entry.parentId = parent
    } else {
      warnings.push({
        code: "unknown-parent",
        line: entry.line,
        ...(runId ? { runId } : {}),
        message: `Record ${entry.recordId} on line ${entry.line} refers to parent ${parentRecordId}, which is not in the log.`,
      })
    }
  }
  return { entries, sessionId }
}

// Logs may open with bookkeeping records that carry no ids, so look at the
// first few records, not only the first.
const DETECT_WITHIN = 20

function detect(lines: Line[]): FormatAdapter {
  for (const { record } of lines.slice(0, DETECT_WITHIN)) {
    const adapter = adapters.find((a) => a.detect(record))
    if (adapter) return adapter
  }
  throw new UnsupportedFormatError(adapters.map((a) => a.name))
}

export function parseSession(
  text: string,
  options: ParseOptions = {},
): Session {
  const warnings: ParseWarning[] = []
  const lines = readLines(text, warnings)

  if (lines.length === 0 && warnings.length === 0) {
    return {
      format: null,
      sessionId: null,
      entries: [],
      runs: [],
      warnings: [{ code: "no-entries", message: "The log has no entries." }],
    }
  }

  const adapter = detect(lines)
  const main = mapLog(adapter, lines, null, warnings)
  const entries = [...main.entries]

  // Subagent runs: spawned by a tool result in the main log, stored in their
  // own log. Each is attributed by the run id both sides carry.
  const runs: SubagentRun[] = []
  const subagents = options.subagents ?? {}
  for (const entry of main.entries) {
    if (entry.kind !== "tool_result" || !entry.subagentRunId) continue
    const id = entry.subagentRunId
    if (runs.some((r) => r.id === id)) continue
    runs.push({ id, spawnedBy: entry.id })
    if (!(id in subagents)) {
      warnings.push({
        code: "missing-subagent-log",
        runId: id,
        message: `Subagent run ${id} was spawned but its log was not provided.`,
      })
    }
  }
  for (const [id, log] of Object.entries(subagents)) {
    if (!runs.some((r) => r.id === id)) {
      runs.push({ id, spawnedBy: null })
      warnings.push({
        code: "unspawned-subagent-log",
        runId: id,
        message: `Subagent log ${id} was provided but no call in the main log spawned it.`,
      })
    }
    const subLines = readLines(log, warnings, id)
    entries.push(...mapLog(adapter, subLines, id, warnings).entries)
  }

  return {
    format: adapter.name,
    sessionId: main.sessionId,
    entries,
    runs,
    warnings,
  }
}

export type * from "./model"
