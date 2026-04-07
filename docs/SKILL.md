# SKILL.md
# Enterprise Project Structure & Refactoring Guide for AI

This document defines how to work inside a codebase that aims for **enterprise-grade maintainability**.
Use it when creating new modules, refactoring existing code, or reviewing architecture.

---

## 1. Primary Goal

Optimize for:

- clear ownership
- maintainability
- scalability
- testability
- safe refactoring
- predictable structure across teams

Do **not** optimize only for short-term speed.
A good change should make the codebase easier to understand after you leave.

---

## 2. Core Principles

### 2.1 Organize by feature first
Prefer grouping by **business capability** rather than by file type only.

Good:
```text
src/
  features/
    auth/
    booking/
    users/
```

Avoid as the main structure in large apps:
```text
src/
  components/
  hooks/
  pages/
  utils/
  services/
```

Why:
- feature ownership is clearer
- easier to scale with multiple teams
- easier to refactor without cross-project sprawl

---

### 2.2 Keep clear boundaries
Each layer and module should have a clear responsibility.

Examples:
- UI components should not contain heavy business rules
- pages should not directly perform raw API orchestration everywhere
- shared code must stay generic
- one feature should not tightly couple itself to internals of another feature

---

### 2.3 Prefer predictable patterns over clever patterns
Use conventions that are easy for other developers and other AIs to follow.

Prefer:
- consistent naming
- standard folder patterns
- small reusable units
- explicit imports
- obvious data flow

Avoid:
- hidden magic
- over-abstracted helpers with unclear intent
- utility dumping grounds
- giant files with many unrelated responsibilities

---

### 2.4 Refactor toward stability, not novelty
When refactoring:
- preserve behavior unless change is explicitly requested
- improve structure without changing business outcome
- reduce duplication carefully
- do not invent architecture that the rest of the codebase cannot sustain

---

## 3. Recommended High-Level Structure

Use this as the default for enterprise frontend applications.

```text
src/
  app/
    App.tsx
    main.tsx
    router.tsx
    providers/

  config/
    env.ts
    appConfig.ts

  features/
    auth/
      api/
      components/
      hooks/
      pages/
      schemas/
      services/
      store/
      types/

    users/
      api/
      components/
      hooks/
      pages/
      services/
      store/
      types/

    booking/
      api/
      components/
      hooks/
      pages/
      schemas/
      services/
      store/
      types/

    dashboard/
      components/
      pages/
      widgets/

  shared/
    components/
      ui/
      layout/
    hooks/
    utils/
    lib/
    constants/
    types/

  domain/
    entities/
    rules/
    policies/

  infrastructure/
    api/
      httpClient.ts
      interceptors.ts
    storage/
    logger/
    analytics/

  assets/
  styles/
  tests/
```

---

## 4. Responsibility of Each Top-Level Folder

### 4.1 `app/`
Contains application entry and assembly logic.

Typical contents:
- app bootstrap
- root providers
- app router
- top-level app shell

Do:
- wire the app together
- initialize global providers
- configure routes and app startup behavior

Do not:
- place feature-specific business logic here
- turn `app/` into a miscellaneous folder

---

### 4.2 `config/`
Contains centralized application configuration.

Typical contents:
- environment mapping
- app constants
- runtime flags
- feature flags

Do:
- keep environment access centralized
- expose typed config helpers where possible

Do not:
- scatter direct `process.env` or runtime config lookups across the whole app

---

### 4.3 `features/`
Contains business capabilities.

Each feature should be mostly self-contained.

Example:
```text
features/
  auth/
    api/
    components/
    hooks/
    pages/
    schemas/
    services/
    store/
    types/
```

Use `features/` for:
- auth
- booking
- payments
- dashboards
- notifications
- orders
- reports

Do:
- colocate code that changes together
- keep feature internals inside the feature
- expose a clean public surface if needed

Do not:
- leak feature internals everywhere
- import deep private files from other features unless absolutely necessary

---

### 4.4 `shared/`
Contains reusable code used by multiple features.

Typical contents:
- generic UI primitives
- common hooks
- common utility functions
- framework-agnostic helpers
- constants shared across modules

Good examples:
- `Button`
- `Modal`
- `formatDate`
- `useDebounce`

