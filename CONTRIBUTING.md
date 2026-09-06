# Contributing to My Study Guide

Thanks for taking the time to contribute! This guide covers the local setup,
the project layout, and the checks your change needs to pass.

## Project layout

This is a monorepo with three independent parts:

| Path | What it is |
|------|------------|
| `frontend/` | React 19 + Vite 8 single-page app (see [`frontend/README.md`](frontend/README.md)) |
| `backend/` | Node.js + Express REST API (see [`backend/README.md`](backend/README.md)) |
| `extension/` | Manifest V3 Chrome companion extension (see [`extension/README.md`](extension/README.md)) |

## Local setup

```bash
# Backend
cd backend
npm install --legacy-peer-deps   # see note below
cp .env.example .env             # set MONGO_URI and JWT_SECRET
npm run seed                     # optional sample data
npm run dev                      # http://localhost:5000

# Frontend (second terminal)
cd frontend
npm install
cp .env.example .env             # VITE_API_URL=http://localhost:5000/api
npm run dev                      # http://localhost:5173
```

> **Why `--legacy-peer-deps` for the backend?** The AWS SDK v3 DynamoDB packages
> are released in lockstep with strict peer ranges; a plain install can hit a
> transient `ERESOLVE`. Skipping strict peer resolution keeps installs reliable.

## Before you open a pull request

Run the checks for each part you touched. They mirror what
[CI](.github/workflows/ci.yml) enforces on `main`.

**Backend**

```bash
cd backend
npm test          # unit + tenant-isolation/security tests (hard gate in CI)
```

**Frontend**

```bash
cd frontend
npm run lint      # advisory in CI
npm test          # unit tests (hard gate in CI)
npm run build     # must succeed (hard gate in CI)
```

See [TESTING.md](TESTING.md) for how the suites are organised.

## Coding conventions

- **ES modules everywhere** (`"type": "module"`). Use `import`/`export`.
- **Extract logic into pure functions** — put reusable/testable logic in
  `backend/src/utils/` or `frontend/src/lib/`, and add a matching `*.test.js`.
  Pure functions keep tests fast (no DB/browser) and code easy to reason about.
- **Explain the "why" in comments**, not the "what". Non-obvious decisions
  (security guards, deterministic seeding, legacy fallbacks) deserve a short note.
- **Never weaken tenant isolation.** Multi-tenant data separation is a hard
  security boundary — if your change touches queries or sharing, keep the
  isolation tests green and add new ones for new paths.

## Commit & PR guidelines

- Keep commits focused and write a clear, imperative subject line
  (e.g. `Add SSRF guard unit tests`).
- Describe *what* changed and *why* in the PR body; link any related issue.
- Make sure the relevant test suites pass locally before requesting review.
