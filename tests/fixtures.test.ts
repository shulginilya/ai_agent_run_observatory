import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "fixtures")

// Unix-style home directories; the name may be empty (e.g. a bare `/home/`).
const HOME_PATH = /(?<![A-Za-z0-9_.-])\/(?:home|Users)\/([^/\s"'\\]*)/g
const ROOT_HOME = /(?<![A-Za-z0-9_.-])\/root(?![A-Za-z0-9_-])/g
// Windows home directories, with one to four backslashes (JSON escaping).
const WIN_HOME = /[A-Za-z]:\\{1,4}Users\\{0,4}([^\\/\s"']*)/g
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g
const SECRET_PATTERNS: Record<string, RegExp> = {
  "sk- key": /\bsk[-_][A-Za-z0-9_-]{20,}/,
  "ghp_ token": /ghp_/,
  "gho_ token": /gho_/,
  "github_pat_ token": /github_pat_/,
  "AWS access key": /AKIA[0-9A-Z]{16}/,
  "Slack token": /xox[baprs]-/,
  "PEM block": /-----BEGIN/,
  // The value must contain a digit so long snake_case identifiers do not match.
  "generic secret": /(api[_-]?key|token|secret)[\\"':= ]+(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/i,
  JWT: /eyJ[A-Za-z0-9_-]{10,}\./,
  "Google API key": /AIza[0-9A-Za-z_-]{35}/,
  "bearer token": /Bearer\s+[A-Za-z0-9._-]{16,}/,
}
const ALLOWED_HOME_NAME = "dev"
const ALLOWED_EMAIL_DOMAINS = ["example.com", "example.org"]

function findViolations(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(HOME_PATH)) {
    if (m[1] !== ALLOWED_HOME_NAME) found.push(`home path: ${m[0]}`)
  }
  for (const m of text.matchAll(WIN_HOME)) {
    if (m[1] !== ALLOWED_HOME_NAME) found.push(`windows home path: ${m[0]}`)
  }
  for (const m of text.matchAll(ROOT_HOME)) found.push(`home path: ${m[0]}`)
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
    expect(findViolations('"cwd":"/home/alice"')).toHaveLength(1)
    expect(findViolations('"cwd":"/home/"')).toHaveLength(1)
    expect(findViolations('"cwd":"/root"')).toHaveLength(1)
    expect(findViolations("/root/.config")).toHaveLength(1)
    expect(findViolations("C:\\Users\\bob\\x")).toHaveLength(1)
    expect(findViolations("C:\\\\Users\\\\bob")).toHaveLength(1)
    expect(findViolations("C:\\\\\\\\Users\\\\\\\\bob")).toHaveLength(1)
    expect(findViolations("/home/dev/projects/x")).toEqual([])
    expect(findViolations('"cwd":"/home/dev"')).toEqual([])
    expect(findViolations("/var/root-cache")).toEqual([])
    expect(findViolations("someone@corp.test")).toHaveLength(1)
    expect(findViolations("someone@example.com")).toEqual([])
    expect(findViolations("ghp_" + "a".repeat(10))).not.toEqual([])
    expect(findViolations("sk-" + "a".repeat(24))).not.toEqual([])
    expect(findViolations("AKIA" + "A".repeat(16))).not.toEqual([])
    expect(findViolations("xoxb-1")).not.toEqual([])
    expect(findViolations("-----BEGIN KEY")).not.toEqual([])
    expect(findViolations('"api_key": "' + "a".repeat(23) + '1"')).not.toEqual([])
    // JSON-escaped separator
    expect(findViolations('\\"token\\":\\"' + "a".repeat(23) + '1\\"')).not.toEqual([])
    // identifiers without digits are not secrets
    expect(findViolations("secret = some_long_identifier_name")).toEqual([])
    expect(findViolations("token: " + "a".repeat(30))).toEqual([])
    expect(findViolations("eyJhbGciOiJIUzI1NiJ9.payload")).not.toEqual([])
    expect(findViolations("eyJ")).toEqual([])
    expect(findViolations("AIza" + "a".repeat(35))).not.toEqual([])
    expect(findViolations("AIza" + "a".repeat(10))).toEqual([])
    expect(findViolations("Authorization: Bearer " + "a".repeat(20))).not.toEqual([])
    expect(findViolations("Bearer short")).toEqual([])
  })
})

describe("fixture structure", () => {
  it.each(jsonlFiles.map((f) => [rel(f), f]))("%s: only the documented malformed lines fail to parse", (name, f) => {
    expect(parse(f).malformed).toBe(MALFORMED_ALLOWED[name] ?? 0)
  })

  it.each(jsonlFiles.map((f) => [rel(f), f]))("%s: parentUuid is null first, then an earlier uuid", (_n, f) => {
    const { entries } = parse(f)
    const seen = new Set<string>()
    entries.forEach((e, i) => {
      if (i === 0) expect(e.parentUuid).toBeNull()
      else expect(seen.has(e.parentUuid)).toBe(true)
      seen.add(e.uuid)
    })
  })

  it.each(jsonlFiles.map((f) => [rel(f), f]))("%s: uuids are unique v4 and timestamps do not decrease", (_n, f) => {
    const { entries } = parse(f)
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    for (const e of entries) {
      expect(e.uuid).toMatch(v4)
      expect(e.sessionId).toMatch(v4)
    }
    expect(new Set(entries.map((e) => e.uuid)).size).toBe(entries.length)
    const ts = entries.map((e) => Date.parse(e.timestamp))
    ts.forEach((t, i) => {
      expect(Number.isNaN(t)).toBe(false)
      if (i > 0) expect(t).toBeGreaterThanOrEqual(ts[i - 1])
    })
  })

  it.each(jsonlFiles.map((f) => [rel(f), f]))("%s: cache_read_input_tokens does not decrease", (_n, f) => {
    const reads = parse(f).entries.filter((e) => e.message?.usage).map((e) => e.message.usage.cache_read_input_tokens as number)
    reads.forEach((r, i) => {
      if (i > 0) expect(r).toBeGreaterThanOrEqual(reads[i - 1])
    })
  })

  it.each(mainLogs.map((f) => [rel(f), f]))("%s: Agent calls pair with an existing subagent file and its time window", (name, f) => {
    const entries = parse(f).entries
    const uses = entries.filter((e) => e.type === "assistant").flatMap((e) =>
      blocks(e).filter((b) => b.name === "Agent").map((b) => ({ id: b.id as string, at: Date.parse(e.timestamp) })))
    const agentIds: string[] = []
    for (const u of uses) {
      const res = entries.find((e) => blocks(e).some((b) => b.type === "tool_result" && b.tool_use_id === u.id))
      expect(res).toBeDefined()
      const agentId = res!.toolUseResult.agentId as string
      agentIds.push(agentId)
      const sub = subagentLogs.find((s) => rel(s) === name.replace(/\.jsonl$/, `/subagents/agent-${agentId}.jsonl`))
      expect(sub).toBeDefined()
      const ts = parse(sub!).entries.map((e) => Date.parse(e.timestamp))
      expect(ts[0]).toBeGreaterThan(u.at)
      expect(ts[ts.length - 1]).toBeLessThan(Date.parse(res!.timestamp))
    }
    const dir = name.replace(/\.jsonl$/, "/subagents/")
    expect(subagentLogs.filter((s) => rel(s).startsWith(dir))).toHaveLength(agentIds.length)
  })

  it("with-subagents covers parallel calls, a split message and a branch", () => {
    const entries = parse(join(ROOT, "sessions/with-subagents.jsonl")).entries
    // parallel: one assistant entry with two tool_use blocks answered by one user entry with two results
    const parallel = entries.find((e) => e.type === "assistant" && blocks(e).filter((b) => b.type === "tool_use").length === 2)
    expect(parallel).toBeDefined()
    const ids = blocks(parallel!).filter((b) => b.type === "tool_use").map((b) => b.id)
    const answer = entries.find((e) => blocks(e).some((b) => b.type === "tool_result" && b.tool_use_id === ids[0]))
    expect(blocks(answer!).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id)).toEqual(ids)
    // split message: consecutive entries share message.id and usage
    const split = entries.some((e, i) => i > 0 && e.type === "assistant" && entries[i - 1].type === "assistant"
      && e.message.id === entries[i - 1].message.id
      && JSON.stringify(e.message.usage) === JSON.stringify(entries[i - 1].message.usage))
    expect(split).toBe(true)
    // branch: two entries with the same parent
    const parents = entries.map((e) => e.parentUuid).filter((p) => p !== null)
    expect(new Set(parents).size).toBeLessThan(parents.length)
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
