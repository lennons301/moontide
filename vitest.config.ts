import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "./src") };
const exclude = ["**/node_modules/**", "**/.worktrees/**"];

// Two projects, split by file extension: `.test.ts` is server/pure logic and
// runs in node, `.test.tsx` renders components and runs in jsdom. The split is
// by extension rather than by directory so a folder can hold both.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
          exclude,
        },
      },
    ],
  },
});
