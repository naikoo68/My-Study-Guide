# My Study Guide — Frontend

The React single-page app for the My Study Guide platform: the public site, the
student dashboard, the quiz/test player, and the admin panel. Built with
**React 19 + Vite 8 + Tailwind CSS**, it talks to the [backend API](../backend/README.md)
via the base URL in `VITE_API_URL`.

## Tech Stack

- **React 19** — UI library
- **Vite 8** — dev server & production bundler (with manual vendor chunking)
- **React Router 7** — client-side routing
- **Tailwind CSS 3** — styling
- **Chart.js + react-chartjs-2** — dashboards & analytics charts
- **KaTeX** — math rendering
- **Vitest 4** — unit testing

## Getting Started

```bash
cd frontend
npm install
cp .env.example .env          # set VITE_API_URL=http://localhost:5000/api
npm run dev                   # http://localhost:5173
```

The frontend requires the backend API to be running for real login, content and
analytics. See the [root README](../README.md) for the full local setup.

## Available Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint over the project |
| `npm test` | Run the Vitest unit suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Project Structure

```
src/
├── components/   # reusable UI components
├── pages/        # route-level pages (public, dashboard, admin)
├── context/      # React context providers (auth, theme, settings)
├── services/     # API client wrappers
├── viz/          # chart/visualisation helpers
├── data/         # default/fallback content
└── lib/          # PURE helper modules (fully unit-tested)
```

## Testing

Unit tests live next to the code they cover as `*.test.js` files and run under
[Vitest](https://vitest.dev) in a Node environment (no jsdom needed — the tested
helpers are pure). See [`vitest.config.js`](./vitest.config.js).

```bash
npm test            # run once (used by CI)
npm run test:watch  # re-run on change while developing
```

Current coverage focuses on the pure helpers in `src/lib/`, which hold the
trickiest logic:

- **`shuffleOptions.js`** — deterministic, seeded per-attempt option/question
  shuffling and the invertible display↔original index mappers.
- **`questions.js`** — option display fallbacks, ObjectId-derived dates, search
  relevance scoring and question-type filtering.
- **`features.js`** — admin & public feature-flag resolution (incl. the legacy
  practice-flag fallback).
- **`slug.js`** — URL slug generation.

When adding a new pure helper to `src/lib/`, add a matching `*.test.js` beside
it so the behaviour is locked in and documented by example.
