import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "api/mastra/utils/file-handler.ts",
        "api/mastra/integrations/notion.ts",
        "api/utils/http.ts",
        "api/utils/slack-security.ts",
        "api/utils/idempotency.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
