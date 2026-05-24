# OpenClaw Overnight Coding

Use this file when running long autonomous work for MoodsWatch through OpenClaw.

## Agent

Preferred short command from the repository root:

```powershell
.\overnight.cmd "describe the task"
```

Direct OpenClaw command:

```powershell
openclaw agent --agent moodswatch-overnight --message "<task>"
```

Workspace:

```text
C:\Users\WiNDOWS 11 PRO\Desktop\Moodswatch
```

## Operating Model

The single OpenClaw agent should simulate three internal roles and record handoffs in `docs/openclaw/TODO.md`:

- `Planner_Agent`: converts the user request into ordered tasks, constraints, risks, and acceptance checks.
- `Developer_Agent`: implements the smallest useful changes, following `AGENTS.md` and existing project patterns.
- `Tester_Agent`: runs allowed verification commands, captures failures, and sends actionable fixes back to the developer loop.

Do not claim work is complete until `Tester_Agent` records the checks that passed or clearly explains what could not be run.

## Required Overnight Flow

1. Inspect `git status --short --branch` and stop if unrelated dirty files would be touched.
2. Create or update `docs/openclaw/TODO.md` with the requested task, plan, current phase, and acceptance checks.
3. Create a new branch before implementation unless the user says otherwise.
4. Implement one bounded slice at a time.
5. After each meaningful slice, run the narrowest relevant test first.
6. If a test fails, paste the failure summary into `docs/openclaw/TODO.md`, fix the root cause, and rerun the same check.
7. Before stopping, run the final verification set allowed by `docs/openclaw/TOOLS.md`.
8. Write a final handoff section in `docs/openclaw/TODO.md` with changed files, commands run, remaining risks, and recommended next action.

## Default Branch Naming

Use this pattern unless the user provides a name:

```text
feature/openclaw-overnight-YYYYMMDD-short-task
```

## Default Verification Ladder

Use the smallest useful subset for the requested change:

```powershell
npm run lint
npm run test:unit
npm test
npm run build
```

Only run Playwright when the change touches routing, auth, major UI flows, or the user explicitly requests e2e coverage:

```powershell
npm run test:e2e
```

## Overnight Trigger Template

Short form:

```powershell
.\overnight.cmd "Add register support with password hashing and tests"
```

The wrapper expands that into this instruction shape:

```text
Start overnight work in C:\Users\WiNDOWS 11 PRO\Desktop\Moodswatch.

Use docs/openclaw/OVERNIGHT.md, AGENTS.md, and docs/openclaw/TOOLS.md.

Task:
<describe the feature, bug, refactor, or investigation>

Requirements:
- Check git status before starting.
- Create a new branch.
- Write or update docs/openclaw/TODO.md as the live task board and handoff log.
- Work as Planner_Agent -> Developer_Agent -> Tester_Agent.
- Do not touch unrelated user changes.
- Run lint, unit tests, and build as appropriate for the risk.
- If a check fails, fix the root cause and rerun it, or record a blocker with evidence.
- At the end, summarize changed files, checks, and residual risks in docs/openclaw/TODO.md and reply in chat.
```
