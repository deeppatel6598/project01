import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    // Every suite drives real SQLite through better-sqlite3, so these run in
    // Node rather than a DOM shim.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/seed-data.ts", "src/lib/copy.ts"],
    },
  },
});
