# Complexity & Churn Audit

A snapshot of the codebase's largest and most-frequently-changed modules, with
prioritized, low-risk refactoring recommendations. The goal is to lower
**churn × complexity** — files that are both large and edited often are the
riskiest to change and the most expensive to maintain.

> This is an audit, not a set of applied changes. Each recommendation is
> intentionally incremental so it can be done safely, ideally behind the test
> suites added in [TESTING.md](../TESTING.md).

## How this was measured

- **Size:** lines per file (`git ls-files '*.js' '*.jsx' | xargs wc -l`).
- **Churn:** number of commits that touched each file
  (`git log --pretty=format: --name-only | sort | uniq -c | sort -rn`).

## Hotspots (size × churn)

| File | Lines | Commits | Notes |
|------|------:|--------:|-------|
| `backend/src/controllers/aiController.js` | 5,689 | 248 | **Top priority.** ~44 exported handlers in one file; by far the most-churned file in the repo. |
| `frontend/src/services/index.js` | — | 161 | Single API-client barrel touched on nearly every feature; a natural split point. |
| `frontend/src/pages/admin/AdminContent.jsx` | 2,361 | 127 | Large admin page mixing data-fetching, state and presentation. |
| `frontend/src/pages/admin/AdminPractice.jsx` | 2,061 | 130 | Same pattern as AdminContent. |
| `backend/src/controllers/practiceController.js` | 1,833 | 65 | Many handlers; extractable pure helpers. |
| `frontend/src/components/admin/AiGenerate.jsx` | 1,600 | 81 | Large component; candidate for hook/subcomponent extraction. |
| `backend/src/controllers/contentController.js` | 1,302 | 55 | Extractable validation/shaping helpers. |
| `frontend/src/viz/assets/anatomy.jsx` | 5,121 | low | Large but mostly static SVG/data — **low churn, low priority** (size alone isn't a problem). |

## Recommendations (highest ROI first)

### 1. Split `aiController.js` by concern (biggest win)
A 5,689-line, 248-commit controller is the single largest maintainability and
merge-conflict risk in the repo. Recommended, incremental approach:

1. **Extract pure helpers first** (prompt building, response parsing/repair,
   provider selection, token accounting) into `src/utils/ai/*.js`. These are the
   easiest to move and to cover with unit tests — mirroring what was already done
   for `conceptDedupe.salvageObjects` and `urlGuard`.
2. **Group the ~44 handlers into cohesive modules** by feature area (e.g.
   `aiGenerateController.js`, `aiImportController.js`, `aiKeysController.js`,
   `aiProvidersController.js`), keeping route wiring unchanged.
3. Keep `aiController.js` as a thin re-export barrel during the transition so
   routes don't have to change in the same PR (reduces blast radius).
4. Add unit tests for each extracted helper as it moves out.

### 2. Extract data-fetching from the big admin pages
`AdminContent.jsx`, `AdminPractice.jsx`, `AdminTests.jsx` mix API calls, local
state and rendering in 1,000–2,400-line components. Extract custom hooks
(`useAdminContent`, `useAdminPractice`, …) for the data/state, leaving the
component focused on presentation. This shrinks the churny surface and makes the
logic testable.

### 3. Break up `frontend/src/services/index.js`
It's touched on almost every feature (161 commits) because it's a single barrel
for all API calls. Split it into domain modules (`services/auth.js`,
`services/content.js`, `services/practice.js`, …) and re-export from `index.js`.
This cuts cross-feature merge conflicts without changing import sites.

### 4. Continue the "pure helper + test" pattern
The lowest-risk way to reduce complexity over time is to keep pulling pure logic
out of controllers/components into `backend/src/utils/` and `frontend/src/lib/`,
each with a matching `*.test.js`. Pure, tested units are cheap to change and
don't inflate the churn of the large files.

## What NOT to do

- **Don't rewrite `anatomy.jsx`** — it's large but static and rarely changes, so
  it carries little churn risk. Size alone is not the target.
- **Don't do a big-bang refactor of `aiController.js`** without tests in place
  first — extract-then-test in small PRs to avoid regressions in a critical,
  high-traffic path.
