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
| `sessions/with-subagents.jsonl` | 18 | Two subagents (files in `sessions/with-subagents/subagents/`); one subagent has a failed tool call. Also a `system` and an `attachment` entry, a parallel-call turn, a split assistant message and a branch (see below). |
| `sessions/failed-tools.jsonl` | 14 | Three errored tool results, plus one final tool call with no result (the session ends mid-run). |
| `sessions/edge-cases.jsonl` | 9 lines | One malformed (non-JSON) line, one unknown entry type (`telemetry-ping`), one assistant entry whose content is an empty text block followed by a text block (`stop_reason: null`), one assistant entry without `usage`. |

Every `tool_use` id has exactly one later `tool_result`, except the interrupted
call at the end of `failed-tools.jsonl`.

## Shapes covered

All in `sessions/with-subagents.jsonl`:

- Parallel calls: one assistant entry with two `tool_use` blocks, answered by a
  single user entry with two `tool_result` blocks.
- Split message: one assistant message spread over two consecutive entries that
  share the same `message.id` and an identical `usage` object. Usage must be
  counted once per message, not once per entry.
- Branch: two entries with the same `parentUuid` (a discarded draft turn and
  its retry).

## Usage values

Token counts in `usage` are illustrative, not measured. `cache_read_input_tokens`
grows through a session and `output_tokens` roughly follows the size of the
turn's text and tool input.

## Editing fixtures

Fixtures are hand-maintained static files. Any change must keep `pnpm test`
(`tests/fixtures.test.ts`) green. Large generated fixtures needed later, for
example for performance tests, belong in a committed, seeded generator script,
not in hand-written files.
