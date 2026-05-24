# MoodsWatch Codex Guide

This file is the project-level guide for Codex work in this repository.

Global Codex agent definitions live in:

`C:\Users\WiNDOWS 11 PRO\.codex\agents`

Follow this file together with the global Desktop `AGENTS.md`. This project file takes precedence for MoodsWatch-specific commands, architecture, UI direction, and local skills.

## Project Snapshot

- App: Vite + React anime/manga/manhwa/webtoon discovery and watchlist app.
- UI: React components with colocated CSS, shared primitives in `src/shared/components/ui`, layout in `src/shared/components/layout`, feature slices in `src/features`.
- Backend/data: Supabase client in `src/shared/lib/supabase.js`, migrations and edge functions under `supabase`.
- Testing: Vitest unit tests, Playwright e2e tests, Storybook component checks.
- Brand direction: cute, friendly, playful, warm, soft, and approachable. Avoid neon cyber UI, dark gamer styling, sterile SaaS dashboards, and flat monochrome admin layouts unless preserving an existing surface.

## Default Workflow

1. Inspect the relevant feature folder and shared primitives before editing.
2. Reuse existing components, CSS patterns, data helpers, hooks, and Supabase access patterns.
3. Keep changes scoped to the requested feature or bug.
4. Add or update tests when behavior changes or a bug is fixed.
5. Verify with the narrowest useful command first, then broader checks when risk is higher.
6. Summarize changed files, verification, and any remaining risk.

## Preferred Commands

- Install dependencies only when needed: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Unit tests: `npm run test:unit`
- Existing project smoke test: `npm test`
- Tierlist smoke test: `npm run test:tierlist`
- OP/MC curation check: `npm run test:op-mc`
- E2E tests: `npm run test:e2e`
- Storybook: `npm run storybook`

## OpenClaw Overnight Coding

For long autonomous runs, use the dedicated OpenClaw agent `moodswatch-overnight`.

- Preferred trigger: `.\overnight.cmd "describe the task"` from the repository root.
- Read `docs/openclaw/OVERNIGHT.md` before starting an overnight task.
- Follow `docs/openclaw/TOOLS.md` for allowed commands and restricted actions.
- Use `docs/openclaw/TODO.md` as the live task board and final handoff log.
- Keep all work inside this repository unless the user explicitly allows global OpenClaw config changes.
- Do not touch existing dirty user changes unless they are directly required for the requested task.

## Automatic Role And Subagent Policy

- For simple explanations, one-command checks, and tiny edits, use the relevant role as guidance and do the work directly.
- For non-trivial feature work, bugs, tests, performance, security, data/database changes, refactors, deployment, or documentation handoffs, select the relevant role before acting.
- Use subagents when the task has multiple independent parts, needs specialist review, or benefits from parallel investigation.
- After behavior changes, use `test-automator` guidance for regression coverage proportional to risk.
- After implementation with meaningful risk, use `reviewer` or `code-reviewer` guidance for a quick correctness pass.
- For large summaries or handoffs, use `knowledge-synthesizer`, `context-manager`, or `technical-writer` guidance.

## Agent Routing

Use the matching `.toml` agent from `C:\Users\WiNDOWS 11 PRO\.codex\agents` as the source role. The repo does not require legacy `agents/*.md` files.

