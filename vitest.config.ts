import path from "node:path";
import { defineConfig } from "vitest/config";
import { integrationDatabaseUrl } from "./tests/integration/support/database-url";

const alias = { "@": path.resolve(__dirname, "./src") };
const ignored = ["**/node_modules/**", "**/.worktrees/**"];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [...ignored, "tests/integration/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          exclude: ignored,
          // Builds and migrates a throwaway database once per run.
          globalSetup: ["tests/integration/support/global-setup.ts"],
          // Empties it before every test.
          setupFiles: ["tests/integration/support/setup.ts"],
          // One database, emptied between tests: files sharing it in parallel
          // would empty each other's rows mid-test.
          fileParallelism: false,
          // The code under test reads DATABASE_URL when it is imported, so the
          // singleton client can only ever reach the throwaway database.
          env: { DATABASE_URL: integrationDatabaseUrl() },
        },
      },
    ],
  },
});
