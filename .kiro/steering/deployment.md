---
inclusion: always
---

# Auto-deploy on every change

The user wants every requested change (update, add, fix, or modify) to be
**deployed automatically** — no need to ask first.

## How deployment works for this repo

Deployment is driven by GitHub, pushing to `main`:

- **Frontend** → Cloudflare (root dir `frontend`), rebuilt on push to `main`.
- **Backend API** → self-hosted Oracle Cloud VM (root dir `backend`). A push to
  `main` that touches `backend/**` triggers `.github/workflows/deploy-backend.yml`,
  which SSHes into the VM, rebuilds the Docker image, and restarts the container.

## Procedure after making a change

1. Commit the change on a working branch.
2. Fast-forward / merge it into `main`.
3. Push `main` using the push tool (raw `git push` cannot authenticate through
   the gateway — always use the GitHub power's `push_to_remote`).
4. Report the deployed commit SHA and how to verify:
   - Backend health check: `https://api.mystudyguide.in/api/health` → `{"status":"ok"}`;
     the `version` field confirms the new build is live.
   - The frontend redeploys on the Cloudflare side for the pushed commit.

## Notes

- The backend VM runs the container with `--restart always`, so it stays up
  across reboots/crashes and does not cold-start on the first request.
- Frontend and backend deploy independently — if a change touches both, make
  sure both finish before judging the result.
