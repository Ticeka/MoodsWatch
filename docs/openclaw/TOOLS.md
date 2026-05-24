# Tool Permissions

These permissions apply to OpenClaw overnight work in this repository.

## Role Permissions

- `Planner_Agent`: may read files and write `docs/openclaw/TODO.md` only.
- `Developer_Agent`: may read files and edit project source, tests, docs, and config needed for the requested task.
- `Tester_Agent`: may read files and run the allowed commands below.

## Allowed Commands

Use these commands from the repository root:

```powershell
git status --short --branch
git diff
git diff --stat
git switch -c <branch-name>
.\overnight.cmd "<task>"
npm run lint
npm run test:unit
npm test
npm run build
npm run test:tierlist
npm run test:op-mc
npm run test:e2e
```

Use `npm install` only when `package.json` or `package-lock.json` requires dependency changes for the requested task.

## Restricted Commands

Do not run these during overnight work unless the user explicitly approves:

```powershell
git reset --hard
git clean
git push
git rebase
git merge
Remove-Item -Recurse
npm audit fix
npm update
supabase db push
```

## Write Boundaries

- Do not edit `.env` or add secrets to source control.
- Do not modify generated outputs such as `dist`, `playwright-report`, `test-results`, or screenshot temp files unless the task explicitly requires it.
- Do not revert existing dirty files unless the user explicitly asks.
- Prefer project patterns from `AGENTS.md`, `src/shared`, and nearby feature folders.
