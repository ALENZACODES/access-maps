import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "tools/**/*.test.ts", "docs/**/*.test.ts"],
    // Node's test runner owns P15C/P15D/P15E/P15G suites; avoid dual runners.
    exclude: ["**/node_modules/**", "**/dist/**", "packages/journey/**", "packages/map-ui/**", "packages/journey-data/**", "packages/outages/**", "packages/conditions/**", "**/*.a11y.test.tsx", "tools/data-qa/p15c-*.test.ts", "tools/data-qa/p15d-*.test.ts", "tools/data-qa/p15e-*.test.ts", "tools/data-qa/p15g-*.test.ts", "tools/data-qa/p15h-*.test.ts"],
  },
});
