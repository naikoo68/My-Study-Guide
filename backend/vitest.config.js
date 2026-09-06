import { defineConfig } from "vitest/config";

// Backend test runner. The security tests spin up an in-memory MongoDB
// (mongodb-memory-server) and exercise the REAL Mongoose models + tenantId
// plugin, so they prove actual tenant isolation rather than mocking it.
//
// - Generous timeouts: the first run downloads a mongod binary.
// - fileParallelism off: the isolation suite owns a single shared Mongoose
//   connection, so test files must not run concurrently against it.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
    coverage: {
      // `npm run coverage` writes coverage/lcov.info (plus a text summary).
      // Reports coverage for the modules exercised by the suite (the pure
      // helpers in src/utils plus the code paths the integration tests hit).
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      exclude: ["src/scripts/**", "**/*.test.js"],
    },
  },
});
