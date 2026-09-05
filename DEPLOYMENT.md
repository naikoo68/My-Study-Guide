# Deploying My Study Guide (Real Mode)

This guide publishes the **full application**: a live backend API + database, and
the frontend connected to it. You'll deploy three things:

1. **Database** → a MongoDB-compatible database (MongoDB Atlas *or* Oracle Autonomous DB)
2. **Backend API** → a server you control (an Oracle Cloud VM with Docker + Nginx)
3. **Frontend** → a static host (Cloudflare Pages)

Do them in this order.

---

## 1. Database

Pick one (the app switches drivers via the `DB_ENGINE` env var):

- **MongoDB Atlas** (`DB_ENGINE=mongo`): create a free **M0** cluster, add a DB
  user, allow network access, and copy the connection string into `MONGO_URI`.
- **Oracle Autonomous DB, MongoDB API** (`DB_ENGINE=oracle`): use the MongoDB-API
  connection string as `ORACLE_MONGO_URI`. Since the DB and the backend VM live in
  the same cloud, backend↔DB traffic stays fast and internal.

A connection string looks like:
```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/mystudyguide?retryWrites=true&w=majority
```

---

## 2. Backend API — Oracle Cloud VM (Docker + Nginx)

The backend is a standard Node/Express app shipped as a Docker image, run on an
always-on VM behind Nginx with HTTPS. **Full step-by-step is in
[`backend/HOSTING.md`](./backend/HOSTING.md)** — in short:

1. On the VM: install Docker, clone the repo, `docker build -t msg-backend backend/`.
2. Create `backend/msg.env` from [`backend/msg.env.example`](./backend/msg.env.example)
   (DB connection, `JWT_SECRET`, `CLIENT_URL`, `TENANT_ENFORCEMENT=on`, etc.).
3. Run it: `docker run -d --name msg-backend --restart always --env-file msg.env -p 127.0.0.1:5000:5000 msg-backend`.
4. Put **Nginx + a free Let's Encrypt certificate** in front so it's served over
   HTTPS at your API domain, e.g. `https://api.mystudyguide.in`.

Test it: open `https://api.mystudyguide.in/api/health` → should show
`{"status":"ok","db":"connected",...}`.

### Seed the database (one time)
On the VM (or any machine with the env vars set):
```bash
npm run seed
```
This creates sample data + the accounts:
- Admin: `admin@mystudyguide.com` / `admin123`
- Student: `student@mystudyguide.com` / `student123`

> ⚠️ Change the admin password after first login in production.

---

## 3. Frontend — Cloudflare Pages

1. Connect the repo to **Cloudflare Pages** and set the project root to `frontend`
   (framework preset: **Vite**; build command `npm run build`; output `dist`).
2. Add a build-time **environment variable**:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://api.mystudyguide.in/api` |

3. Deploy. You'll get a `*.pages.dev` URL; then attach your custom domain
   (e.g. `www.mystudyguide.in`) in the Pages project.

### Routing
`frontend/public/_redirects` handles routing on Cloudflare Pages: it forwards
`/s/*` and `/sitemap.xml` to the backend API and falls the rest back to the SPA.

### Final step — connect CORS
Set the backend's `CLIENT_URL` to your exact frontend origin, then restart the
backend container. This allows the browser to call the API.

---

## You're live! 🎉

- Visit your frontend domain.
- Log in as the seeded student or admin, or register a new account.
- Quizzes, test series, dashboard analytics, leaderboard and the admin panel now
  read/write the real database.

## Notes & tips

- The backend container runs with `--restart always`, so it stays up across
  reboots and does **not** cold-start on the first request.
- **Image uploads (Cloudinary)** and **Google login** are optional. To enable them,
  add the matching keys from `backend/.env.example` to the backend env.
- **Local development:** run the backend (`npm run dev` in `backend`) and frontend
  (`npm run dev` in `frontend`) with `VITE_API_URL=http://localhost:5000/api`.

---

## Automatic deployments (every push goes live)

Pushing to `main` redeploys automatically:

```
git push  ->  GitHub (main)  ->  CI build check (.github/workflows/ci.yml)
                                   |
                                   +--> Cloudflare  rebuilds & deploys the frontend
                                   +--> Oracle VM   redeploys the backend
                                        (.github/workflows/deploy-backend.yml,
                                         SSH → git pull → docker build → restart)
```

- **Frontend (Cloudflare Pages):** production branch is `main`; each push publishes.
- **Backend (Oracle VM):** `deploy-backend.yml` fires on pushes to `main` that touch
  `backend/**`, SSHes into the VM, rebuilds the image and restarts the container,
  then health-checks it.

### Safety net (CI)
`.github/workflows/ci.yml` runs on every push and PR to `main`:
- **Frontend:** `npm ci` → `npm run lint` → `npm run build`
- **Backend:** `npm install` → syntax-check all source files → `npm test`

---

## Troubleshooting

Open `https://api.mystudyguide.in/api/health` in a browser and read the JSON:

| What you see | Meaning |
|---|---|
| `{"status":"ok","db":"connected","dbOk":true,...}` and it loads quickly | Backend **and** database are healthy. |
| `{"status":"degraded","db":"disconnected"...}` or `"db":"unreachable"` (HTTP 503) | Backend is up but **can't reach the database** — check the DB isn't paused/over-quota and that network access allows the VM. |
| Page never responds / connection error | The **backend container is down** — SSH to the VM and check `docker logs msg-backend`. |
| The frontend page is blank but the health URL works | Frontend deploy problem — check the latest Cloudflare Pages build logs. |

> The `/api/health` endpoint reports the real database status (`db` / `dbOk`) and
> returns HTTP **503** when the database is unreachable, so you can tell
> backend-down from database-down at a glance.