- `frontend-developer` - React feature UI, page/component behavior, CSS fixes, layout bugs, and client-side state work.
- `react-specialist` - Component architecture, hooks, rendering bugs, state flow, and React-specific refactors.
- `ui-designer` - Product UI direction, visual hierarchy, interaction design, and implementation-ready design decisions.
- `ui-fixer` - Small reproduced UI issues where the smallest safe patch is needed.
- `accessibility-tester` - Keyboard flow, semantic HTML, focus states, contrast, labels, dialogs, and Storybook a11y checks.
- `fullstack-developer` - Work spanning React UI, Supabase data access, migrations, scripts, or edge functions.
- `backend-developer` - Supabase-facing logic, catalog scripts, ingestion flows, server-side data shaping, and edge functions.
- `database-optimizer` - Query patterns, indexes, catalog access performance, and Supabase data-access hot paths.
- `postgres-pro` - PostgreSQL migrations, RLS-related SQL, views, constraints, and schema behavior.
- `api-designer` - Supabase/edge-function request and response contracts, error shape, and version-safe endpoint changes.
- `debugger` - Broken flows, failing tests, runtime errors, inconsistent data behavior, and root-cause work.
- `test-automator` - Vitest, Playwright, Storybook, and regression test implementation.
- `code-reviewer` - Broader correctness, maintainability, design clarity, and risky implementation review.
- `reviewer` - Lightweight PR-style correctness and regression review after implementation.
- `security-auditor` - Auth, RLS, admin gates, secrets, Supabase policies, and unsafe client exposure.
- `performance-engineer` - Slow discovery/search, large render lists, catalog queries, bundle size, and runtime hot paths.
- `dependency-manager` - Dependency upgrades, package graph cleanup, and third-party library risk.
- `documentation-engineer` - README, system guide, setup notes, commands, and operator docs.
- `search-specialist` - Fast codebase lookup when locating ownership, feature paths, or related tests.

## Local Skill Guidance

This repo contains legacy Impeccable-style local skills in both:

- `.agents/skills`
- `.agent/skills`

Prefer `.agents/skills` as the canonical local skill copy. Treat `.agent/skills` as a legacy duplicate unless a file exists only there.

These skills are optional local references, not replacements for the global `.codex\agents` `.toml` roles. To keep context small, do not preload every local skill. Open a specific `SKILL.md` only when the task directly needs it or the user names it.

- Main UI design work: `frontend-design`
- UI review: `audit` or `critique`
- Small visual refinement: `polish`, `normalize`, or `harden`
- Motion or visual tone: `animate`, `colorize`, `bolder`, or `quieter`
- UX copy, onboarding, or simplification: `clarify`, `onboard`, or `distill`
- Other local skills under `.agents/skills` are available on demand.

## UI Rules

- Start with existing shared primitives in `src/shared/components/ui` and layout components in `src/shared/components/layout`.
- Preserve established feature organization under `src/features/<feature>`.
- Use `lucide-react` icons where icons are needed.
- Keep forms accessible: labels, hints, validation errors, disabled states, loading states, and success states.
- For cards, lists, modals, and admin panels, cover loading, empty, error, and dense-content states when the changed surface needs them.
- Keep text readable on mobile and desktop; do not let labels overflow buttons or cards.
- Do not create one-off styling tokens when existing CSS variables, shared CSS, or local component patterns fit.
- Avoid nested cards and marketing-style hero sections for functional app screens.
- For major visual work, verify desktop and mobile views with browser checks or screenshots when practical.

## Data And Supabase Rules

- Keep Supabase access centralized through existing helpers and feature libraries where possible.
- Do not expose service role keys or admin-only secrets to client code.
- For migrations, prefer additive and reversible changes when practical.
- Check RLS and admin access assumptions before changing auth-sensitive flows.
- Catalog ingestion scripts should be idempotent where possible and log enough context for failed records.
- Avoid broad schema changes unless the requested work truly requires them.

## Testing Policy

- UI-only visual tweak: run `npm run build` or targeted Storybook/browser check when practical.
- Shared helper or business logic change: run targeted Vitest tests plus `npm run test:unit` if blast radius is unclear.
- Routing, auth, admin, or Supabase flow change: run targeted unit checks and consider Playwright or manual browser verification.
- Catalog ingestion/script change: run the relevant script in a safe dry-run/test mode if one exists; otherwise document what could not be verified.
- Before finishing, state exactly which checks ran and which were skipped.

## Final Response Checklist

Include only what matters:

- What changed.
- Files changed.
- Tests/checks run and result.
- Anything not completed and why.
- Useful next step only when there is a real follow-up.
