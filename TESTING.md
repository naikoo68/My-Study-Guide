# Testing

My Study Guide is a monorepo with independently-tested parts. Both the
**backend** and the **frontend** use [Vitest](https://vitest.dev). This document
explains how the suites are organised and how to run them.

## Quick start

```bash
# Backend (unit + integration; integration spins up an in-memory MongoDB)
cd backend && npm install --legacy-peer-deps && npm test

# Frontend (unit tests for the pure helpers)
cd frontend && npm install && npm test
```

Both suites also run in CI on every push and pull request to `main`
(see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Backend tests and
frontend tests are **hard gates** — a failure blocks the merge/deploy.

## Backend

- **Runner:** Vitest (`backend/vitest.config.js`), Node environment.
- **Location:** `backend/tests/`
- **Command:** `npm test` (alias for `vitest run`)

Two kinds of tests live here:

### Integration / security tests (`backend/tests/*.test.js`)
These use [`mongodb-memory-server`](https://github.com/nodkz/mongodb-memory-server)
to boot a real, throwaway MongoDB and exercise the actual Mongoose models,
multi-tenancy plugin and controllers. They guard the most safety-critical
behaviour — **tenant isolation** and content-sharing boundaries — so a
regression that could leak one customer's data into another's is caught before
deploy. They run serially (`fileParallelism: false`) because they share a single
Mongo connection.

### Unit tests (`backend/tests/unit/*.test.js`)
Fast, dependency-free tests for the pure logic in `src/utils/`:

| File | Covers |
|------|--------|
| `naturalSort.test.js` | numeric-aware ordering (`Quiz 2` before `Quiz 10`) |
| `passwordPolicy.test.js` | password rules, weak-password rejection, generator |
| `questionTypes.test.js` | type normalisation, grouping, unique naming |
| `conceptDedupe.test.js` | name normalisation, exact-dedupe, truncated-JSON salvage |
| `urlGuard.test.js` | SSRF guard — blocks private/loopback/metadata targets |
| `keyCrypto.test.js` | AES-256-GCM encrypt/decrypt round-trip + fingerprints |
| `accessControl.test.js` | test visibility, sharing and subscription checks |

## Frontend

- **Runner:** Vitest (`frontend/vitest.config.js`), Node environment (no jsdom —
  the tested helpers are pure).
- **Location:** `frontend/src/lib/*.test.js` (tests sit next to the code).
- **Command:** `npm test` (alias for `vitest run`)

| File | Covers |
|------|--------|
| `shuffleOptions.test.js` | deterministic seeded shuffling + invertible index mappers |
| `questions.test.js` | display options, dates from ObjectIds, search scoring, filters |
| `features.test.js` | admin & public feature-flag resolution incl. legacy fallback |
| `slug.test.js` | URL slug generation |

## Conventions

- **Prefer pure functions.** Logic extracted into `src/utils/` (backend) or
  `src/lib/` (frontend) is easy to test without a DB or a browser — add a
  matching `*.test.js` when you add one.
- **Keep tests deterministic.** Seed any randomness (e.g. the shuffle seed) and
  avoid depending on wall-clock time except through injected/relative values.
- **Name tests by behaviour**, not by implementation, so they read as living
  documentation of what each helper guarantees.
