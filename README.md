# Agent Run Observatory

Upload a Claude Code session log and see what the agent actually did: a timeline of
prompts, replies and tool calls, the subagents it spawned, where it failed, and what it
cost in tokens.

> **Status: planning complete, development not started.** The backlog and sprint plan
> are in place, and Sprint 1 starts on 5 October 2026. Nothing below is built yet; it
> describes what the project will deliver.

## Why

Claude Code records every session as a `.jsonl` file under `~/.claude/projects/`. These
logs show exactly how an agent reached its result: every prompt, reasoning step, tool call,
subagent run and error. As raw JSON lines, though, they're unreadable, so nobody looks at them.
Agent Run Observatory turns a session file into something you can explore.

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
- **AI summary (stretch):** a short summary of the run written by the Claude API.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Data | Postgres on Neon, Drizzle ORM |
| Auth | Auth.js with GitHub sign-in |
| Tests | Vitest (unit), Playwright (end-to-end) |
| CI / hosting | GitHub Actions, Vercel (preview deployment per pull request) |

## Roadmap

Work is tracked as [issues](https://github.com/shulginilya/ai_agent_run_observatory/issues)
on the [project board](https://github.com/users/shulginilya/projects/3), planned in
one-week [sprints](https://github.com/shulginilya/ai_agent_run_observatory/milestones).

| Sprint | Dates (2026) | Goal |
| --- | --- | --- |
| 1 | Oct 5–9 | A CI-checked app skeleton that turns a real session file into typed entries |
| 2 | Oct 12–16 | Upload a session and see it stored, on a live URL |
| 3 | Oct 19–23 | Browse sessions and read a session's conversation and tool calls |
| 4 | Oct 26–30 | Safe for real logs and showable: redaction, private accounts, public demo |
| 5 | Nov 2–6 | Understand how a multi-agent run unfolded and what it cost |
| 6 | Nov 9–13 | Big sessions stay fast and navigable, with charts |
| 7 | Nov 16–20 | Portfolio launch: AI summary and README case study |

The backlog has 26 issues (95 story points), and each one has acceptance criteria and its
dependencies on other issues.

## How it's built

This project is also a training ground for an agentic development team. Claude Code
coordinates specialised agents for each stage of the work:

- **Scrum master:** refines the backlog and plans sprints.
- **Developer:** implements one slice per ticket and verifies it with the repository's own checks.
- **Code reviewer:** reviews every pull request before it is merged.
- **Debugger:** investigates failures, testing one hypothesis at a time.

Every change goes through a pull request and a human merge.

## Documents

- [Kickoff summary (PDF)](docs/kickoff-summary.pdf): options considered, decisions, setup,
  the full backlog and the sprint plan.

## Getting started

Setup instructions will be added in Sprint 1 with the app scaffold
([#1](https://github.com/shulginilya/ai_agent_run_observatory/issues/1)).
