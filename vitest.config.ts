import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
    exclude: ["packages/journey/**", "packages/map-ui/**", "packages/outages/**"],
  },
});
