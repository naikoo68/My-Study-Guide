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
  },
});
