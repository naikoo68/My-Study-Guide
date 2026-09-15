# My Study Guide

A modern, responsive, **full-stack** educational platform for **quizzes and test-series preparation**.
Blue/white/orange theme, dark + light mode, smooth animations, charts, dashboards and a full admin panel.

```
.
├── frontend/      # React + Vite + Tailwind CSS (UI for all modules)
├── backend/       # Node.js + Express + MongoDB REST API (JWT auth, Cloudinary)
└── DEPLOYMENT.md  # Step-by-step guide to publish the full app online
```

> **Real mode is wired up:** the frontend talks to the backend API for real login/registration
> (JWT), database-backed subjects, sessions, questions, quiz attempts, test grading, dashboard
> analytics, leaderboard, and the admin panel. Set `VITE_API_URL` in the frontend and run the
> backend with a MongoDB connection. See **[DEPLOYMENT.md](DEPLOYMENT.md)** to go live.

## 🚀 Run locally (real mode)

```bash
# 1) Backend  (needs a MongoDB connection string)
cd backend
npm install
cp .env.example .env          # set MONGO_URI and JWT_SECRET
npm run seed                  # sample data + admin (SEED_DEMO=true also adds demo logins)
npm run dev                   # http://localhost:5000

# 2) Frontend  (in a second terminal)
cd frontend
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:5000/api
npm run dev                   # http://localhost:5173
```

**Seeded logins.** The admin account uses your `ADMIN_EMAIL` / `ADMIN_PASSWORD`
from `.env`. If `ADMIN_PASSWORD` is missing or weak, the seed generates a random
one-time password (printed in the server logs) and forces a change on first
login — there is **no fixed default admin password**.
Demo/sample accounts (e.g. `student@mystudyguide.com / student123`) are seeded
**only in development or when `SEED_DEMO=true`** — never in a default production
run — so no guessable logins end up in a live database.

## ✨ Features

**Public site**
- Landing page — hero ("Prepare Smart, Achieve More."), features, stats, footer with social links
- Quiz module — 12 subjects → chapter sessions → interactive quiz player
  - One question at a time, correct option turns **green**, wrong turns **red** (correct auto-revealed)
  - Timer, question palette, bookmark, explanation, progress bar, auto-save, submit
  - Result page — score, %, time, rank, performance charts, weak-topic analysis, answer review
- About & Contact pages

**Auth**
- Login, Register (with email-verification step), Forgot Password, Google login button

**Student Dashboard** (auth required)
- Profile, enrolled series, upcoming/completed tests, recent scores, analytics charts, leaderboard, notifications

**Test Series** (login to start)
- Full-length / subject-wise / chapter-wise / previous-year tabs
- Full-screen test interface — countdown with auto-submit, palette with statuses, mark-for-review, save & next

**Admin Panel** (role-based)
- Dashboard analytics (revenue, attempts, subscriptions)
- Content management (subjects, sessions, questions) with CRUD, bulk CSV upload, image upload
- Test-series management (create, schedule, publish/unpublish)
- User management (view, block/unblock, plans, reset password)
- Customization (logo, theme colours, banners, notifications, announcements)

## 🚀 Run the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The frontend talks to the backend API (set `VITE_API_URL`). Authentication is real — accounts are created and validated against the API, and a signed JWT is issued on login.

**Try it (with the backend running):**
- Student / Client: register at `/register`, verify the emailed OTP, then log in at `/login`.
- Admin: sign in at `/admin/login` using the admin account created during backend setup (see below).

## 🔌 Run the backend (optional, for real data)

```bash
cd backend
npm install
cp .env.example .env     # fill MONGO_URI, JWT_SECRET, Cloudinary keys
npm run seed             # sample content (admin login uses ADMIN_PASSWORD from .env)
npm run dev              # http://localhost:5000
```

See [`backend/README.md`](backend/README.md) for the full API reference.

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind CSS, React Router, Chart.js, lucide-react |
| Backend | Node.js, Express, MongoDB (Mongoose), JWT, bcrypt, Cloudinary, Multer |
| Cross-cutting | Dark/light mode, responsive design, SEO meta tags, role-based auth |

## ✅ Testing

Both the frontend and backend are covered by automated tests ([Vitest](https://vitest.dev)),
and they run in CI on every push and pull request to `main`.

```bash
# Backend — unit tests + tenant-isolation/security integration tests
cd backend && npm test

# Frontend — unit tests for the pure helpers in src/lib
cd frontend && npm test
```

See **[TESTING.md](TESTING.md)** for how the suites are organised and
**[CONTRIBUTING.md](CONTRIBUTING.md)** for the local setup and the checks a PR
must pass.

## 🔗 Connecting frontend to backend

The frontend talks to the backend through a small API layer (`src/lib/api.js`) using the base URL in `VITE_API_URL` (e.g. `http://localhost:5000/api`). Authentication is real: the JWT returned by the API is stored and sent as a Bearer token on later requests. A few `src/data/*` files remain only as default/fallback content.
