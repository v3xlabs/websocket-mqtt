import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: { label: "node", color: "green" },
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: { label: "browser", color: "blue" },
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