Bad examples:
- `AuthBookingHelper`
- `SpecialDashboardPaymentModal`
- business-specific logic masquerading as shared code

Rule:
If it is not truly generic, it does not belong in `shared/`.

---

### 4.5 `domain/`
Contains business concepts and rules that should not depend on view details.

Typical contents:
- entities
- rules
- permissions
- policies
- validation logic that represents business truth

Examples:
- booking eligibility rule
- role permission matrix
- order state transition rule

Do:
- move durable business logic here when the system is complex enough

Do not:
- force a heavy domain layer into a tiny app that does not need it

---

### 4.6 `infrastructure/`
Contains integration with external systems and technical infrastructure.

Typical contents:
- API clients
- HTTP interceptors
- storage adapters
- logger
- analytics
- websocket setup

Do:
- isolate external concerns here
- centralize reusable infrastructure code

Do not:
- spread raw fetch/axios setup throughout the app

---

## 5. Standard Internal Structure for a Feature

Default internal structure:

```text
feature-name/
  api/
  components/
  hooks/
  pages/
  schemas/
  services/
  store/
  types/
```

### 5.1 `api/`
Network-facing calls for that feature.

Examples:
- `login.ts`
- `getUsers.ts`
- `createBooking.ts`

Use for:
- request functions
- endpoint definitions
- response normalization when appropriate

Avoid:
- mixing API concerns directly into JSX files

---

### 5.2 `components/`
UI pieces specific to the feature.

Examples:
- `LoginForm.tsx`
- `BookingCard.tsx`
- `UserTable.tsx`

Use for:
- reusable pieces inside the feature
- visual composition

Avoid:
- giant page components that contain all logic inline

---

### 5.3 `hooks/`
Feature-specific hooks.

Examples:
- `useLogin.ts`
- `useBookingFilters.ts`
- `useUserSearch.ts`

Use for:
- extracting reusable stateful logic
- separating stateful UI logic from presentational components

Avoid:
- moving unrelated code into hooks just to “hide complexity”

---

### 5.4 `pages/`
Route-level containers for the feature.

Use for:
- composing page sections
- connecting feature pieces
- handling route-level layout and orchestration

Avoid:
- burying the whole business system in a single page file

---

### 5.5 `schemas/`
Validation schemas and data contracts used by the feature.

Examples:
- zod/yup schemas
- form validation rules
- request body validation maps

---

### 5.6 `services/`
Use for business/application services that coordinate multiple operations.

Examples:
- orchestrating API + transform + local cache update
- mapping server data to domain view models

Avoid:
- creating meaningless service layers with one-line wrappers everywhere

---

### 5.7 `store/`
Feature-scoped state management.

Examples:
- Zustand stores
- Redux slices
- local feature state models

Prefer feature-local state over unnecessary global state.

---

### 5.8 `types/`
Type declarations specific to the feature.

Examples:
- DTOs
- view models
- request/response types
- local type helpers

Avoid:
- creating a huge global `types.ts` for everything in the app

---

## 6. Naming Rules

Use one naming system consistently.

Recommended names:
- `pages`
- `components`
- `hooks`
- `services`
- `schemas`
- `types`
- `store`
- `api`

Prefer:
- `LoginPage.tsx`
- `LoginForm.tsx`
- `useLogin.ts`
- `login.schema.ts`
- `auth.types.ts`

Avoid inconsistent naming like:
- `views` in one feature
- `screens` in another
- `helpers`, `common`, `misc`, `temp`, `new2`, `finalFinal`

File and folder names should communicate intent immediately.

---

## 7. Rules for Shared Code

Before moving something into `shared/`, ask:

1. Is it used by multiple features now?
2. Is it likely to be reused soon?
3. Is it generic enough to stand on its own?
4. Does it avoid business-specific assumptions?

Only move it if the answer is mostly yes.

Bad pattern:
```text
shared/utils/misc.ts
shared/helpers/common.ts
shared/temp/
```

These become junk drawers.

Prefer specific names:
- `shared/utils/formatCurrency.ts`
- `shared/hooks/useDebounce.ts`
- `shared/components/ui/Button.tsx`

---

## 8. Refactoring Rules for AI

When refactoring, follow this sequence.

