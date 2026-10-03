# Sample session logs

Sanitized, entirely invented session logs for parser, run-tree, metrics and demo
work. They imitate the structure of a real agent session log; none of the content
comes from a real session. `tests/fixtures.test.ts` enforces that no real home
path, email address or key-like string ends up in this directory.

## Format

One JSON object per line.

- Common fields on every entry: `type`, `uuid`, `parentUuid` (the previous
  entry's `uuid`, `null` on the first entry), `timestamp` (ISO 8601 UTC,
  increasing), `sessionId`, `isSidechain`, `cwd`, `gitBranch`, `version`,
  `userType`.
- `user`: `message.content` is a string (a prompt) or an array of `tool_result`
  blocks (`tool_use_id`, `content`, optional `is_error: true`). Tool-result
  entries also carry a top-level `toolUseResult` object.
- `assistant`: `message` with `id`, `model`, `content` blocks (`thinking`, `text`,
  `tool_use` with `id`, `name`, `input`), `stop_reason` and `usage` (input,
  output, cache creation and cache read token counts).
- `system` (`content`, `subtype`) and `attachment` (`attachment` object) appear
  occasionally.
- Subagents: the main log has an `Agent` tool call. Its result carries
  `toolUseResult.agentId`. The subagent's entries live in
  `<session-name>/subagents/agent-<agentId>.jsonl`, with `isSidechain: true`,
  an `agentId` field and the same `sessionId` as the main log. The first
  subagent entry has `parentUuid: null`.
- The model name is the placeholder `example-model-1`; the working directory is
  always `/home/dev/projects/sample-app`.

## Fixtures

| File | Entries | Purpose |
| --- | --- | --- |
| `sessions/small.jsonl` | 10 | One prompt, thinking, four tool calls, a final reply. |
| `sessions/with-subagents.jsonl` | 14 | Two subagents (files in `sessions/with-subagents/subagents/`); one subagent has a failed tool call. Also a `system` and an `attachment` entry. |
| `sessions/failed-tools.jsonl` | 14 | Three errored tool results, plus one final tool call with no result (the session ends mid-run). |
| `sessions/edge-cases.jsonl` | 9 lines | One malformed (non-JSON) line, one unknown entry type (`telemetry-ping`), one empty text block, one assistant entry without `usage`. |

Every `tool_use` id has exactly one later `tool_result`, except the interrupted
call at the end of `failed-tools.jsonl`.
