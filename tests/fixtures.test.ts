import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "fixtures")

const HOME_PATH = /\/(?:home|Users)\/([^/\s"'\\]+)\//g
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g
const SECRET_PATTERNS: Record<string, RegExp> = {
  "sk- key": /\bsk[-_][A-Za-z0-9_-]{20,}/,
  "ghp_ token": /ghp_/,
  "gho_ token": /gho_/,
  "github_pat_ token": /github_pat_/,
  "AWS access key": /AKIA[0-9A-Z]{16}/,
  "Slack token": /xox[baprs]-/,
  "PEM block": /-----BEGIN/,
  "generic secret": /(api[_-]?key|token|secret)["':= ]+[A-Za-z0-9_-]{20,}/i,
}
const ALLOWED_HOME_NAME = "dev"
const ALLOWED_EMAIL_DOMAINS = ["example.com", "example.org"]

function findViolations(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(HOME_PATH)) {
    if (m[1] !== ALLOWED_HOME_NAME) found.push(`home path: ${m[0]}`)
  }
  for (const m of text.matchAll(EMAIL)) {
    if (!ALLOWED_EMAIL_DOMAINS.includes(m[1].toLowerCase())) found.push(`email: ${m[0]}`)
  }
  for (const [label, re] of Object.entries(SECRET_PATTERNS)) {
    if (re.test(text)) found.push(`secret (${label})`)
  }
  return found
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })
}

const files = listFiles(ROOT)
const rel = (p: string) => relative(ROOT, p).split(sep).join("/")
const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"))
const mainLogs = jsonlFiles.filter((f) => !rel(f).includes("/subagents/"))
const subagentLogs = jsonlFiles.filter((f) => rel(f).includes("/subagents/"))

const MALFORMED_ALLOWED = { "sessions/edge-cases.jsonl": 1 } as Record<string, number>
// Deliberately interrupted tool calls (no result), per file.
const UNPAIRED_ALLOWED = { "sessions/failed-tools.jsonl": 1 } as Record<string, number>

type Entry = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function parse(file: string): { entries: Entry[]; malformed: number } {
  const entries: Entry[] = []
  let malformed = 0
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      malformed++
    }
  }
  return { entries, malformed }
}

function blocks(e: Entry): Entry[] {
  const c = e.message?.content
  return Array.isArray(c) ? c : []
}

describe("fixture hygiene", () => {
  it("finds fixture files", () => {
    expect(mainLogs.length).toBeGreaterThanOrEqual(3)
    expect(subagentLogs.length).toBeGreaterThanOrEqual(2)
  })

  it.each(files.map((f) => [rel(f), f]))("%s has no real paths, emails or secrets", (_n, f) => {
    expect(findViolations(readFileSync(f, "utf8"))).toEqual([])
  })

  it("scanner flags planted violations", () => {
    expect(findViolations("/home/alice/project")).toHaveLength(1)
    expect(findViolations("/Users/bob/project")).toHaveLength(1)
    expect(findViolations("/home/dev/project")).toEqual([])
    expect(findViolations("someone@corp.test")).toHaveLength(1)
    expect(findViolations("someone@example.com")).toEqual([])
    expect(findViolations("ghp_" + "a".repeat(10))).not.toEqual([])
    expect(findViolations("sk-" + "a".repeat(24))).not.toEqual([])
    expect(findViolations("AKIA" + "A".repeat(16))).not.toEqual([])
    expect(findViolations("xoxb-1")).not.toEqual([])
    expect(findViolations("-----BEGIN KEY")).not.toEqual([])
    expect(findViolations('"api_key": "' + "a".repeat(24) + '"')).not.toEqual([])
  })
})

describe("fixture structure", () => {
  it.each(jsonlFiles.map((f) => [rel(f), f]))("%s: only the documented malformed lines fail to parse", (name, f) => {
    expect(parse(f).malformed).toBe(MALFORMED_ALLOWED[name] ?? 0)
  })

  it.each(jsonlFiles.map((f) => [rel(f), f]))("%s: entries chain by parentUuid", (_n, f) => {
    const { entries } = parse(f)
    entries.forEach((e, i) => {
      expect(e.parentUuid).toBe(i === 0 ? null : entries[i - 1].uuid)
    })
  })

  it.each(mainLogs.map((f) => [rel(f), f]))("%s: sessionId is consistent, including subagent files", (name, f) => {
    const ids = new Set(parse(f).entries.map((e) => e.sessionId))
    expect(ids.size).toBe(1)
    const dir = name.replace(/\.jsonl$/, "/subagents/")
    for (const s of subagentLogs.filter((s) => rel(s).startsWith(dir))) {
      for (const e of parse(s).entries) {
        expect(e.sessionId).toBe([...ids][0])
        expect(e.isSidechain).toBe(true)
      }
    }
  })

  it.each(mainLogs.map((f) => [rel(f), f]))("%s: every tool_use has a result except documented ones", (name, f) => {
    const files = [f, ...subagentLogs.filter((s) => rel(s).startsWith(name.replace(/\.jsonl$/, "/subagents/")))]
    let unpaired = 0
    for (const file of files) {
      const entries = parse(file).entries
      const results = entries.flatMap(blocks).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id)
      const uses = entries.filter((e) => e.type === "assistant").flatMap(blocks).filter((b) => b.type === "tool_use").map((b) => b.id)
      expect(new Set(uses).size).toBe(uses.length)
      for (const id of results) expect(uses).toContain(id)
      expect(new Set(results).size).toBe(results.length)
      unpaired += uses.filter((id) => !results.includes(id)).length
    }
    expect(unpaired).toBe(UNPAIRED_ALLOWED[name] ?? 0)
  })

  it.each(subagentLogs.map((f) => [rel(f), f]))("%s is referenced by an agentId in its main log", (name, f) => {
    const main = join(ROOT, name.split("/subagents/")[0] + ".jsonl")
    const referenced = parse(main).entries.map((e) => e.toolUseResult?.agentId).filter(Boolean)
    const fileAgent = name.match(/agent-([0-9a-f]+)\.jsonl$/)?.[1]
    expect(referenced).toContain(fileAgent)
    for (const e of parse(f).entries) expect(e.agentId).toBe(fileAgent)
  })

  it("edge-cases fixture contains an unknown type, an empty text block and an entry without usage", () => {
    const { entries } = parse(join(ROOT, "sessions/edge-cases.jsonl"))
    expect(entries.some((e) => e.type === "telemetry-ping")).toBe(true)
    expect(entries.flatMap(blocks).some((b) => b.type === "text" && b.text === "")).toBe(true)
    expect(entries.some((e) => e.type === "assistant" && e.message.usage === undefined)).toBe(true)
  })
})