### 8.1 First identify the current structure
Before changing anything, determine:
- what the file is responsible for
- what dependencies it has
- which parts are UI
- which parts are business logic
- which parts are infrastructure
- which parts are duplicated or leaking across boundaries

---

### 8.2 Refactor in safe slices
Prefer small structural improvements:

- extract reusable UI from pages into feature components
- move API calls out of page/component bodies
- move feature-specific hooks into `hooks/`
- move validation into `schemas/`
- move true shared primitives into `shared/`

Do not:
- rewrite the entire app because one file looks messy
- merge structural refactor with behavior change unless requested

---

### 8.3 Preserve public behavior
After refactor:
- same routes should work
- same user flow should work
- same side effects should happen unless intentionally changed

If behavior must change, state it clearly.

---

### 8.4 Reduce file size and mixed responsibility
As a default warning sign:
- very large files
- pages doing network calls + transformation + form validation + rendering + business rules all together
- components with multiple unrelated sections and hidden side effects

Refactor by separating concerns, not by blindly splitting every file.

---

### 8.5 Avoid fake abstraction
Do not create abstractions unless they simplify reasoning.

Bad:
- wrappers with no value
- generic utilities that are harder to read than inline logic
- premature architecture layers

Good:
- extracted logic with clear reuse or clearer ownership
- explicit service for meaningful orchestration
- component extraction that improves readability

---

### 8.6 When Refactor May Change Implementation Style
A refactor may change implementation style if public behavior stays the same and the result is easier to maintain.

Allowed examples:
- inline logic -> extracted hook
- repeated transform -> pure utility or service
- deeply nested conditionals -> clearer guard clauses
- mixed page logic -> feature-level orchestration and smaller components
- repeated side effects -> dedicated service or infrastructure boundary

Do not:
- rewrite entire modules only to match personal preference
- introduce a new coding style that conflicts with the surrounding feature
- mix style migration with business behavior changes unless requested
- replace explicit code with abstraction if it becomes harder to read

---

### 8.7 Encoding Safety During Refactor
Before and after editing files, verify that encoding remains correct and text content is not corrupted.

Always:
- preserve UTF-8 encoding unless the file clearly uses a different encoding
- check for garbled characters after refactor, especially in Thai, comments, labels, and copied text
- avoid tools or scripts that silently rewrite encoding across many files
- keep line endings consistent with the existing file unless a full normalization is requested

If encoding problems appear:
- stop the refactor
- restore the file content safely
- fix the encoding issue before continuing structural changes

---

## 9. When a File Is Too Large

A file likely needs refactoring when it has one or more of these signals:

- more than one major responsibility
- many unrelated imports
- mixed UI and domain logic
- many inline handlers and effects
- difficult navigation
- repeated UI sections
- repeated transformation logic
- hard-to-test behavior

Typical action plan:
1. identify page-level orchestration
2. extract repeated UI to `components/`
3. extract stateful logic to `hooks/`
4. extract API calls to `api/`
5. extract business transforms to `services/` or `domain/`
6. extract validation to `schemas/`

---

## 10. Decision Rules: Where Should Code Go?

### Put code in `shared/` if:
- it is generic
- it is reusable across features
- it has no business-specific knowledge

### Put code in `features/<name>/components` if:
- it is UI for one feature
- it may be reused inside that feature only

### Put code in `features/<name>/hooks` if:
- it is stateful logic reused in that feature
- it improves component readability

### Put code in `features/<name>/api` if:
- it performs remote requests for that feature

### Put code in `domain/` if:
- it represents core business rules
- it should survive UI rewrites

### Put code in `infrastructure/` if:
- it integrates with external systems or app-wide technical plumbing

---

## 11. Recommended Import Direction

Prefer this dependency direction:

```text
app -> features -> shared
app -> infrastructure
features -> shared
features -> domain
features -> infrastructure
domain -> (ideally minimal or no UI dependency)
shared -> no feature dependency
```

Avoid:
- shared importing feature code
- random circular imports between features
- app-level files depending on feature internals in fragile ways

---

## 12. State Management Guidance

Prefer state closest to where it is used.

Use:
- local component state for local UI interactions
- feature store for feature-level shared state
- global store only for truly cross-app concerns

