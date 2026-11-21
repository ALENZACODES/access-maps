import { defineConfig } from "@playwright/test";

// Reviewer desks and audits run directly from local HTML files.
export default defineConfig({
  testDir: "./tests",
  testMatch: "review-session.spec.ts",
  use: { browserName: "chromium", offline: true },
  retries: 0,
});
