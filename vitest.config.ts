import path from "node:path";
import { defineConfig } from "vitest/config";
import { integrationDatabaseUrl } from "./tests/integration/support/database-url";

const alias = { "@": path.resolve(__dirname, "./src") };
const ignored = ["**/node_modules/**", "**/.worktrees/**"];

// The admin date helpers format in the runtime timezone, so pin it: otherwise
// their expected strings only hold on a machine that happens to be on UTC.
const env = { TZ: "UTC" };

// Three projects. The mocked suite is split by file extension: `.test.ts` is
// server/pure logic and runs in node, `.test.tsx` renders components and runs
// in jsdom. The split is by extension rather than by directory so a folder can
// hold both. `tests/integration` is the third: node again, but against a real
// throwaway database.
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
          env,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
          exclude: ignored,
          env,
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
          env: { ...env, DATABASE_URL: integrationDatabaseUrl() },
        },
      },
    ],
  },
});