Examples of global-worthy state:
- authenticated user
- theme
- app-wide session state
- global notifications

Avoid turning every piece of state into global state.

---

## 13. Testing Expectations

A well-structured enterprise project should support:

- unit tests for utilities, rules, and pure business logic
- integration tests for feature flows
- e2e tests for critical user journeys

Suggested structure:
```text
tests/
  unit/
  integration/
  e2e/
```

Or colocated tests where appropriate:
```text
features/
  auth/
    __tests__/
```

Refactor with testability in mind:
- smaller pure functions
- clearer module boundaries
- fewer hidden side effects

---

## 14. Review Checklist for AI

Before finishing a refactor, verify:

- Is the code organized by feature where appropriate?
- Is shared code truly shared and generic?
- Did I reduce mixed responsibility?
- Did I keep naming consistent?
- Did I avoid creating junk-drawer helpers?
- Did I preserve behavior unless asked otherwise?
- Did I improve readability for the next developer?
- Did I avoid unnecessary abstraction?
- Did I keep imports and dependencies clean?
- Is the new structure easier to extend?

---

## 15. Anti-Patterns to Avoid

Avoid these in enterprise projects:

### 15.1 Mega-files
A single file with:
- page UI
- API calls
- validation
- business rules
- state management
- helper functions
- modal definitions

### 15.2 Junk-drawer folders
Examples:
- `utils/common.ts`
- `helpers/misc.ts`
- `shared/temp/`

### 15.3 Deep cross-feature coupling
One feature importing private internals from another feature everywhere.

### 15.4 Unclear naming
Mixed terms like:
- page / view / screen
- helper / util / common / misc
without any convention

### 15.5 Premature architecture
Adding complex domain-driven layers that the team will not maintain.

### 15.6 Refactor that changes behavior accidentally
A structure improvement should not break user flows.

---

## 16. Suggested Refactor Workflow for AI

Use this workflow when asked to “make it more enterprise” or “refactor structure”.

### Step 1: Inspect
- identify current module boundaries
- identify largest files
- identify mixed responsibilities
- identify duplicate patterns

### Step 2: Group by feature
- move related files under a business feature
- reduce type-based sprawl

### Step 3: Extract responsibilities
- UI -> `components/`
- route containers -> `pages/`
- stateful logic -> `hooks/`
- validation -> `schemas/`
- API calls -> `api/`
- orchestration -> `services/`
- durable rules -> `domain/`

### Step 4: Normalize naming
- apply one naming convention
- rename vague folders/files

### Step 5: Clean dependencies
- reduce circular imports
- prevent shared from depending on feature internals

### Step 6: Verify behavior
- ensure features still work as before unless change requested

---

## 17. Default Recommendation

If no other architecture is specified, use:

- feature-first structure
- generic shared layer
- optional domain layer for real business complexity
- centralized infrastructure and config
- consistent naming everywhere
- small, safe, behavior-preserving refactors

---

## 18. Ongoing Implementation Conventions

For new code and updated code:

- prefer small focused functions over large multi-purpose blocks
- prefer explicit names over short clever names
- keep JSX focused on rendering, not business transformation
- keep remote calls in `api/` or dedicated services
- keep reusable stateful logic in hooks
- prefer pure functions for transformation and rule evaluation
- follow the dominant style of the existing feature unless the team requests a migration
- refactor toward consistency inside the feature before introducing wider architectural change
- preserve encoding and line ending conventions of the file being edited
- check file encoding after edits when touching user-facing copy, localized text, or migrated files

---

## 19. Short Rule Summary

When working on this codebase:

- organize by feature
- keep boundaries clear
- keep shared truly generic
- move business logic out of large UI files
- centralize infrastructure and config
- refactor safely in small slices
- prefer clarity over cleverness
- preserve behavior unless asked to change it

---

## 20. AI Instruction Summary

When asked to create, improve, or refactor project structure:

1. think in features first
2. identify responsibilities before moving files
3. separate UI, business logic, and infrastructure
4. avoid junk-drawer shared code
5. keep naming consistent
6. reduce file size by responsibility, not randomly
7. preserve behavior
8. check encoding before and after file edits
9. make the codebase easier for the next team member to extend

End of file.
