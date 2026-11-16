import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
    // Workspace packages have their own vitest configs (map-ui needs jsdom).
    exclude: ["**/node_modules/**", "**/dist/**", "packages/journey/**", "packages/map-ui/**", "packages/journey-data/**", "packages/outages/**", "**/*.a11y.test.tsx"],
  },
});
