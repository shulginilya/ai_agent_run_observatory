# Agent Run Observatory

Upload an AI coding agent's session log and see what the agent actually did: a timeline of
prompts, replies and tool calls, the subagents it spawned, where it failed, and what it
cost in tokens.

> **Status: planning complete, development not started.** The backlog and sprint plan
> are in place, and Sprint 1 starts on 5 October 2026. Nothing below is built yet; it
> describes what the project will deliver.

## Why

AI coding agents record every session as a `.jsonl` log. These logs show exactly how an
agent reached its result: every prompt, reasoning step, tool call, subagent run and error.
As raw JSON lines, though, they're unreadable, so nobody looks at them. Agent Run
Observatory turns a session file into something you can explore.

## Planned features

- **Ingest:** upload a session file. It's parsed into typed entries, linked into a run
  tree (tool calls paired with their results, subagent runs grouped), and stored.
- **Privacy:** secrets are redacted on ingest. An optional "metadata only" mode drops
  conversation text. Each user's sessions are private.
- **Explore:** a sessions list, then a timeline per session: markdown replies, collapsible
  thinking, expandable tool calls, subagent groups, filters, error navigation, and
  virtualized scrolling for long sessions.
- **Insights:** token and tool-usage charts, an estimated cost per session, and a subagent
  tree.
- **Demo mode:** sanitized sample sessions anyone can browse without signing in.
- **AI summary (stretch):** a short AI-written summary of the run.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Data | Postgres on Neon, Drizzle ORM |
| Auth | Auth.js with GitHub sign-in |
| Tests | Vitest (unit), Playwright (end-to-end) |
| CI / hosting | GitHub Actions, Vercel (preview deployment per pull request) |

## How it's built

This project is also a training ground for an agentic development team, with a
specialised agent for each stage of the work:

- **Scrum master:** refines the backlog and plans sprints.
- **Developer:** implements one slice per ticket and verifies it with the repository's own checks.
- **Code reviewer:** reviews every pull request before it is merged.
- **Debugger:** investigates failures, testing one hypothesis at a time.

Every change goes through a pull request and a human merge.
