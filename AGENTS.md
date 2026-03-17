# AGENTS.md

## UI implementation rules
- Always use existing design system components before creating new ones.
- Prefer composition over custom CSS.
- Match spacing, radius, shadows, and typography tokens from the project.
- Default to mobile-first and support responsive layouts.
- Preserve semantic HTML and keyboard accessibility.
- For forms, always include label, hint, error, disabled, loading, and success states.
- For lists/tables/cards, include empty, loading, error, and dense-content states.
- Do not invent colors or one-off components unless explicitly requested.

## Workflow
1. Inspect existing UI patterns in `src/components` and Storybook first.
2. Reuse tokens and primitives from the design system.
3. If a Figma link is provided, implement from Figma context.
4. Run Storybook or app locally to verify layout.
5. Use browser tooling to check obvious overflow, alignment, and interaction issues.
6. Summarize what changed and what still needs manual design review.

## Frontend stack preferences
- React + TypeScript
- Tailwind only through existing tokens/utilities
- Avoid inline styles unless unavoidable
- Prefer accessible primitives already in the repo
