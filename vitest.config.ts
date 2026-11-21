import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "tools/**/*.test.ts", "docs/**/*.test.ts"],
    // These suites use node:test and run once via the root tsx --test command.
    exclude: ["**/node_modules/**", "**/dist/**", "packages/journey/**", "packages/map-ui/**", "packages/journey-data/**", "packages/outages/**", "packages/conditions/**", "**/*.a11y.test.tsx", "tools/data-qa/p15c-*.test.ts", "tools/data-qa/p15d-*.test.ts", "tools/data-qa/p15e-*.test.ts", "tools/data-qa/p15g-*.test.ts", "tools/data-qa/p15h-*.test.ts", "tools/data-qa/p15j-*.test.ts"],
  },
});
