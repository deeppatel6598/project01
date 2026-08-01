import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    // Every suite drives real Postgres, so these run in Node rather than a DOM
    // shim.
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // Test files share one database and each one truncates between cases, so
    // running them in parallel means one file wiping another's fixtures
    // mid-assertion. Serial execution is the cost of testing against a real
    // server instead of a mock, and it is a cost worth paying — the order
    // engine's guarantees are transactional, and a mock would pass while
    // production diverged.
    fileParallelism: false,

    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/seed-data.ts", "src/lib/copy.ts"],
    },
  },
});
