import { defineConfig } from "vitest/config";

// Dedicated Vitest config for the frontend. The pure helpers under src/lib/*
// have no DOM/React dependencies, so a plain Node environment is enough (fast,
// no jsdom needed). Kept separate from vite.config.js so the app build config
// (manual vendor chunking) stays focused on production bundling.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    globals: false,
    coverage: {
      // `npm run coverage` writes coverage/lcov.info (plus a text summary).
      // Reports coverage for the modules exercised by the suite (the pure
      // helpers in src/lib), which is where the unit tests are focused today.
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      exclude: ["**/*.{test,spec}.{js,jsx}", "src/main.jsx"],
    },
  },
});
